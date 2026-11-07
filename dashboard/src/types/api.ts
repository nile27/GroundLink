/**
 * 서버 REST 응답 타입. openapi.d.ts(생성 파일, npm run gen:api -w dashboard)의 별칭.
 * 손으로 고치지 말고 서버 Swagger 데코레이터를 고친 뒤 다시 생성한다.
 */
import type { components } from './openapi';

type Schemas = components['schemas'];

/** GET /satellites 의 latestTelemetry */
export type Telemetry = Schemas['Telemetry'];
/** GET /satellites 항목 */
export type SatelliteSummary = Schemas['SatelliteSummaryDto'];
/** GET /satellites/stats */
export type SatelliteStats = Schemas['SatelliteStatsDto'];
/** GET /alarms 항목 */
export type Alarm = Schemas['Alarm'];
/** GET /satellites/:id/telemetry/summary 항목 (배터리 차트 한 점) */
export type BatteryPoint = Schemas['TelemetrySummaryPointDto'];
/** POST /satellites/:id/commands 요청 본문 */
export type CreateCommand = Schemas['CreateCommandDto'];
/** POST /satellites/:id/commands 응답 */
export type Command = Schemas['Command'];

export type SatMode = Telemetry['mode'];
export type AlarmType = Alarm['type'];
export type AlarmSeverity = Alarm['severity'];
