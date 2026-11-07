import type { Alarm, SatelliteSummary, Telemetry } from '../types/api';

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
];

export const mockAlarms: Alarm[] = [
  { id: '31', satId: 'SAT-004', ts: '2026-11-07T08:58:40.000Z', type: 'TEMP_HIGH', severity: 'CRITICAL', value: 60.4, threshold: 60, message: 'TEMP_HIGH: 60.4°C (임계값 60°C)', receivedAt: '2026-11-07T08:58:40.020Z' },
  { id: '30', satId: 'SAT-003', ts: '2026-11-07T08:51:12.000Z', type: 'BATTERY_LOW', severity: 'CRITICAL', value: 19.8, threshold: 20, message: 'BATTERY_LOW: 19.8% (임계값 20%)', receivedAt: '2026-11-07T08:51:12.015Z' },
  { id: '29', satId: 'SAT-005', ts: '2026-11-07T08:32:05.000Z', type: 'TEMP_LOW', severity: 'WARNING', value: -30.6, threshold: -30, message: 'TEMP_LOW: -30.6°C (임계값 -30°C)', receivedAt: '2026-11-07T08:32:05.011Z' },
];
