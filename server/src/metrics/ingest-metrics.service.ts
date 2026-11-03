import { Injectable } from '@nestjs/common';
import { LatencyHistogram, type LatencySummary } from './latency-histogram';

export interface IngestMetricsSnapshot {
  startedAt: string;
  uptimeSec: number;
  telemetry: {
    /** 서버가 받은 텔레메트리 메시지 (형식 검증 통과) */
    received: number;
    /** DB 커밋까지 끝난 행 */
    committed: number;
    /** 저장 실패 행 */
    failed: number;
    /** 역압으로 버린 행 (버퍼가 MAX_BUFFER에 찼을 때) */
    dropped: number;
  };
  buffer: {
    /** 버퍼 상한 (MAX_BUFFER) */
    limit: number | null;
    /** 상한 초과 시 정책 (OVERFLOW_POLICY) */
    overflowPolicy: string | null;
    /** 현재 저장 대기 행 수 */
    size: number;
    /** 시작 이후 최대 저장 대기 행 수 */
    maxSize: number;
  };
  flush: {
    /** 다중 행 INSERT 횟수 */
    count: number;
    /** INSERT 1회당 평균 행 수 */
    avgRows: number | null;
  };
  latencyMs: {
    /** 서버 수신 → INSERT 커밋 완료 (서버 시계만 사용) */
    receiveToCommit: LatencySummary;
    /** 위성 발행(ts) → INSERT 커밋 완료 (같은 호스트에서 돌 때만 의미 있음) */
    publishToCommit: LatencySummary;
  };
}

/**
 * 수집 경로의 애플리케이션 지표.
 * DB 컬럼(inserted_at = 트랜잭션 시작 시각)으로는 커밋 시간을 알 수 없어서,
 * INSERT 커밋이 끝난 뒤 서버에서 직접 잰다.
 */
@Injectable()
export class IngestMetricsService {
  private readonly startedAt = new Date();
  private received = 0;
  private committed = 0;
  private failed = 0;
  private buffered = 0;
  private maxBuffered = 0;
  private flushes = 0;
  private flushedRows = 0;
  private windowCommitted = 0;
  private dropped = 0;
  private windowDropped = 0;
  private bufferLimit: number | null = null;
  private overflowPolicy: string | null = null;

  private readonly total = { receiveToCommit: new LatencyHistogram(), publishToCommit: new LatencyHistogram() };
  /** 10초 로그용 구간 히스토그램 (takeWindow()로 읽고 비운다) */
  private readonly window = { receiveToCommit: new LatencyHistogram() };

  telemetryReceived(n = 1): void {
    this.received += n;
  }

  /** 커밋 완료 직후 호출. receivedAt·publishedAt은 epoch ms */
  telemetryCommitted(receivedAt: number, publishedAt: number, committedAt = Date.now()): void {
    this.committed++;
    this.windowCommitted++;
    this.total.receiveToCommit.record(committedAt - receivedAt);
    this.window.receiveToCommit.record(committedAt - receivedAt);
    this.total.publishToCommit.record(committedAt - publishedAt);
  }

  telemetryFailed(n = 1): void {
    this.failed += n;
  }

  configureBuffer(limit: number, policy: string): void {
    this.bufferLimit = limit;
    this.overflowPolicy = policy;
  }

  telemetryDropped(n = 1): void {
    this.dropped += n;
    this.windowDropped += n;
  }

  bufferSize(n: number): void {
    this.buffered = n;
    if (n > this.maxBuffered) this.maxBuffered = n;
  }

  flushed(rows: number): void {
    this.flushes++;
    this.flushedRows += rows;
  }

  get committedTotal(): number {
    return this.committed;
  }

  get bufferedNow(): number {
    return this.buffered;
  }

  /** 10초 로그용: 구간 커밋 건수와 수신→커밋 지연을 읽고 비운다 */
  takeWindow(): { committed: number; dropped: number; droppedTotal: number; receiveToCommit: LatencySummary } {
    const s = {
      committed: this.windowCommitted,
      dropped: this.windowDropped,
      droppedTotal: this.dropped,
      receiveToCommit: this.window.receiveToCommit.summary(),
    };
    this.window.receiveToCommit.reset();
    this.windowCommitted = 0;
    this.windowDropped = 0;
    return s;
  }

  snapshot(): IngestMetricsSnapshot {
    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSec: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      telemetry: { received: this.received, committed: this.committed, failed: this.failed, dropped: this.dropped },
      buffer: { limit: this.bufferLimit, overflowPolicy: this.overflowPolicy, size: this.buffered, maxSize: this.maxBuffered },
      flush: { count: this.flushes, avgRows: this.flushes ? Math.round((this.flushedRows / this.flushes) * 10) / 10 : null },
      latencyMs: {
        receiveToCommit: this.total.receiveToCommit.summary(),
        publishToCommit: this.total.publishToCommit.summary(),
      },
    };
  }
}
