/** 차트 기간 선택 */
export type RangeKey = '1m' | '1h' | '24h';

export interface RangeOption {
  key: RangeKey;
  label: string;
  /** 기간 길이 (초): from = 현재 - seconds */
  seconds: number;
  /** summary API 의 bucketSeconds */
  bucketSeconds: number;
}

export const RANGES: RangeOption[] = [
  { key: '1m', label: '최근 1분', seconds: 60, bucketSeconds: 5 },
  { key: '1h', label: '1시간', seconds: 3600, bucketSeconds: 60 },
  { key: '24h', label: '24시간', seconds: 86400, bucketSeconds: 900 },
];
