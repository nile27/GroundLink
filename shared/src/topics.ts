/**
 * MQTT 토픽 규칙 (CLAUDE.md "MQTT 토픽" 참고)
 *
 *   sat/{id}/telemetry  주기적 상태값          (위성 → 지상)
 *   sat/{id}/event      교신 시작·종료, 모드 변경 (위성 → 지상)
 *   sat/{id}/alarm      임계값 초과             (위성 → 지상)
 *   sat/{id}/cmd        명령                   (지상 → 위성)
 *   sat/{id}/cmd/ack    명령 처리 결과           (위성 → 지상)
 */

export const TOPIC_ROOT = 'sat';

export type TopicKind = 'telemetry' | 'event' | 'alarm' | 'cmd' | 'cmdAck';

/** 특정 위성의 토픽 이름을 만든다. */
export const Topics = {
  telemetry: (satId: string) => `${TOPIC_ROOT}/${satId}/telemetry`,
  event: (satId: string) => `${TOPIC_ROOT}/${satId}/event`,
  alarm: (satId: string) => `${TOPIC_ROOT}/${satId}/alarm`,
  cmd: (satId: string) => `${TOPIC_ROOT}/${satId}/cmd`,
  cmdAck: (satId: string) => `${TOPIC_ROOT}/${satId}/cmd/ack`,
} as const;

/** 전체 위성 구독용 와일드카드 필터. */
export const TopicFilters = {
  telemetry: `${TOPIC_ROOT}/+/telemetry`,
  event: `${TOPIC_ROOT}/+/event`,
  alarm: `${TOPIC_ROOT}/+/alarm`,
  cmd: `${TOPIC_ROOT}/+/cmd`,
  cmdAck: `${TOPIC_ROOT}/+/cmd/ack`,
} as const;

export interface ParsedTopic {
  satId: string;
  kind: TopicKind;
}

/** 토픽 문자열을 위성 ID와 종류로 분해한다. 규칙에 맞지 않으면 null. */
export function parseTopic(topic: string): ParsedTopic | null {
  const parts = topic.split('/');
  if (parts[0] !== TOPIC_ROOT || !parts[1]) return null;
  const satId = parts[1];

  if (parts.length === 3) {
    switch (parts[2]) {
      case 'telemetry':
      case 'event':
      case 'alarm':
      case 'cmd':
        return { satId, kind: parts[2] };
      default:
        return null;
    }
  }
  if (parts.length === 4 && parts[2] === 'cmd' && parts[3] === 'ack') {
    return { satId, kind: 'cmdAck' };
  }
  return null;
}
