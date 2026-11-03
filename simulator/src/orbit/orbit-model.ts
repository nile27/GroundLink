/**
 * 궤도 모델 인터페이스.
 *
 * 위성 상태 모델(Satellite)은 이 인터페이스만 알고, 궤도를 어떻게 계산하는지는 모른다.
 * 지금은 단순 원궤도 규칙 모델(SimpleOrbitModel)을 쓰고,
 * 나중에 TLE + SGP4 기반 모델로 이 인터페이스를 구현해 교체한다.
 */
export interface OrbitState {
  /** 궤도 위상 0~1 (모델 기준 한 바퀴) */
  phase: number;
  /** 햇빛 구간 여부 (false = 그림자 구간) */
  sunlit: boolean;
  /** 지상국과 교신 가능한지 */
  inContact: boolean;
  /**
   * 교신 품질 0~1 (가시권 가장자리 0, 정점 1). 교신 중이 아니면 null.
   * SGP4 모델에서는 지상국 기준 고도각(elevation)으로 계산하면 된다.
   */
  contactQuality: number | null;
}

export interface OrbitModel {
  /** 시뮬레이션 시각(epoch ms)에서 위성의 궤도 상태 */
  stateAt(satId: string, simTimeMs: number): OrbitState;
}
