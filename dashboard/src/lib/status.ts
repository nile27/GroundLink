import type { Telemetry } from '../types/api';

/** 경고 기준 배터리 (%). 미만이면 경고 */
export const WARNING_BATTERY = 20;

export interface SatStatus {
  /** SAFE 모드이거나 배터리 < 20 */
  warning: boolean;
  /** 교신 중 (rssi != null) */
  contact: boolean;
}

/** 위성 상태 판정. 텔레메트리가 없으면 둘 다 false */
export function getSatStatus(t: Telemetry | null): SatStatus {
  if (!t) return { warning: false, contact: false };
  return {
    warning: t.mode === 'SAFE' || t.battery < WARNING_BATTERY,
    contact: t.rssi != null,
  };
}
