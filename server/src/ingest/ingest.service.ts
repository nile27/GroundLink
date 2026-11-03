import { Injectable, Logger, OnApplicationShutdown, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TopicFilters,
  parseTopic,
  isAlarmMessage,
  isCommandAckMessage,
  isEventMessage,
  isTelemetryMessage,
  type TopicKind,
} from '@groundlink/shared';
import { Alarm, SatEvent, Satellite } from '../database/entities';
import { MqttService } from '../mqtt/mqtt.service';
import { CommandsService } from '../commands/commands.service';
import { IngestMetricsService } from '../metrics/ingest-metrics.service';
import { TelemetryWriterService } from './telemetry-writer.service';

type StoredKind = Exclude<TopicKind, 'cmd'>;

const RATE_LOG_INTERVAL_MS = 10_000;

/**
 * MQTT 메시지를 받아 DB에 저장한다.
 *
 * - 텔레메트리: TelemetryWriterService 버퍼에 넣고 일괄 저장 (개선 A)
 * - event·alarm·cmd ack: 건수가 적어 지금처럼 1건씩 즉시 저장
 */
@Injectable()
export class IngestService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(IngestService.name);

  /** satellites 테이블에 등록이 끝난(또는 진행 중인) 위성. 동시에 온 첫 메시지들이 중복 INSERT 하지 않게 Promise를 보관 */
  private readonly registered = new Map<string, Promise<void>>();

  private readonly window = this.emptyCounts();
  private readonly total = this.emptyCounts();
  private dropped = 0;
  private failed = 0;
  private rateTimer: NodeJS.Timeout;

  constructor(
    private readonly mqtt: MqttService,
    private readonly commands: CommandsService,
    private readonly metrics: IngestMetricsService,
    private readonly writer: TelemetryWriterService,
    @InjectRepository(Satellite) private readonly satellites: Repository<Satellite>,
    @InjectRepository(SatEvent) private readonly events: Repository<SatEvent>,
    @InjectRepository(Alarm) private readonly alarms: Repository<Alarm>,
  ) {}

  async onModuleInit(): Promise<void> {
    // 이미 등록된 위성 목록을 불러와 재시작 후 중복 등록을 피한다
    const existing = await this.satellites.find({ select: { id: true } });
    for (const s of existing) this.registered.set(s.id, Promise.resolve());

    await this.mqtt.subscribe(
      [TopicFilters.telemetry, TopicFilters.event, TopicFilters.alarm, TopicFilters.cmdAck],
      (topic, payload) => void this.handle(topic, payload),
    );
    this.rateTimer = setInterval(() => this.logRate(), RATE_LOG_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.rateTimer);
  }

  /** 버퍼 저장(beforeApplicationShutdown)이 끝난 뒤에 최종 누적을 남긴다 */
  onApplicationShutdown(): void {
    this.total.telemetry = this.metrics.committedTotal;
    this.logger.log(`최종 누적 저장: ${this.format(this.total)} | 버림 ${this.dropped}, 실패 ${this.failed + this.metricsFailed()}`);
  }

  private metricsFailed(): number {
    return this.metrics.snapshot().telemetry.failed;
  }

  private async handle(topic: string, payload: Buffer): Promise<void> {
    // 지연 측정 기준점: 파싱·검증·위성 등록보다 먼저 기록
    const receivedAt = new Date();
    const parsed = parseTopic(topic);
    if (!parsed || parsed.kind === 'cmd') return;

    let msg: unknown;
    try {
      msg = JSON.parse(payload.toString());
    } catch {
      this.drop(topic, 'JSON 파싱 실패');
      return;
    }

    try {
      switch (parsed.kind) {
        case 'telemetry':
          if (!isTelemetryMessage(msg) || msg.satId !== parsed.satId) return this.drop(topic, '형식 오류');
          this.metrics.telemetryReceived();
          await this.ensureSatellite(msg.satId);
          this.writer.enqueue(
            {
              satId: msg.satId,
              ts: new Date(msg.ts),
              battery: msg.battery,
              temp: msg.temp,
              rssi: msg.rssi,
              mode: msg.mode,
              sunlit: msg.sunlit,
              receivedAt,
            },
            receivedAt.getTime(),
            msg.ts,
          );
          return; // 저장 건수는 커밋 후 지표(IngestMetricsService)에서 센다

        case 'event':
          if (!isEventMessage(msg) || msg.satId !== parsed.satId) return this.drop(topic, '형식 오류');
          await this.ensureSatellite(msg.satId);
          await this.events.insert({
            satId: msg.satId,
            ts: new Date(msg.ts),
            type: msg.type,
            detail: msg.detail ?? null,
          });
          break;

        case 'alarm':
          if (!isAlarmMessage(msg) || msg.satId !== parsed.satId) return this.drop(topic, '형식 오류');
          await this.ensureSatellite(msg.satId);
          await this.alarms.insert({
            satId: msg.satId,
            ts: new Date(msg.ts),
            type: msg.type,
            severity: msg.severity,
            value: msg.value,
            threshold: msg.threshold,
            message: msg.message,
          });
          break;

        case 'cmdAck':
          if (!isCommandAckMessage(msg) || msg.satId !== parsed.satId) return this.drop(topic, '형식 오류');
          if (!(await this.commands.applyAck(msg))) return; // 모르는 cmdId는 저장 건수에서 제외
          break;
      }
      this.count(parsed.kind);
    } catch (err) {
      // 텔레메트리 실패는 지표 쪽에서 센다 (일괄 저장 실패와 합산)
      if (parsed.kind === 'telemetry') this.metrics.telemetryFailed(); // 위성 등록 실패 등
      else this.failed++;
      this.logger.error(`저장 실패 (${topic}): ${(err as Error).message}`);
    }
  }

  /** 처음 보는 위성이면 satellites 테이블에 등록 */
  private ensureSatellite(satId: string): Promise<void> {
    let pending = this.registered.get(satId);
    if (!pending) {
      pending = this.satellites
        .createQueryBuilder()
        .insert()
        .into(Satellite)
        .values({ id: satId })
        .orIgnore()
        .execute()
        .then(() => this.logger.log(`새 위성 등록: ${satId}`));
      // 실패하면 다음 메시지에서 다시 시도하도록 기록을 지운다
      pending.catch(() => this.registered.delete(satId));
      this.registered.set(satId, pending);
    }
    return pending;
  }

  private drop(topic: string, reason: string): void {
    this.dropped++;
    this.logger.warn(`메시지 버림 (${topic}): ${reason}`);
  }

  private count(kind: StoredKind): void {
    this.window[kind]++;
    this.total[kind]++;
  }

  private logRate(): void {
    const sec = RATE_LOG_INTERVAL_MS / 1000;
    const sum = Object.values(this.window).reduce((a, b) => a + b, 0);
    const perSec = (n: number) => (n / sec).toFixed(1);
    const win = this.metrics.takeWindow();
    this.window.telemetry = win.committed;
    this.total.telemetry = this.metrics.committedTotal;
    const w = win.receiveToCommit;
    this.logger.log(
      `[rate] 저장 ${perSec(sum)} rows/s ` +
        `(telemetry ${perSec(this.window.telemetry)}, event ${perSec(this.window.event)}, ` +
        `alarm ${perSec(this.window.alarm)}, ack ${perSec(this.window.cmdAck)}) | ` +
        `누적 ${this.format(this.total)} | 버림 ${this.dropped}, 실패 ${this.failed + this.metricsFailed()} | ` +
        `버퍼 ${this.writer.bufferSize} (저장 중 ${this.writer.inflightFlushes}) | ` +
        `역압 버림 ${win.dropped} (누적 ${win.droppedTotal}) | ` +
        `수신→커밋 p50 ${w.p50 ?? '-'}ms p99 ${w.p99 ?? '-'}ms max ${w.max ?? '-'}ms`,
    );
    for (const k of Object.keys(this.window) as StoredKind[]) this.window[k] = 0;
  }

  private format(c: Record<StoredKind, number>): string {
    return `telemetry=${c.telemetry} event=${c.event} alarm=${c.alarm} ack=${c.cmdAck}`;
  }

  private emptyCounts(): Record<StoredKind, number> {
    return { telemetry: 0, event: 0, alarm: 0, cmdAck: 0 };
  }
}
