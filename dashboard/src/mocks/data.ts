import type { RangeKey } from '../lib/ranges';
import type { Alarm, BatteryPoint, SatelliteSummary, Telemetry } from '../types/api';

/** 하드코딩 목업. 나중에 GET /satellites, GET /alarms 응답으로 바꾼다 */

function tm(satId: string, id: string, v: Pick<Telemetry, 'battery' | 'temp' | 'rssi' | 'mode' | 'sunlit'>): Telemetry {
  return {
    id,
    satId,
    ts: '2026-11-07T09:00:00.000Z',
    receivedAt: '2026-11-07T09:00:00.012Z',
    insertedAt: '2026-11-07T09:00:00.150Z',
    ...v,
  };
}

const createdAt = '2026-11-07T08:00:00.000Z';

export const mockSatellites: SatelliteSummary[] = [
  // 정상 + 교신 중
  { id: 'SAT-001', name: null, createdAt, latestTelemetry: tm('SAT-001', '1001', { battery: 76.5, temp: 21.3, rssi: -92.4, mode: 'NORMAL', sunlit: true }) },
  // 정상
  { id: 'SAT-002', name: null, createdAt, latestTelemetry: tm('SAT-002', '1002', { battery: 64.2, temp: 12.8, rssi: null, mode: 'NORMAL', sunlit: true }) },
  // 경고: SAFE + 배터리 < 20
  { id: 'SAT-003', name: null, createdAt, latestTelemetry: tm('SAT-003', '1003', { battery: 15.2, temp: -12.4, rssi: null, mode: 'SAFE', sunlit: false }) },
  // 교신 중, 온도 높음 (알람은 있지만 경고 기준에는 해당 안 됨)
  { id: 'SAT-004', name: null, createdAt, latestTelemetry: tm('SAT-004', '1004', { battery: 55.0, temp: 62.1, rssi: -101.7, mode: 'NORMAL', sunlit: true }) },
  // 정상, 그늘 구간
  { id: 'SAT-005', name: null, createdAt, latestTelemetry: tm('SAT-005', '1005', { battery: 41.9, temp: -5.6, rssi: null, mode: 'NORMAL', sunlit: false }) },
  // 텔레메트리 없음
  { id: 'SAT-006', name: null, createdAt, latestTelemetry: null },
  // 경고: NORMAL 이지만 배터리 < 20 (경고 조건의 다른 갈래)
  { id: 'SAT-007', name: null, createdAt, latestTelemetry: tm('SAT-007', '1007', { battery: 18.4, temp: 8.2, rssi: null, mode: 'NORMAL', sunlit: false }) },
];

export const mockAlarms: Alarm[] = [
  { id: '31', satId: 'SAT-004', ts: '2026-11-07T08:58:40.000Z', type: 'TEMP_HIGH', severity: 'CRITICAL', value: 60.4, threshold: 60, message: 'TEMP_HIGH: 60.4°C (임계값 60°C)', receivedAt: '2026-11-07T08:58:40.020Z' },
  { id: '30', satId: 'SAT-003', ts: '2026-11-07T08:51:12.000Z', type: 'BATTERY_LOW', severity: 'CRITICAL', value: 19.8, threshold: 20, message: 'BATTERY_LOW: 19.8% (임계값 20%)', receivedAt: '2026-11-07T08:51:12.015Z' },
  { id: '29', satId: 'SAT-005', ts: '2026-11-07T08:32:05.000Z', type: 'TEMP_LOW', severity: 'WARNING', value: -30.6, threshold: -30, message: 'TEMP_LOW: -30.6°C (임계값 -30°C)', receivedAt: '2026-11-07T08:32:05.011Z' },
];

/** [min, max, avg] 배열을 start부터 stepSec 간격의 BatteryPoint 배열로 */
function series(start: number, stepSec: number, values: [number, number, number][]): BatteryPoint[] {
  return values.map(([min, max, avg], i) => ({
    t: new Date(start + i * stepSec * 1000).toISOString(),
    min,
    max,
    avg,
  }));
}

/**
 * 선택 위성 배터리 차트 목업 (기간별). 나중에 GET /satellites/:id/telemetry/summary 응답으로 교체.
 * 위성과 무관하게 같은 데이터를 쓴다.
 */
export const mockBatterySeriesByRange: Record<RangeKey, BatteryPoint[]> = {
  // 최근 1분: 5초 구간 12개
  '1m': series(Date.UTC(2026, 10, 7, 8, 59, 0), 5, [
    [76.0, 76.4, 76.2], [76.1, 76.5, 76.3], [76.2, 76.6, 76.4], [76.2, 76.7, 76.5],
    [76.3, 76.8, 76.6], [76.4, 76.8, 76.6], [76.4, 76.9, 76.7], [76.5, 77.0, 76.8],
    [76.5, 77.1, 76.8], [76.6, 77.1, 76.9], [76.7, 77.2, 77.0], [76.8, 77.3, 77.1],
  ]),
  // 최근 1시간: 5분 구간 12개
  '1h': series(Date.UTC(2026, 10, 7, 8, 5), 300, [
    [70.1, 72.4, 71.2], [71.0, 73.8, 72.5], [72.6, 75.1, 73.9], [73.9, 76.2, 75.0],
    [74.8, 77.0, 76.0], [75.2, 77.9, 76.6], [74.1, 76.8, 75.5], [72.0, 75.0, 73.4],
    [70.3, 73.1, 71.6], [71.8, 74.9, 73.2], [73.5, 76.4, 75.1], [75.0, 77.6, 76.5],
  ]),
  // 최근 24시간: 1시간 구간 24개 (그늘 구간에서 내려갔다 올라옴)
  '24h': series(Date.UTC(2026, 10, 6, 9), 3600, [
    [55.2, 68.4, 61.9], [52.8, 66.1, 59.3], [41.5, 60.2, 50.7], [33.0, 52.4, 42.8],
    [27.6, 45.9, 36.1], [24.3, 40.8, 31.9], [28.9, 47.5, 38.0], [36.4, 58.2, 47.1],
    [45.0, 66.7, 56.3], [52.9, 73.0, 63.4], [58.1, 78.4, 68.8], [61.7, 81.0, 72.2],
    [57.4, 77.3, 67.9], [49.6, 70.5, 60.1], [40.2, 62.8, 51.4], [30.7, 53.1, 41.6],
    [22.5, 44.0, 32.8], [18.9, 37.6, 27.4], [21.4, 42.3, 31.0], [30.8, 54.6, 42.9],
    [42.1, 65.0, 54.2], [53.6, 72.8, 63.7], [62.0, 78.9, 70.8], [70.1, 77.6, 74.4],
  ]),
};
