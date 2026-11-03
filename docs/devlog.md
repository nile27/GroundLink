# Dev Log

작업이 끝날 때마다 기록한다. 최신 항목을 위에 추가한다.

---

## 2026-11-03 — 마이그레이션 전환, 명령 타임아웃, 지연 컬럼, 부하 단계별 측정

작업 브랜치 `dev` (`main`에서 분기). 성능 개선은 하지 않고 측정과 분석까지만 했다.

### 한 일
- **TypeORM 마이그레이션 전환** (`synchronize: false`)
  - 서버와 CLI가 같은 접속 설정 사용 (`typeorm-options.ts`, `data-source.ts`)
  - npm 스크립트 추가: `migration:generate` / `run` / `revert` / `show`
  - `InitialSchema`는 빈 임시 DB에서 생성. 기존 DB에는 "적용됨"으로만 기록 (기존 테이블과 충돌하지 않게)
    - `pg_dump` 스키마 비교: 차이 0
    - 기존 행 수 그대로 (telemetry 990, events 49, alarms 3, commands 2, satellites 10)
    - 임시 DB는 확인 후 삭제
- **명령 타임아웃**: `COMMAND_TIMEOUT_MS`(기본 10000) 안에 ack가 없으면 `TIMEOUT`
  - 상태 갱신은 `status = PENDING` 조건부. ack와 타임아웃이 겹쳐도 한쪽만 반영되고, 늦게 온 ack는 경고 로그만 남김
  - 서버 시작 시 남은 PENDING 정리: 이미 기한이 지났으면 바로 TIMEOUT, 아니면 남은 시간만큼 대기
- **지연 측정 컬럼** (마이그레이션 `TelemetryLatencyColumns`)
  - 기존 `received_at`(DEFAULT now())은 실제로는 저장 시각 → `inserted_at`으로 이름 변경
    - 값 보존 확인: 전체 행 md5 동일
  - 새 `received_at`: 서버가 MQTT 메시지를 받은 시각. 파싱보다 먼저 기록하고, 기존 행은 NULL
  - 자동 생성된 마이그레이션은 기존 저장 시각을 덮어써서, RENAME으로 직접 작성. revert 후 재적용 확인
- **부하 측정 도구** `bench/`
  - `run.mjs`: 단계 실행·집계·한계 판정
  - `probe.cjs`: `--require` 프리로드. CPU, heap, 이벤트 루프 지연, pg 풀을 앱 코드 수정 없이 기록
- 시뮬레이터 `SAT_COUNT` 상한 999 → 9999 (1000대 단계에 필요)
- 5단계 측정 → `docs/perf-baseline.md` "부하 단계별 측정"

### 검증 결과
- 타임아웃 (시뮬레이터 끈 상태)
  - 명령 발행 17:19:47 → TIMEOUT 17:19:57 (10초)
  - 발행 직후 서버 강제 종료 → 15초 뒤 재시작: 시작 시 TIMEOUT으로 정리
  - 3초 뒤 재시작: PENDING 유지 → 원래 기한(발행 후 약 10초)에 TIMEOUT
  - 시뮬레이터를 켜면 ack로 SUCCESS (타임아웃이 덮어쓰지 않음)
- 부하 측정 (각 180초)

| 단계 | 발행/s | 저장/s | 수신→저장 p50 / p99 | 결과 |
|---|---|---|---|---|
| 10대 / 1000ms | 10.5 | 10 | 4 / 20 ms | 통과 |
| 100대 / 1000ms | 105 | 100 | 21 / 142 ms | 통과 |
| 500대 / 1000ms | 524 | 499 | 78 / 1,295 ms | 통과 |
| 1000대 / 1000ms | 1,048 | 1,000 | 134 / 366 ms | 통과 (여유 적음) |
| 1000대 / 200ms | 5,013 | 최대 2,033 → 459 | 12.8 / 58 s | 한계: 약 150초에 서버 OOM, 텔레메트리 90 % 유실 |

### 결정 & 이유
- 기존 DB에는 초기 마이그레이션을 실행하지 않고 "적용됨"으로만 기록: 테이블이 이미 있고 스키마가 같은 것을 확인했기 때문 (사용자 승인)
- `received_at`은 이름 변경 + 새 컬럼으로 처리 (사용자 승인): 기존 값의 의미(저장 시각)를 살리기 위해
- 측정 데이터는 지우지 않고, 단계 시작 시점의 최대 id 이후 행만 집계
- 서버를 단계마다 새로 시작: 단계별 heap·풀 지표를 독립적으로 보려고

### 발견한 문제 / 다음 단계 고려 사항
- 기준선 때 정리한 문제 중 해결된 것
  - 3번 명령 ack 타임아웃 없음 → 해결
  - 5번 `synchronize: true` → 해결
  - 7번 용량 → 다시 계산: 행당 약 160 B → 10대 하루 약 140 MB, 1,000대 하루 약 14 GB
- 새로 확인된 것
  11. **처리 상한 약 2,000~3,000 rows/s**: INSERT 1건 = 트랜잭션 1건이고 pg 풀이 10개뿐이라서. 서버·DB CPU는 그 시점에 여유가 있었다
  12. **역압 없음 → 과부하 시 OOM**: 처리 대기 INSERT가 메모리에 끝없이 쌓여 heap 2 GB에서 죽는다. 죽으면 QoS 0 텔레메트리는 전부 유실
  13. **1초 묶음 발행 때문에 지연이 깔림**: 1,000대에서 수신→저장 p50 134 ms. 시뮬레이터가 전 위성을 한 번에 보내서 생김
  14. **지연 튐의 원인**: 낮은 부하에서는 서버·시뮬레이터가 동시에 멈추거나 DB 응답만 멈추는 형태라서 프로세스 밖(호스트·Docker VM I/O) 쪽으로 보인다. 체크포인트와는 상관이 없었다. 1,000 msg/s부터는 풀 대기가 지연을 지배한다
  15. **측정 한계**: `inserted_at`은 트랜잭션 시작 시각(now())이라 커밋·fsync 시간은 포함되지 않는다
- 개선 후보와 우선순위: `docs/perf-baseline.md` 맨 아래 (일괄 저장, 역압, 풀 크기, synchronous_commit, QoS 1 등)

---

## 2026-11-03 — Git 원격 연결, 규칙 정리, 기준선 태그

### 한 일
- 기본 브랜치 이름 변경: `master` → `main`
- 원격 `origin` 추가: https://github.com/nile27/GroundLink.git (원격은 비어 있었음)
- CLAUDE.md에 "Git 규칙", "금지 사항" 섹션 추가
- `.gitignore`에 .NET/WPF 산출물, DB 덤프, `.npm/`, `Thumbs.db`, `.claude/settings.local.json` 추가
  - `.vscode/`는 `extensions.json`, `settings.json`만 공유하도록 바꿈
- 비밀값 하드코딩 점검: 문제 없음 (모두 환경변수 참조 또는 `.env.example` 예시값)
- 기준선 태그 `v0.1-baseline` 생성 (시뮬레이터·서버 기능 커밋 `b2f81db`)

---

## 2026-11-03 — shared, 위성 시뮬레이터, 수집 서버 (성능 기준선)

### 한 일
- **npm workspaces** 구성: `shared`, `simulator`, `server`
  - TypeScript 6.0.3, 모든 패키지 버전을 정확히 고정 (`.npmrc` save-exact)
- **shared**
  - 토픽 상수와 `parseTopic()`
  - telemetry / event / alarm / cmd / cmd·ack 메시지 타입과 런타임 검증 함수
- **simulator** (Node + TypeScript, mqtt.js 5.16.1)
  - 궤도 계산을 `OrbitModel` 인터페이스로 분리, 지금은 `SimpleOrbitModel` 사용
    - 주기 90분, 그림자 35%, 교신 구간 12%
  - 위성 상태 규칙
    - 햇빛 구간은 충전·온도 상승, 그림자 구간은 방전·온도 하강
    - 배터리 20% 미만이면 SAFE 자동 전환
    - 온도 급상승 이상 발생
  - 타이머 하나로 전체 위성 처리
  - 상태가 바뀔 때만 event, 임계값을 넘는 순간만 alarm (히스테리시스)
  - `SET_MODE` 명령 처리 + ack 발행
  - 10초마다 초당 발행 건수 출력
  - SIGINT/SIGTERM을 받으면 연결 정리 후 종료
- **server** (NestJS 12, TypeORM 1.1, PostgreSQL 17)
  - mqtt.js 래퍼 서비스
  - 메시지 1건 = INSERT 1건, 처음 보는 위성은 자동 등록
  - 테이블: `satellites`, `telemetry`(인덱스 `sat_id, ts`), `events`, `alarms`, `commands`
  - REST API + Swagger(`/api/docs`)
    - `/health`
    - `/satellites`
    - `/satellites/:id/telemetry`
    - `POST·GET /satellites/:id/commands`
    - `/alarms`
  - 명령 발행 → PENDING 기록 → ack를 받으면 SUCCESS/FAILED로 갱신
  - 10초마다 초당 저장 건수 로그
- 기준선 측정 결과를 `docs/perf-baseline.md`에 기록

### 검증 결과 (위성 10대, 1초 주기, 약 100초)
- 발행 약 10.4 msg/s = 저장 약 10.4 rows/s
- 누적 발행과 DB 행 수가 일치: telemetry 990, event 49, alarm 3. 유실·실패 0
- 수신 지연: 평균 43.8 ms, p50 16.8 ms, p99 677 ms, 최대 1072 ms
- SAFE 명령: 202 PENDING → 약 12 ms 뒤 SUCCESS
- events 기록 확인
  - CONTACT_START/END 각 10건, ECLIPSE_ENTER/EXIT 각 10건
  - MODE_CHANGE 3건 (자동 2, 명령 1)
- 잘못된 요청 거부: 없는 위성 404, limit 초과 400, 잘못된 mode 400
- 시뮬레이터·서버 모두 종료 시그널을 받으면 정상 종료

### 결정 & 이유
- TypeScript 7.0 대신 6.0.3: `@nestjs/swagger` 12.1.0의 peer 조건이 TS `^5.5 || ^6.0`
- 텔레메트리 `ts`는 실제 시각(wall clock). 시뮬레이션 시각은 물리 계산에만 사용 (API 조회 시 미래 시각이 찍히는 것을 막기 위해)
- 지시에 없던 추가
  - `GET /satellites/:id/commands`: 클라이언트가 API로 ack 결과를 확인할 수 있게
  - `ECLIPSE_ENTER/EXIT` 이벤트: 햇빛/그림자 전환도 상태 변화라서

### 발견한 문제 / 다음 단계 고려 사항
1. **수신 지연이 가끔 튐 (원인 미확인)**: 약 100초 동안 4번, 한 주기(위성 10대분)가 통째로 250~1070 ms 늦게 저장됨
   - 후보: Docker Desktop VM, PostgreSQL 체크포인트, Node GC
   - 부하를 올린 측정에서 같이 확인
2. **텔레메트리 QoS 0**: 브로커나 서버가 잠깐 끊기면 그 사이 텔레메트리는 유실됨 (이번 측정은 유실 0)
3. **명령 ack 타임아웃 없음**: ack가 오지 않으면 PENDING에서 영원히 머묾
4. **PostgreSQL 전용 문법**: `timestamptz` 컬럼, 위성 등록의 `orIgnore()`(ON CONFLICT). SQL Server로 전환할 때 수정 필요
5. **`synchronize: true`**: 엔티티로 테이블을 자동 생성 중. 운영 전에 마이그레이션으로 전환
6. **`/satellites` N+1 쿼리**: 위성마다 최신 텔레메트리 쿼리 1건. 기준선이라 유지
7. **텔레메트리 용량**: 10대 기준 약 420 MB/일. 보관·정리 정책 필요
8. **서버 기본 바인딩 127.0.0.1**: 다른 PC의 WPF가 접속하려면 `HOST=0.0.0.0` 필요
9. **TypeScript 6 고정**: `@nestjs/swagger`가 TS 7을 지원하면 업그레이드 검토
10. **`@scarf/scarf` postinstall 차단 중**: swagger-ui-dist의 설치 통계 스크립트. npm 기본 정책으로 막혔고 그대로 둠

---

## 2026-11-03 — 프로젝트 정리 & CLAUDE.md

- 프로젝트 이름을 GroundLink로 변경
  - compose 프로젝트 `groundlink`
  - 컨테이너 `gl-mosquitto`, `gl-postgres`
  - 볼륨 `groundlink_*`
- CLAUDE.md 작성: 구조, 데이터 흐름, MQTT 토픽, 원칙

---

## 2026-11-03 — 환경설정 & 인프라

- 개발 환경: Node v24 (LTS), npm 11, @nestjs/cli 12, Docker 29 / Compose v5
- 인프라: `eclipse-mosquitto:2.0.22`, `postgres:17.11-alpine`
  - 포트는 127.0.0.1에만 바인딩
  - postgres healthcheck
  - named volume
- 검증: MQTT pub/sub, `SELECT 1` 성공
