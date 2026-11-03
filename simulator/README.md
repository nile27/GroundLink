# @groundlink/simulator

위성 여러 대의 상태를 단순 규칙으로 흉내 내서 텔레메트리·이벤트·알람을 MQTT로 발행하는 콘솔 앱.

## 실행

```bash
# 루트에서 (최초 1회: npm install && npm run build)
npm run start:sim

# 설정을 바꿔서 실행
SAT_COUNT=50 INTERVAL_MS=500 npm run start:sim
```

`simulator/.env`가 있으면 읽고, 셸 환경변수가 우선합니다 (`.env.example` 참고). Ctrl+C 또는 SIGTERM을 받으면 타이머를 멈추고 MQTT 연결을 정리한 뒤 누적 발행 건수를 출력하고 종료합니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `SAT_COUNT` | 10 | 위성 수 (`SAT-001` ~) |
| `INTERVAL_MS` | 1000 | 실제 시간 기준 발행 주기 |
| `TIME_SCALE` | 60 | 배속. 60이면 실제 1초 = 시뮬레이션 1분 (90분 궤도 = 실제 90초) |
| `ANOMALY_RATE` | 0.001 | 위성·주기당 온도 급상승 확률 |
| `MQTT_URL` | `mqtt://127.0.0.1:1883` | 브로커 주소 |

## 모델

- **궤도** (`src/orbit/`): `OrbitModel` 인터페이스 뒤에 `SimpleOrbitModel`을 둠. 나중에 SGP4 모델로 교체할 때 이 인터페이스만 구현하면 됨
  - 주기 90분, 그중 35%는 그림자 구간
  - 위성마다 시작 위상이 다름
  - 궤도마다 12%(약 10.8분) 구간만 교신. 그때만 RSSI 생성 (가장자리 -115 dBm ~ 정점 -70 dBm)
- **위성 상태** (`src/satellite.ts`)
  - 배터리: 햇빛 구간 충전, 그림자 구간 방전. NORMAL 모드는 궤도당 약 6%씩 줄어듦
  - 온도: 햇빛 35°C, 그림자 -15°C를 향해 수렴
  - 배터리 20% 미만이면 SAFE로 자동 전환
  - `ANOMALY_RATE` 확률로 온도가 40~70°C 급상승
- **이벤트**: 상태가 바뀔 때만 발행
  - `CONTACT_START` / `CONTACT_END`
  - `ECLIPSE_ENTER` / `ECLIPSE_EXIT`
  - `MODE_CHANGE`
- **알람**: 임계값을 넘는 순간 한 번만 발행. 해제 기준(히스테리시스)을 넘어 돌아와야 다시 발생
  - `BATTERY_LOW` < 20%
  - `TEMP_HIGH` > 60°C
  - `TEMP_LOW` < -30°C
- **명령**: `sat/+/cmd`를 구독함. `SET_MODE` 명령을 받으면 처리하고 `cmd/ack`를 발행
  - 배터리 20% 미만에서 NORMAL 전환 명령이 오면 거부(`success:false`)
- 타이머 하나로 매 주기 전체 위성을 처리하고, 10초마다 초당 발행 건수를 출력

QoS: telemetry는 0, event·alarm·ack는 1.

## 개발

```bash
npm run build -w simulator   # tsc → dist/
```
