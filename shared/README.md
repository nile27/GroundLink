# @groundlink/shared

simulator와 server가 함께 쓰는 MQTT 메시지 타입과 토픽 상수.

## 내용

- `src/topics.ts`: `Topics.telemetry(satId)` 같은 토픽 생성 함수, `TopicFilters`(와일드카드 구독용), `parseTopic()`
- `src/messages.ts`: 메시지 타입과 수신 측 런타임 검증 함수(`isTelemetryMessage` 등)

| 토픽 | 타입 | 방향 |
|---|---|---|
| `sat/{id}/telemetry` | `TelemetryMessage` | 위성 → 지상 |
| `sat/{id}/event` | `EventMessage` | 위성 → 지상 |
| `sat/{id}/alarm` | `AlarmMessage` | 위성 → 지상 |
| `sat/{id}/cmd` | `CommandMessage` | 지상 → 위성 |
| `sat/{id}/cmd/ack` | `CommandAckMessage` | 위성 → 지상 |

모든 `ts`는 epoch milliseconds(UTC)입니다.

## 빌드

다른 패키지가 `dist/`를 참조하므로 먼저 빌드해야 합니다.

```bash
# 루트에서
npm run build -w shared
```

타입을 바꾸면 shared를 다시 빌드한 뒤 simulator·server를 빌드하세요 (루트 `npm run build`가 순서대로 처리).
