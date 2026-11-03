/**
 * 지연 히스토그램 (로그 구간). 값을 전부 보관하지 않고 구간별 개수만 센다.
 * 구간 폭은 약 2%라서 백분위 오차도 약 2% 이내. 범위 0.01 ms ~ 약 1시간.
 */
const MIN_MS = 0.01;
const GROWTH = 1.02;
const LOG_GROWTH = Math.log(GROWTH);
const BUCKETS = Math.ceil(Math.log(3_600_000 / MIN_MS) / LOG_GROWTH) + 1;

export interface LatencySummary {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  avg: number | null;
}

export class LatencyHistogram {
  private readonly counts = new Uint32Array(BUCKETS);
  private count = 0;
  private sum = 0;
  private maxMs = 0;

  record(ms: number): void {
    const v = Math.max(ms, MIN_MS);
    const idx = Math.min(BUCKETS - 1, Math.floor(Math.log(v / MIN_MS) / LOG_GROWTH));
    this.counts[idx]++;
    this.count++;
    this.sum += v;
    if (v > this.maxMs) this.maxMs = v;
  }

  /** 백분위 (구간 상한값으로 보고) */
  percentile(p: number): number | null {
    if (this.count === 0) return null;
    const target = Math.ceil(p * this.count);
    let seen = 0;
    for (let i = 0; i < BUCKETS; i++) {
      seen += this.counts[i];
      if (seen >= target) return Math.min(MIN_MS * GROWTH ** (i + 1), this.maxMs);
    }
    return this.maxMs;
  }

  summary(): LatencySummary {
    const r = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
    return {
      count: this.count,
      p50: r(this.percentile(0.5)),
      p95: r(this.percentile(0.95)),
      p99: r(this.percentile(0.99)),
      max: r(this.count ? this.maxMs : null),
      avg: r(this.count ? this.sum / this.count : null),
    };
  }

  reset(): void {
    this.counts.fill(0);
    this.count = 0;
    this.sum = 0;
    this.maxMs = 0;
  }
}
