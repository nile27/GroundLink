/**
 * 서버 REST 응답 타입 (목업용). 필드명은 서버 코드 기준:
 * - Telemetry:        server/src/database/entities/telemetry.entity.ts
 * - SatelliteSummary: server/src/satellites/dto/satellite-summary.dto.ts (GET /satellites)
 * - Alarm:            server/src/database/entities/alarm.entity.ts      (GET /alarms)
 * JSON으로 오므로 Date 컬럼은 ISO 8601 문자열, bigint id는 문자열.
 */

export type SatMode = 'NORMAL' | 'SAFE';
export type AlarmType = 'BATTERY_LOW' | 'TEMP_HIGH' | 'TEMP_LOW';
export type AlarmSeverity = 'WARNING' | 'CRITICAL';

export interface Telemetry {
  id: string;
  satId: string;
  ts: string;
  battery: number;
  temp: number;
  rssi: number | null;
  mode: SatMode;
  sunlit: boolean;
  receivedAt: string | null;
  insertedAt: string;
}

export interface SatelliteSummary {
  id: string;
  name: string | null;
  createdAt: string;
  latestTelemetry: Telemetry | null;
}

export interface Alarm {
  id: string;
  satId: string;
  ts: string;
  type: AlarmType;
  severity: AlarmSeverity;
  value: number;
  threshold: number;
  message: string;
  receivedAt: string;
}

/**
 * 배터리 차트 한 점 (구간 요약). 아직 서버에 없는 응답 형태 — summary API를 만들 때 맞출 것.
 * t: 구간 시작 시각 (ISO 8601), min/max/avg: 구간 안 배터리 (%)
 */
export interface BatteryPoint {
  t: string;
  min: number;
  max: number;
  avg: number;
}
