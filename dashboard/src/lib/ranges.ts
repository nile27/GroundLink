/** 차트 기간 선택 */
export type RangeKey = '1m' | '1h' | '24h';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: '1m', label: '최근 1분' },
  { key: '1h', label: '1시간' },
  { key: '24h', label: '24시간' },
];
