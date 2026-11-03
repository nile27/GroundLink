# 성능 기준선 (개선 전)

성능 개선 작업은 이 수치와 비교한다.

## 측정 조건 — 2026-11-03

- 장비: macOS (Apple Silicon arm64), Docker Desktop 29.5.3
- 버전: Node v24.19.0, eclipse-mosquitto:2.0.22, postgres:17.11-alpine
- 시뮬레이터: `SAT_COUNT=10 INTERVAL_MS=1000 TIME_SCALE=60 ANOMALY_RATE=0.001`
- 서버: 메시지 1건 = INSERT 1건. 일괄 저장, 큐, 캐시, 집계 테이블 없음
- QoS: telemetry 0, event·alarm·cmd·ack 1
- 실행 시간: 약 100초 (07:39:00 ~ 07:40:40 UTC)

## 결과

| 항목 | 값 |
|---|---|
| 시뮬레이터 발행률 | 약 10.4 msg/s (telemetry 10.0 + event 0.3~0.6 + alarm 0~0.1) |
| 서버 저장률 | 약 10.4 rows/s (발행률과 같음) |
| 누적 발행 (시뮬레이터) | telemetry 990, event 49, alarm 3, ack 2 |
| 누적 저장 (DB 행 수) | telemetry 990, events 49, alarms 3, commands 2 |
| 유실 / 형식 오류 / 저장 실패 | 0 / 0 / 0 |
| 수신 지연 (`received_at - ts`) | 평균 43.8 ms, p50 16.8 ms, p99 677 ms, 최대 1072 ms |
| 명령 → ack 반영 | 약 12 ms |
| telemetry 테이블 크기 | 990행, 488 kB (인덱스 포함, 약 500 B/행) |

## 관찰

- 초당 10건에서는 발행과 저장이 완전히 일치했다. 이 부하에서는 병목이 없다.
- 지연이 튀는 순간이 있었다. 100초 동안 4번, 한 주기(위성 10대분)가 통째로 늦게 저장됐다(254~1072 ms).
  - 해당 시각: 07:39:28, 07:40:01, 07:40:03, 07:40:08 UTC
  - 시작 직후 위성 등록 구간이나 API 호출 시각과는 겹치지 않는다
  - 원인은 확인하지 못했다. 후보: Docker Desktop VM 일시 정지, PostgreSQL 체크포인트·fsync, Node GC
  - 부하를 올린 측정에서 함께 확인할 것
- 하루 예상 용량: 10대 × 86,400건 × 약 500 B ≈ **420 MB/일** (텔레메트리만)

## 다음 측정 계획

- `SAT_COUNT`를 100, 500, 1000으로 늘리고 `INTERVAL_MS`를 줄여서, 저장률이 발행률을 못 따라가기 시작하는 지점을 찾는다
- 그 지점의 DB 커넥션 풀 사용률, CPU, 수신 지연을 기록한다
- `/satellites`(N+1)와 `/satellites/:id/telemetry` 응답 시간을 데이터량별로 측정한다
