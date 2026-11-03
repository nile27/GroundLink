import type {
  AlarmMessage,
  AlarmType,
  EventMessage,
  ModeChangeReason,
  SatMode,
  TelemetryMessage,
} from '@groundlink/shared';
import type { OrbitState } from './orbit/orbit-model';

// ---------- 모델 상수 (시뮬레이션 시간 기준) ----------

/** 배터리 변화율 (%/분) */
const BATTERY_RATE = {
  NORMAL: { sunlit: +0.6, eclipse: -1.3 }, // 궤도당 약 -6% → 서서히 소모
  SAFE: { sunlit: +0.8, eclipse: -0.5 }, // 부하를 줄여 회복
} as const;

/** 자동 SAFE 전환 기준 (%) */
export const SAFE_MODE_BATTERY = 20;

/** 온도 목표값과 시정수 */
const TEMP_TARGET = { sunlit: 35, eclipse: -15 }; // °C
const TEMP_TAU_MIN = 10; // 분

/** 이상 발생 시 온도 급상승 폭 (°C) */
const ANOMALY_SPIKE = { min: 40, max: 70 };

/** RSSI 범위 (dBm): 가시권 가장자리 ~ 정점 */
const RSSI = { edge: -115, peak: -70 };

/** 알람 임계값. clear 값을 넘어 돌아와야 다시 발생 (히스테리시스) */
const ALARM_RULES: Record<
  AlarmType,
  { threshold: number; clear: number; above: boolean; severity: AlarmMessage['severity'] }
> = {
  BATTERY_LOW: { threshold: SAFE_MODE_BATTERY, clear: 25, above: false, severity: 'CRITICAL' },
  TEMP_HIGH: { threshold: 60, clear: 55, above: true, severity: 'CRITICAL' },
  TEMP_LOW: { threshold: -30, clear: -25, above: false, severity: 'WARNING' },
};

// ---------- 위성 ----------

export interface StepResult {
  telemetry: TelemetryMessage;
  events: EventMessage[];
  alarms: AlarmMessage[];
  /** 이번 주기에 이상(온도 급상승)이 발생했는지 */
  anomaly: boolean;
}

export type SetModeResult =
  | { ok: true; changed: boolean; event: EventMessage | null }
  | { ok: false; reason: string };

/** 위성 한 대의 상태와 규칙 */
export class Satellite {
  battery: number;
  temp: number;
  mode: SatMode = 'NORMAL';

  private sunlit: boolean;
  private inContact: boolean;
  private readonly activeAlarms = new Set<AlarmType>();

  constructor(
    readonly id: string,
    initialOrbit: OrbitState,
    private readonly random: () => number = Math.random,
  ) {
    this.battery = round(30 + random() * 70, 1);
    this.sunlit = initialOrbit.sunlit;
    this.inContact = initialOrbit.inContact;
    this.temp = round(initialOrbit.sunlit ? 20 + random() * 15 : -10 + random() * 15, 1);
  }

  /**
   * 한 주기 진행.
   * @param orbit 이번 시각의 궤도 상태
   * @param dtMin 진행한 시뮬레이션 시간 (분)
   */
  step(orbit: OrbitState, dtMin: number, anomalyRate: number, now: number): StepResult {
    const events: EventMessage[] = [];
    const alarms: AlarmMessage[] = [];

    // 1) 궤도 상태 변화 → 이벤트
    if (orbit.sunlit !== this.sunlit) {
      events.push(this.event(now, orbit.sunlit ? 'ECLIPSE_EXIT' : 'ECLIPSE_ENTER'));
      this.sunlit = orbit.sunlit;
    }
    if (orbit.inContact !== this.inContact) {
      events.push(this.event(now, orbit.inContact ? 'CONTACT_START' : 'CONTACT_END'));
      this.inContact = orbit.inContact;
    }

    // 2) 배터리: 햇빛이면 충전, 그림자면 방전
    const rate = BATTERY_RATE[this.mode][this.sunlit ? 'sunlit' : 'eclipse'];
    this.battery = clamp(this.battery + rate * dtMin + gaussian(this.random) * 0.05, 0, 100);

    // 3) 온도: 목표값으로 1차 수렴 (햇빛 상승 / 그림자 하강)
    const target = this.sunlit ? TEMP_TARGET.sunlit : TEMP_TARGET.eclipse;
    const k = 1 - Math.exp(-dtMin / TEMP_TAU_MIN);
    this.temp += (target - this.temp) * k + gaussian(this.random) * 0.3;

    // 4) 이상: 온도 급상승
    const anomaly = this.random() < anomalyRate;
    if (anomaly) {
      this.temp += ANOMALY_SPIKE.min + this.random() * (ANOMALY_SPIKE.max - ANOMALY_SPIKE.min);
    }

    // 5) 배터리 부족 → SAFE 자동 전환
    if (this.mode === 'NORMAL' && this.battery < SAFE_MODE_BATTERY) {
      events.push(this.changeMode('SAFE', 'AUTO_LOW_BATTERY', now));
    }

    // 6) 알람 (임계값을 넘는 순간에만)
    for (const type of Object.keys(ALARM_RULES) as AlarmType[]) {
      const alarm = this.checkAlarm(type, now);
      if (alarm) alarms.push(alarm);
    }

    // 7) 텔레메트리
    const rssi =
      orbit.contactQuality === null
        ? null
        : round(RSSI.edge + (RSSI.peak - RSSI.edge) * orbit.contactQuality + gaussian(this.random) * 1.5, 1);

    const telemetry: TelemetryMessage = {
      satId: this.id,
      ts: now,
      battery: round(this.battery, 2),
      temp: round(this.temp, 2),
      rssi,
      mode: this.mode,
      sunlit: this.sunlit,
    };

    return { telemetry, events, alarms, anomaly };
  }

  /** 지상 명령으로 모드 변경 */
  setModeByCommand(mode: SatMode, now: number): SetModeResult {
    if (mode === this.mode) return { ok: true, changed: false, event: null };
    if (mode === 'NORMAL' && this.battery < SAFE_MODE_BATTERY) {
      return {
        ok: false,
        reason: `배터리 ${round(this.battery, 1)}% < ${SAFE_MODE_BATTERY}% 라서 NORMAL 전환 거부`,
      };
    }
    return { ok: true, changed: true, event: this.changeMode(mode, 'COMMAND', now) };
  }

  private changeMode(to: SatMode, reason: ModeChangeReason, now: number): EventMessage {
    const from = this.mode;
    this.mode = to;
    return this.event(now, 'MODE_CHANGE', { from, to, reason });
  }

  private checkAlarm(type: AlarmType, now: number): AlarmMessage | null {
    const rule = ALARM_RULES[type];
    const value = type === 'BATTERY_LOW' ? this.battery : this.temp;
    const exceeded = rule.above ? value > rule.threshold : value < rule.threshold;
    const cleared = rule.above ? value < rule.clear : value > rule.clear;

    if (this.activeAlarms.has(type)) {
      if (cleared) this.activeAlarms.delete(type);
      return null;
    }
    if (!exceeded) return null;

    this.activeAlarms.add(type);
    const unit = type === 'BATTERY_LOW' ? '%' : '°C';
    return {
      satId: this.id,
      ts: now,
      type,
      severity: rule.severity,
      value: round(value, 2),
      threshold: rule.threshold,
      message: `${type}: ${round(value, 1)}${unit} (임계값 ${rule.threshold}${unit})`,
    };
  }

  private event(now: number, type: EventMessage['type'], detail?: EventMessage['detail']): EventMessage {
    return detail ? { satId: this.id, ts: now, type, detail } : { satId: this.id, ts: now, type };
  }
}

// ---------- 유틸 ----------

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** 표준정규분포 난수 (Box–Muller) */
function gaussian(random: () => number): number {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
