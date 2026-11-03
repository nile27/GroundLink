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

  private readonly total = { receiveToCommit: new LatencyHistogram(), publishToCommit: new LatencyHistogram() };
  /** 10초 로그용 구간 히스토그램 (takeWindow()로 읽고 비운다) */
  private readonly window = { receiveToCommit: new LatencyHistogram() };

  telemetryReceived(n = 1): void {
    this.received += n;
  }

  /** 커밋 완료 직후 호출. receivedAt·publishedAt은 epoch ms */
  telemetryCommitted(receivedAt: number, publishedAt: number, committedAt = Date.now()): void {
    this.committed++;
    this.total.receiveToCommit.record(committedAt - receivedAt);
    this.window.receiveToCommit.record(committedAt - receivedAt);
    this.total.publishToCommit.record(committedAt - publishedAt);
  }

  telemetryFailed(n = 1): void {
    this.failed += n;
  }

  takeWindow(): { receiveToCommit: LatencySummary } {
    const s = { receiveToCommit: this.window.receiveToCommit.summary() };
    this.window.receiveToCommit.reset();
    return s;
  }

  snapshot(): IngestMetricsSnapshot {
    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSec: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      telemetry: { received: this.received, committed: this.committed, failed: this.failed },
      latencyMs: {
        receiveToCommit: this.total.receiveToCommit.summary(),
        publishToCommit: this.total.publishToCommit.summary(),
      },
    };
  }
}
