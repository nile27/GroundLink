import type { BatteryPoint } from '../types/api';

export interface RangeSummary {
  min: number;
  max: number;
  avg: number;
}

/**
 * 차트 구간들로 전체 최소·최대·평균을 계산한다.
 * 평균은 구간 평균들의 단순 평균 (구간별 샘플 수는 목업에 없음). 데이터가 없으면 null
 */
export function summarize(points: BatteryPoint[]): RangeSummary | null {
  if (points.length === 0) return null;
  return {
    min: Math.min(...points.map((p) => p.min)),
    max: Math.max(...points.map((p) => p.max)),
    avg: points.reduce((sum, p) => sum + p.avg, 0) / points.length,
  };
}
