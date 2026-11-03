import { OrbitModel, OrbitState } from './orbit-model';

/** 궤도 주기 90분 (시뮬레이션 시간) */
export const ORBIT_PERIOD_MS = 90 * 60 * 1000;
/** 한 궤도 중 그림자 구간 비율 */
export const ECLIPSE_FRACTION = 0.35;
/** 한 궤도 중 교신 가능 구간 비율 (90분 × 0.12 ≈ 10.8분) */
export const CONTACT_FRACTION = 0.12;

interface SatOrbitParams {
  /** 궤도 시작 위상 0~1 */
  phaseOffset: number;
  /** 교신 구간이 시작되는 위상 0~1 */
  contactStart: number;
}

/**
 * 단순 규칙 기반 궤도 모델.
 * - 위상 [0, 1-ECLIPSE_FRACTION) 은 햇빛, 나머지는 그림자
 * - 위성마다 위상 [contactStart, contactStart+CONTACT_FRACTION) 에서만 교신
 * - 위성마다 시작 위상을 고르게 흩어 놓아 이벤트가 한꺼번에 몰리지 않게 함
 */
export class SimpleOrbitModel implements OrbitModel {
  private readonly params = new Map<string, SatOrbitParams>();

  constructor(satIds: readonly string[], random: () => number = Math.random) {
    const n = satIds.length;
    satIds.forEach((id, i) => {
      const jitter = (random() - 0.5) / Math.max(n, 1) / 2;
      this.params.set(id, {
        phaseOffset: wrap01(i / n + jitter),
        contactStart: random(),
      });
    });
  }

  stateAt(satId: string, simTimeMs: number): OrbitState {
    const p = this.params.get(satId);
    if (!p) throw new Error(`SimpleOrbitModel: 등록되지 않은 위성 ${satId}`);

    const phase = wrap01(simTimeMs / ORBIT_PERIOD_MS + p.phaseOffset);
    const sunlit = phase < 1 - ECLIPSE_FRACTION;

    // 교신 구간 안에서의 진행도 0~1 (구간이 위상 1을 넘어가는 경우 포함)
    const sinceContactStart = wrap01(phase - p.contactStart);
    const inContact = sinceContactStart < CONTACT_FRACTION;
    const progress = sinceContactStart / CONTACT_FRACTION;

    return {
      phase,
      sunlit,
      inContact,
      // 가장자리 0 → 정점 1 → 가장자리 0
      contactQuality: inContact ? Math.sin(Math.PI * progress) : null,
    };
  }
}

function wrap01(x: number): number {
  return ((x % 1) + 1) % 1;
}
