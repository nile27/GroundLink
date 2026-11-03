/**
 * MQTT 메시지 페이로드 타입 (JSON 직렬화).
 * 모든 ts는 epoch milliseconds (UTC).
 */

// ---------- 열거 값 ----------

export const SAT_MODES = ['NORMAL', 'SAFE'] as const;
export type SatMode = (typeof SAT_MODES)[number];

export const EVENT_TYPES = [
  'CONTACT_START', // 교신 시작 (지상국 가시권 진입)
  'CONTACT_END', // 교신 종료
  'MODE_CHANGE', // 운용 모드 변경
  'ECLIPSE_ENTER', // 그림자 구간 진입
  'ECLIPSE_EXIT', // 그림자 구간 이탈 (햇빛)
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ALARM_TYPES = ['BATTERY_LOW', 'TEMP_HIGH', 'TEMP_LOW'] as const;
export type AlarmType = (typeof ALARM_TYPES)[number];

export const ALARM_SEVERITIES = ['WARNING', 'CRITICAL'] as const;
export type AlarmSeverity = (typeof ALARM_SEVERITIES)[number];

export const COMMAND_TYPES = ['SET_MODE'] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

/** MODE_CHANGE 이벤트의 변경 사유 */
export type ModeChangeReason = 'AUTO_LOW_BATTERY' | 'COMMAND';

// ---------- 메시지 ----------

/** sat/{id}/telemetry */
export interface TelemetryMessage {
  satId: string;
  /** epoch ms */
  ts: number;
  /** 배터리 잔량 (%) 0~100 */
  battery: number;
  /** 온도 (°C) */
  temp: number;
  /** 수신 신호 세기 (dBm). 교신 중이 아니면 null */
  rssi: number | null;
  mode: SatMode;
  /** 햇빛 구간 여부 */
  sunlit: boolean;
}

/** sat/{id}/event — 상태가 바뀔 때만 발행 */
export interface EventMessage {
  satId: string;
  ts: number;
  type: EventType;
  /** 부가 정보. MODE_CHANGE: { from, to, reason } */
  detail?: Record<string, string | number | boolean | null>;
}

/** sat/{id}/alarm — 임계값을 넘는 순간에 한 번 발행 */
export interface AlarmMessage {
  satId: string;
  ts: number;
  type: AlarmType;
  severity: AlarmSeverity;
  /** 측정값 */
  value: number;
  /** 넘은 임계값 */
  threshold: number;
  message: string;
}

/** sat/{id}/cmd — SET_MODE */
export interface SetModeCommand {
  /** 명령 ID (UUID). ack와 매칭할 때 사용 */
  cmdId: string;
  satId: string;
  ts: number;
  type: 'SET_MODE';
  mode: SatMode;
}

/** sat/{id}/cmd — 명령 종류가 늘어나면 유니온에 추가 */
export type CommandMessage = SetModeCommand;

/** sat/{id}/cmd/ack */
export interface CommandAckMessage {
  cmdId: string;
  satId: string;
  ts: number;
  success: boolean;
  /** 실패 사유 또는 처리 결과 설명 */
  message?: string;
  /** 처리 후 위성의 현재 모드 */
  mode?: SatMode;
}

// ---------- 런타임 검증 (수신 측에서 사용) ----------

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

export function isTelemetryMessage(v: unknown): v is TelemetryMessage {
  return (
    isObj(v) &&
    isStr(v.satId) &&
    isNum(v.ts) &&
    isNum(v.battery) &&
    isNum(v.temp) &&
    (v.rssi === null || isNum(v.rssi)) &&
    isOneOf(SAT_MODES, v.mode) &&
    typeof v.sunlit === 'boolean'
  );
}

export function isEventMessage(v: unknown): v is EventMessage {
  return (
    isObj(v) &&
    isStr(v.satId) &&
    isNum(v.ts) &&
    isOneOf(EVENT_TYPES, v.type) &&
    (v.detail === undefined || isObj(v.detail))
  );
}

export function isAlarmMessage(v: unknown): v is AlarmMessage {
  return (
    isObj(v) &&
    isStr(v.satId) &&
    isNum(v.ts) &&
    isOneOf(ALARM_TYPES, v.type) &&
    isOneOf(ALARM_SEVERITIES, v.severity) &&
    isNum(v.value) &&
    isNum(v.threshold) &&
    typeof v.message === 'string'
  );
}

export function isCommandMessage(v: unknown): v is CommandMessage {
  return (
    isObj(v) &&
    isStr(v.cmdId) &&
    isStr(v.satId) &&
    isNum(v.ts) &&
    v.type === 'SET_MODE' &&
    isOneOf(SAT_MODES, v.mode)
  );
}

export function isCommandAckMessage(v: unknown): v is CommandAckMessage {
  return (
    isObj(v) &&
    isStr(v.cmdId) &&
    isStr(v.satId) &&
    isNum(v.ts) &&
    typeof v.success === 'boolean' &&
    (v.message === undefined || typeof v.message === 'string') &&
    (v.mode === undefined || isOneOf(SAT_MODES, v.mode))
  );
}
