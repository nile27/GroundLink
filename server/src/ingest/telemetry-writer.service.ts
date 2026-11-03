import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Telemetry } from '../database/entities';
import { readPoolSize } from '../database/typeorm-options';
import { IngestMetricsService } from '../metrics/ingest-metrics.service';
import { PendingQueue } from './pending-queue';

export type TelemetryRow = Pick<
  Telemetry,
  'satId' | 'ts' | 'battery' | 'temp' | 'rssi' | 'mode' | 'sunlit' | 'receivedAt'
>;

interface Pending {
  row: TelemetryRow;
  receivedAtMs: number;
  publishedAtMs: number;
}

export const OVERFLOW_POLICIES = ['drop-oldest', 'drop-newest'] as const;
export type OverflowPolicy = (typeof OVERFLOW_POLICIES)[number];

/**
 * MAX_BUFFER 기본값 근거는 docs/perf-improvements.md "개선 B" 참고.
 */
const DEFAULTS = { batchSize: 500, flushMs: 200, maxBuffer: 50000, overflowPolicy: 'drop-oldest' as OverflowPolicy };

/**
 * 텔레메트리 일괄 저장.
 * 메모리 버퍼에 모았다가 BATCH_SIZE건이 차거나 FLUSH_MS가 지나면(먼저 오는 쪽)
 * TypeORM 다중 행 insert 1건(INSERT ... VALUES (...), (...), ...)으로 저장한다.
 *
 * 동시에 진행하는 저장(flush)은 커넥션 풀 크기 - 2개까지만 허용한다.
 * 나머지 커넥션은 event·alarm·command 즉시 저장과 API 조회용으로 남긴다.
 * 동시 저장이 한도에 차면 행은 버퍼에 남는다. 그래서 "저장 대기"는 버퍼 크기 하나로 보인다.
 *
 * 역압 (개선 B): 버퍼가 MAX_BUFFER에 차면 OVERFLOW_POLICY에 따라 버린다.
 * - drop-oldest (기본): 가장 오래된 행을 버리고 새 행을 넣는다. 저장되는 데이터가 최신에 가깝다
 * - drop-newest: 새로 들어온 행을 버린다. 이미 받은 순서대로 저장되지만 최신 상태가 늦게 보인다
 * 버린 건수는 지표(/metrics/ingest)와 10초 로그에 남는다.
 */
@Injectable()
export class TelemetryWriterService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(TelemetryWriterService.name);
  private readonly batchSize: number;
  private readonly flushMs: number;
  private readonly maxConcurrentFlushes: number;
  private readonly maxBuffer: number;
  private readonly overflowPolicy: OverflowPolicy;

  private readonly buffer = new PendingQueue<Pending>();
  private timer: NodeJS.Timeout | null = null;
  private inflight = 0;
  private readonly inflightDone = new Set<() => void>();

  constructor(
    config: ConfigService,
    private readonly metrics: IngestMetricsService,
    @InjectRepository(Telemetry) private readonly telemetry: Repository<Telemetry>,
  ) {
    this.batchSize = readPositiveInt(config, 'BATCH_SIZE', DEFAULTS.batchSize);
    this.flushMs = readPositiveInt(config, 'FLUSH_MS', DEFAULTS.flushMs);
    this.maxConcurrentFlushes = Math.max(1, readPoolSize((key) => config.get<string>(key)) - 2);
    this.maxBuffer = readPositiveInt(config, 'MAX_BUFFER', DEFAULTS.maxBuffer);
    const policy = config.get<string>('OVERFLOW_POLICY')?.trim() || DEFAULTS.overflowPolicy;
    if (!(OVERFLOW_POLICIES as readonly string[]).includes(policy)) {
      throw new Error(`OVERFLOW_POLICY=${policy} 가 올바르지 않습니다 (${OVERFLOW_POLICIES.join(' | ')})`);
    }
    this.overflowPolicy = policy as OverflowPolicy;
    this.metrics.configureBuffer(this.maxBuffer, this.overflowPolicy);
    this.logger.log(
      `일괄 저장: BATCH_SIZE=${this.batchSize}, FLUSH_MS=${this.flushMs}, 동시 저장 최대 ${this.maxConcurrentFlushes} | ` +
        `역압: MAX_BUFFER=${this.maxBuffer}, OVERFLOW_POLICY=${this.overflowPolicy}`,
    );
  }

  get bufferSize(): number {
    return this.buffer.length;
  }

  get inflightFlushes(): number {
    return this.inflight;
  }

  enqueue(row: TelemetryRow, receivedAtMs: number, publishedAtMs: number): void {
    if (this.buffer.length >= this.maxBuffer) {
      this.metrics.telemetryDropped(1);
      if (this.overflowPolicy === 'drop-newest') return;
      this.buffer.dropFront(1);
    }
    this.buffer.push({ row, receivedAtMs, publishedAtMs });
    this.metrics.bufferSize(this.buffer.length);
    this.schedule();
  }

  /** 종료 시: MQTT가 닫힌 뒤(onModuleDestroy 이후), DB가 닫히기 전에 호출된다 */
  async beforeApplicationShutdown(): Promise<void> {
    const left = this.buffer.length;
    this.clearTimer();
    while (this.buffer.length > 0 || this.inflight > 0) {
      while (this.buffer.length > 0 && this.inflight < this.maxConcurrentFlushes) this.startFlush();
      await new Promise<void>((resolve) => this.inflightDone.add(resolve));
    }
    this.logger.log(`종료 전 버퍼 저장 완료: ${left}건`);
  }

  /** 꽉 찬 배치는 바로, 덜 찬 배치는 FLUSH_MS 뒤에 저장 */
  private schedule(): void {
    while (this.buffer.length >= this.batchSize && this.inflight < this.maxConcurrentFlushes) {
      this.startFlush();
    }
    if (this.buffer.length > 0 && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.buffer.length > 0 && this.inflight < this.maxConcurrentFlushes) this.startFlush();
        this.schedule();
      }, this.flushMs);
    } else if (this.buffer.length === 0) {
      this.clearTimer();
    }
  }

  private startFlush(): void {
    const batch = this.buffer.take(this.batchSize);
    this.metrics.bufferSize(this.buffer.length);
    this.inflight++;
    void this.flush(batch).finally(() => {
      this.inflight--;
      for (const done of this.inflightDone) done();
      this.inflightDone.clear();
      this.schedule();
    });
  }

  private async flush(batch: Pending[]): Promise<void> {
    const startedAt = performance.now();
    try {
      await this.telemetry.insert(batch.map((p) => p.row));
      const committedAt = Date.now();
      for (const p of batch) this.metrics.telemetryCommitted(p.receivedAtMs, p.publishedAtMs, committedAt);
      this.metrics.flushed(batch.length, performance.now() - startedAt);
    } catch (err) {
      this.metrics.telemetryFailed(batch.length);
      this.logger.error(`텔레메트리 ${batch.length}건 일괄 저장 실패: ${(err as Error).message}`);
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function readPositiveInt(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${key}=${raw} 가 올바르지 않습니다 (양의 정수)`);
  return n;
}
