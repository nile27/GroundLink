# bench — 부하 단계별 측정

```bash
# 사전: cd infra && docker compose up -d / npm run build / cd server && npm run migration:run
# 서버·시뮬레이터는 꺼 둔다 (스크립트가 단계마다 직접 띄운다)
npm run bench                                        # 기본 5단계, 각 180초, 사이 30초 휴식
STAGES=10x1000,100x1000 STAGE_SEC=60 node bench/run.mjs   # 단계 지정 (위성수x주기ms)
```

| 변수 | 기본값 | 설명 |
|---|---|---|
| `STAGES` | `10x1000,100x1000,500x1000,1000x1000,1000x200` | 위성 수 x 발행 주기(ms) |
| `STAGE_SEC` / `REST_SEC` | `180` / `30` | 단계 길이 / 단계 사이 휴식 |
| `MIN_FREE_GB` | `5` | 단계 시작 전 디스크 여유가 이보다 적으면 중단 |
| `CATCHUP_MAX_SEC` | `600` | 시뮬레이터 종료 후 밀린 저장을 기다리는 최대 시간 |

## 단계마다 하는 일

1. `df`로 디스크 확인 → DB 스냅샷 (telemetry 최대 id·크기, 체크포인트·WAL 통계)
2. 서버 시작 (`probe.cjs` 프리로드) → `docker stats` 샘플링 시작
3. 시뮬레이터를 `STAGE_SEC` 동안 실행 → SIGINT로 종료 (최종 누적 발행 수 기록)
4. 저장 건수가 발행 수에 도달하거나 15초간 변화가 없을 때까지 대기
5. 서버 종료 → 단계 시작 시점 이후의 행만으로 지표 계산

측정 데이터는 지우지 않는다. 결과는 `bench/results/<runId>/` (git 제외).

## 지표

- 발행률: 시뮬레이터 `[rate]` 로그 평균 / 저장률: DB `inserted_at` 초당 건수 평균 (시작 15초 이후 ~ 종료 5초 전)
- 지연: 발행→수신 `received_at - ts`, 수신→저장 `inserted_at - received_at` (p50/p95/p99/max)
  - `ts`, `received_at`은 호스트 시계, `inserted_at`은 DB(Docker VM) 시계. 차이는 `clock.offsetMs`에 기록
- 따라잡기: 마지막 발행(`max(ts)`) → 마지막 저장(`max(inserted_at)`)
- 유실: 시뮬레이터 누적 발행 - 저장 행 수
- 서버·시뮬레이터: `probe.cjs` — CPU%, RSS, heap, 이벤트 루프 지연, pg 풀(total/idle/waiting)
- 컨테이너: `docker stats` CPU%(코어 1개 = 100%), 메모리
- 지연 튐: 초 단위로 묶어 e2e 최대가 250ms를 넘은 초의 목록

## 한계 판정 (해당하면 남은 단계 생략)

- 따라잡기 > 2초 (발행 중에 저장이 밀렸다)
- 마지막 30초 구간 e2e p50이 두 번째 구간의 3배 이상이고 200ms 이상 (지연이 계속 늘어남)
- 텔레메트리 유실 > 0
