# Dev Log

작업이 끝날 때마다 기록한다. 최신 항목을 위에 추가한다.

---

## 2026-11-07 — server: /satellites N+1 제거, summary·stats API, CORS

작업 브랜치 `dev`. 마이그레이션, 인덱스 추가, 설치는 없음. 기존 인덱스 `idx_telemetry_sat_ts (sat_id, ts)`로 충분함.

### 측정 조건
- DB: 위성 4000대, telemetry 약 354만 행 (부하 측정 때 쌓인 데이터)
- 시뮬레이터 실행 중 (10대, 1초 주기)
- 측정 방식: curl `time_total`. 워밍업 1회는 버리고 7회 측정

### 1) GET /satellites N+1 제거 (0cbc126, perf)
- 이전: 위성 목록 1건 + 위성마다 최신 텔레메트리 1건 = 쿼리 4001건
- 이후: 쿼리 1건 `LEFT JOIN LATERAL (… ORDER BY ts DESC LIMIT 1)`
- 응답 시간

| | 평균 | 중앙값 | 최소 | 최대 |
|---|---|---|---|---|
| 이전 (N+1) | 0.971 s | 0.945 s | 0.687 s | 1.208 s |
| 이후 (LATERAL) | 0.077 s | 0.076 s | 0.073 s | 0.089 s |

- 약 12.6배 빨라짐. 응답 크기는 1.22 MB로 같음
- EXPLAIN ANALYZE
  - LATERAL: 76 ms. Nested Loop Left Join 안에서 `idx_telemetry_sat_ts`를 역순으로 1행씩, 4000회 읽음
  - DISTINCT ON(비교용): 8,205 ms. 354만 행 전체를 인덱스로 훑음 → 쓰지 않음
- 응답이 같은지 확인
  - 시뮬레이터가 갱신하지 않는 위성 3990대: 이전과 이후 JSON이 바이트 단위로 같음
  - 키 이름·순서 차이 0
  - 값 타입 차이는 시뮬레이터 위성 2대의 rssi(교신 종료로 숫자→null)뿐. 코드 변화가 아니라 데이터가 바뀐 것
- 원시 SQL 사용. `LATERAL`은 PostgreSQL 전용이라 주석에 SQL Server 대응(`OUTER APPLY`)을 적음

### 2) GET /satellites/:id/telemetry/summary (24485e3)
- 파라미터
  - `from`, `to`: ISO 8601, 둘 다 포함, 필수
  - `bucketSeconds`: 양의 정수, 필수
  - 형식 오류나 from > to이면 400, 없는 위성이면 404
- 계산: DB에서 `date_bin(make_interval(secs => bucketSeconds), ts, from)`으로 묶어 battery min/max/avg
  - t 오름차순, 데이터 없는 구간은 빠짐
- SAT-001 측정 (7회)

| 구간 | bucket | 결과 구간 수 | 읽은 행 | 평균 응답 | EXPLAIN |
|---|---|---|---|---|---|
| 최근 1분 | 5 s | 5 | 24 | 0.007 s | 0.73 ms |
| 최근 1시간 | 60 s | 5 | 131 | 0.005 s | 1.00 ms |
| 최근 24시간 | 900 s | 1 | 131 | 0.005 s | 0.28 ms |

- 실행 계획: 모두 `idx_telemetry_sat_ts` Index Scan → Sort → GroupAggregate
- 주의: SAT-001의 최근 데이터는 이번 세션에서 시뮬레이터를 잠깐씩 돌린 것뿐이라 행 수가 적음
  - 1초 주기 24시간치(약 86,400행)로는 측정하지 않음
- avg는 double이라 소수점이 길게 나옴 (예: 28.52599983215332). 반올림은 하지 않음

### 3) GET /satellites/stats (1f1960f)
- 결과 형태: `{ total, warning, safe, contact }`
- 계산: 1번과 같은 LATERAL로 최신 텔레메트리를 구하고 `count(*) FILTER`로 셈. 쿼리 1건
  - warning: SAFE 또는 battery < 20
  - safe: SAFE
  - contact: rssi IS NOT NULL. 신선도 기준 없음
  - 텔레메트리 없는 위성은 total에만 포함
- 라우트를 `':id/…'`보다 먼저 선언함
- 검증
  - `/satellites` 응답으로 직접 센 값과 일치: 4000 / 1047 / 1047 / 478
  - 텔레메트리 없는 위성: 트랜잭션 안에서 임시로 추가해 total만 늘어나는 것 확인 → ROLLBACK
- 응답 0.046 s (7회 평균), EXPLAIN 49 ms

### 4) CORS (16ecef4)
- `app.enableCors({ origin: ['http://localhost:5173'] })`
  - 처음에는 문자열로 줬는데, 그러면 다른 Origin에도 `Access-Control-Allow-Origin: http://localhost:5173`을 그대로 보냄
  - 배열로 바꿔서 일치할 때만 헤더를 보내게 함
- 확인
  - Origin 5173 GET: 5개 엔드포인트 모두 ACAO 헤더 있음
  - OPTIONS 사전 요청: 204, `Allow-Methods`, `Allow-Headers: content-type`
  - `http://localhost:3001`, `http://127.0.0.1:5173`: ACAO 헤더 없음

### Swagger
- 새 DTO: `TelemetrySummaryQueryDto`, `TelemetrySummaryPointDto`, `SatelliteStatsDto`
- `/api/docs-json` 확인 결과
  - t는 `string, format: date-time`
  - stats 필드는 `integer`
  - 쿼리 파라미터 3개 모두 required, bucketSeconds는 `integer, minimum 1`

---

## 2026-11-07 — dashboard 2단계: 디자인, 배터리 차트

작업 브랜치 `dev`. 보이는 것만 작업함. 클릭, 기간 선택, 모드 전환 동작은 3단계에서 함.

### 한 일
- **Recharts** (af74ac2): `npm install recharts@3.10.1 -w dashboard`, 정확한 버전으로 기록
  - peer 범위 react ^16.8~^19, react-dom ^16~^19: 설치된 19.3.1과 맞음
  - peer react-is: npm이 19.3.1을 자동 설치함. package.json에는 적지 않음
- **목업 보강** (ecf0972)
  - SAT-007: NORMAL인데 배터리 18.4. 경고 조건 두 가지(SAFE / 배터리 < 20)가 모두 화면에 나오게 함
  - 차트 목업 `mockBatterySeries`: `{ t, min, max, avg }[]`, 5분 구간 12개. 나중에 summary API 응답으로 교체
- **디자인** (957fa1b)
  - 색은 `index.css`의 `@theme static`에 의미 이름으로 정의함
    - static으로 둔 이유: 차트에서 `var(--color-*)`를 쓰므로, 클래스에서 쓰지 않는 색도 변수로 출력되게 하려고
  - 상태 색은 `data-*` 속성과 `data-[...]:` 변형으로만 입힘. 컴포넌트에서 className 문자열을 조합하지 않음
    - 경고 카드: 빨간 테두리와 배경
    - 선택 카드: 파란 ring. 경고 색과 겹쳐도 구분됨
    - 교신 점: 교신 중이면 초록, 아니면 회색
    - SAFE: 주황 배지
    - 요약 바: 항목별 색
    - 알람 severity: CRITICAL 빨강, WARNING 주황
  - 레이아웃: 화면 높이를 고정하고, 위성 목록과 알람 표가 각자 스크롤됨
    - 알람 표 헤더는 sticky
    - 숫자는 tabular-nums
  - 배터리 차트(`BatteryChart`)
    - avg는 선, min~max는 면
    - y축 0~100%, 20%에 점선 경고 기준선
  - 구간 요약: `lib/summary.ts`의 `summarize()`로 최소·최대·평균을 계산
    - 평균은 구간 평균들의 단순 평균 (목업에 구간별 샘플 수가 없음)
  - 새 컴포넌트: `ModeBadge`, `ContactDot`, `BatteryChart`

### 검증
- `npm run build:dashboard`, 루트 `npm run build` 성공
  - Vite가 JS 청크 614 kB(500 kB 초과) 경고를 냄. 대부분 Recharts. 이번 범위(최적화 제외)라 그대로 둠
- 개발 서버 + 헤드리스 Chrome으로 화면 확인 후 종료
  - 경고 카드 2장(SAT-003, SAT-007) 빨강, 선택 카드(SAT-001) 파란 ring
  - 요약: 전체 7 / 경고 2 / SAFE 1 / 교신 중 2
  - 차트에 선, 범위 면, 20% 기준선이 모두 렌더링됨. 구간 요약 70.1% / 77.9% / 74.2%

### 메모
- 목업의 min~max 폭이 2~3%라 0~100% 축에서 범위 면이 얇게 보임

---

## 2026-11-07 — dashboard 1단계: Tailwind 설치, 화면 뼈대 (목업)

작업 브랜치 `dev`. 구조만 만들었고 동작·색·디자인은 다음 단계.

### 한 일
- **Tailwind CSS** (7275185)
  - `npm install tailwindcss@4.3.5 @tailwindcss/vite@4.3.5 -w dashboard`: 정확한 버전으로 기록됨
  - 공식 Vite 가이드대로 `vite.config.ts`에 `tailwindcss()` 플러그인 추가
  - `index.css`에는 `@import "tailwindcss";`만 남김
- **화면 뼈대** (b80452b), WPF 버전과 같은 구성
  - 상단 요약 바: 전체 / 경고 / SAFE / 교신 중
  - 왼쪽 위성 카드: ID, 배터리, 온도, 모드, 교신 점
  - 오른쪽 선택 위성 상세: 최신 값, 모드 전환 버튼, 기간 버튼(1분/1시간/24시간), 배터리 차트 자리, 최소·최대·평균 자리
  - 하단 알람 표
  - 컴포넌트는 `src/components/`에 나눔: SummaryBar, SatelliteList, SatelliteCard, SatelliteDetail, AlarmTable
  - 템플릿 `App.css` 삭제
- **목업 데이터** (`src/mocks/data.ts`): 위성 6대, 알람 3건
  - 경고(SAFE + 배터리 15.2), 교신 중 2대, 텔레메트리 없음 1대 포함
- **목업 타입** (`src/types/api.ts`): 서버 응답 필드명에 맞춤
  - `GET /satellites`: `server/src/satellites/dto/satellite-summary.dto.ts`, `satellites.service.ts`(listWithLatest), `database/entities/telemetry.entity.ts`
  - `GET /alarms`: `server/src/alarms/alarms.controller.ts`, `database/entities/alarm.entity.ts`
- **판정 함수**: `src/lib/status.ts`의 `getSatStatus()` 하나에 모음
  - 경고 = SAFE 또는 battery < 20
  - 교신 = rssi != null
- **data-\* 속성**: `data-warning`, `data-contact`, `data-selected`. 다음 단계에서 `data-[...]:` 변형으로 색을 입힘

### 결정 & 이유
- 클릭, 기간 선택, 모드 전환은 버튼만 둠. 선택 위성은 첫 번째로 고정
- 날짜는 JSON에서 문자열이 되므로 목업 타입에서 `string`(ISO 8601)으로 둠. bigint id도 문자열
- shared 패키지는 쓰지 않고, 서버 enum 값(`NORMAL|SAFE` 등)을 타입에 직접 적음

### 검증
- `npm run build:dashboard` 성공, 루트 `npm run build` 성공
- `npm run dev:dashboard`: 5173 응답 200. 헤드리스 Chrome으로 렌더링을 확인한 뒤 종료함
  - 요약: 전체 6 / 경고 1 / SAFE 1 / 교신 중 2
  - `data-selected="true"` 1개

### 확인 못 한 것
- 실제 서버를 띄워 JSON을 받아 비교하지는 않음. 엔티티·DTO 코드만 보고 맞춤

---

## 2026-11-07 — dashboard workspace 추가 (Vite React 템플릿)

작업 브랜치 `dev`. 화면 코드는 아직 없음 (템플릿 그대로, 직접 작성 예정).

### 한 일
- `npm create vite@latest dashboard -- --template react-ts --no-immediate --no-interactive` (create-vite 9.3.4)
  - `dashboard/src` 템플릿 코드는 수정하지 않음
- 루트 `package.json`
  - workspaces에 `dashboard` 추가
  - scripts에 `dev:dashboard`, `build:dashboard` 추가
  - 기존 `build`는 그대로 둬서 dashboard는 포함되지 않음
- 의존성 정확한 버전 고정
  - 템플릿이 써 준 `^`/`~`는 `.npmrc`의 `save-exact`가 적용되지 않음 (`npm install <pkg>`로 추가할 때만 적용)
  - 그래서 설치된 버전으로 직접 바꿈
  - react·react-dom 19.3.1, vite 8.3.6, @vitejs/plugin-react 6.2.1, typescript 7.0.2, oxlint 1.92.0, @types/react·@types/react-dom 19.3.0, @types/node 24.19.2
- `.gitignore`: `vite.config.*.timestamp-*` 추가 (설정 번들 임시 파일)
  - dist, dist-ssr, *.local, node_modules(.vite, .tmp 캐시 포함)는 이미 무시됨 (dashboard/.gitignore 템플릿과 루트 규칙)
- CLAUDE.md 구조 섹션 갱신

### 결정 & 이유
- **tsconfig**: dashboard는 템플릿 tsconfig를 그대로 쓰고 `tsconfig.base.json`을 extends하지 않음
  - base는 Node용 설정(nodenext, types node, DOM lib 없음)이라 브라우저 앱과 맞지 않음
- **TypeScript 버전이 둘**: dashboard만 템플릿 기본인 TypeScript 7.0.2를 씀
  - 루트 6.0.3은 `@nestjs/swagger`의 peer 범위 때문에 올릴 수 없음
  - npm이 7.0.2를 `dashboard/node_modules`에만 설치함. 확인 결과 루트 tsc 6.0.3, dashboard tsc 7.0.2
- **shared는 dashboard 의존성에 넣지 않음**: 클라이언트는 Swagger 문서 기준으로 통신함

### 검증
- `npm run dev:dashboard`: http://localhost:5173 200, `/src/main.tsx` 200 → 확인 후 종료, 5173 포트 비어 있음
- `npm run build:dashboard` 성공 (`tsc -b && vite build`, JS 222 kB / gzip 69 kB)
- 루트 `npm run build` 성공 (shared → simulator, server)
- `npm install` 취약점 0건. `@scarf/scarf` postinstall 미허용 경고는 그대로 (이전부터 있던 것)

### 남은 문제 (확인만 하고 손대지 않음)
- **CORS**: 서버에 CORS 설정이 없음. dashboard에서 API를 부르려면 Vite 개발 프록시나 서버 CORS가 필요함
- **API 경로**: 서버에 전역 prefix가 없음. API 경로는 `/satellites` 등이고, Swagger만 `/api/docs`에 있음

---

## 2026-11-04 — bench 신뢰도 보완, 개선 C(풀 크기) 측정

작업 브랜치 `dev`. 사용자가 자는 동안 진행. 승인이 필요한 작업은 하지 않고 아래 "하지 않은 것"에 남김.

### 한 일
- **서버 지표 추가** (e0ad0f5): `/metrics/ingest`에 flush 소요 시간 히스토그램, 마지막 커밋 시각·마지막 발행 시각 (서버 시계)
- **bench 보완** (32afa56)
  - `docker stats`의 불가능한 값(postgres > 800 %, mosquitto > 100 %) 제외, 뺀 수 기록
  - 시계 차이를 단계 시작·끝에 재고 drift 기록
  - 따라잡기를 서버 시계 기준으로 (DB 시계 값은 참고)
  - 1초마다 `/metrics/ingest`를 읽어 서버 시계 기준 저장률·"커밋 0건인 초" 계산
  - 단계 시작·끝 loadavg·스왑, 저부하 역전 확인용 서버 CPU µs/msg·flush 시간
  - `bench/compare.mjs`: 서버 설정이 같은 실행끼리 묶어 평균(범위) 표
- **`DB_POOL_SIZE`** (3a2d3fe): 3~90, 기본 10. TypeORM 풀과 동시 저장 수(풀 - 2)에 같이 적용
- **개선 C 측정**: 풀 10/20/30 × 2회, 8단계 (10대 ~ 4000대 / 200ms). 결과 `docs/perf-improvements.md` "개선 C"

### 결과
- **기본값 10 유지.** 같은 풀끼리의 편차가 풀 사이 차이보다 크다
  - 2000대 / 200ms: 같은 풀 10에서 p99 124 ms vs 12,272 ms
  - 3000대 / 200ms: 같은 풀 20이 한 번은 통과(p99 253 ms, 버림 0), 한 번은 한계(버림 19,000)
  - 멈춤이 없는 실행은 15,000/s에서도 풀 대기 max 50 이하
  - 실패한 실행은 풀과 무관하게 서버(µs/msg 1.4배)·DB(flush 4~14배)가 함께 느렸다
- **처리 상한은 10,000/s보다 위**: 15,000/s는 4회 중 2회, 20,000/s는 2회 중 1회(19,695 rows/s, p50 80 ms) 따라잡음
- 유실은 전부 역압 버림. MQTT 구간 유실 0
- 저부하 역전은 6번 모두 같은 방향 (같은 500행 flush가 1,000/s에서 48~65 ms, 5,000/s에서 38~44 ms). 원인 미검증
- 다음 병목: 서버 Node CPU (20,000/s에서 평균 66 %, 메시지당 약 34 µs)

### 하지 않은 것 (승인 필요 또는 범위 밖)
- `powermetrics`로 코어 종류·클럭 확인: sudo가 필요해 하지 않음
- 다른 프로젝트 Docker 이미지 정리, Docker.raw 줄이기: 삭제 작업이라 제안만 유지
- 서버 종료 로그의 "버림"에 역압 버림이 빠진 것, 시뮬레이터 `MaxListenersExceededWarning` (2000대 이상): 요청 범위 밖이라 기록만

### 다음 할 일
- 15,000/s 이상 비교가 필요하면: 재부팅 후(스왑 비운 상태), 다른 앱을 닫고 3회 이상 반복
- 서버 메시지당 CPU 줄이기 또는 여러 프로세스로 나누기 (MQTT 공유 구독) 검토
- 저부하 지연(`FLUSH_MS` 200 ms 대기) 조정 여부 결정
- 위 두 가지 작은 결함(종료 로그 버림 건수, 시뮬레이터 리스너 경고) 수정 여부 결정

---

## 2026-11-03 — 측정 절차 표준화, 새 기준선, 개선 A(일괄 저장)·B(역압)

작업 브랜치 `dev`. 개선 C(풀 크기)는 시간 관계로 다음 작업으로 미룸.

### 한 일
- **사전 정리**
  - 디스크가 2 GB 줄었던 원인 조사 → 지금은 다시 늘어 있음 (아래 "발견한 것")
  - dev log 정리: 작업 기록은 이 파일 하나로 통일. 개인 로그에만 있던 공개 가능한 내용(도구 버전, 버전 선택 이유, 이름 변경 내역, 주의사항)을 옮김
- **측정 절차 표준화**
  - bench `RESET=1`: 단계마다 `telemetry`, `events`, `alarms` TRUNCATE
    - 실행 전 행 수를 보여 주고 `TRUNCATE`를 입력해야 진행 (사용자 승인 후 사용)
  - **수신→커밋 완료 지연**: 서버가 INSERT 커밋 직후 직접 잼
    - 로그 구간 히스토그램, 오차 약 2 %
    - `GET /metrics/ingest`, 10초 로그
    - bench가 단계마다 수집
  - 한계 판정 보완: 일시적 멈춤 1회로 "지연 계속 증가" 판정이 나지 않게, 마지막 3구간이 연속 증가할 때만
- **새 기준선 (v2)**: 빈 테이블에서 5단계 → `docs/perf-baseline.md` (v1 결과도 남김)
- **개선 A: 텔레메트리 일괄 저장** (`BATCH_SIZE` 500 / `FLUSH_MS` 200)
  - TypeORM 다중 행 insert
  - 동시 저장은 풀 - 2개까지
  - 종료 시 버퍼 저장
- **개선 B: 역압** (`MAX_BUFFER` 50,000 / `OVERFLOW_POLICY` drop-oldest)
  - 버린 건수: 지표 + 10초 로그
  - 인덱스 기반 큐
- 결과 정리: `docs/perf-improvements.md`

### 검증 결과
- 커밋 시간: 저부하 수신→커밋 p50 10 ms vs 수신→`inserted_at` 2.2 ms → 커밋·fsync가 1건당 약 8 ms
- 종료 시 버퍼 저장: 버퍼 300 / DB 0 상태에서 SIGINT → DB 300

| 단계 | 기준선 | A | A+B |
|---|---|---|---|
| 1000대 / 1000ms | p50 184 ms, 풀 대기 6,189 | p50 77 ms, 풀 대기 55 | p50 71 ms |
| 1000대 / 200ms (5,000/s) | **OOM, 유실 90 %** | 4,988 rows/s, p50 43 ms, 유실 0 | 4,919 rows/s, 유실 0 |
| 2000대 / 200ms (10,000/s) | — | — | 9,967 rows/s, p50 55 ms, 유실 0 |

- 역압 강제 과부하 (`BATCH_SIZE=1`, `MAX_BUFFER=5000`, 5,000/s, 60초)
  - 받음 298,000 = 커밋 202,560 + 버림 95,440
  - heap 184 MiB, OOM 없음
  - 수신→커밋 p50: drop-oldest 917 ms / drop-newest 1,417 ms

### 결정 & 이유
- 역압 정책 drop-oldest
  - 관제에서는 최신 상태가 중요하다
  - 지연이 더 낮다
  - 서버 안에서 버리므로 정확히 셀 수 있다
  - 수신 일시 정지는 QoS 0이라 브로커에서 몰래 버려지고, cmd ack까지 늦어져서 제외
- `MAX_BUFFER` 50,000: 1행 425 B → 약 21 MiB. 관측된 최장 멈춤 약 7.5 s × 5,000/s를 흡수
- 동시 저장을 풀 - 2개로 제한: 저장 대기를 버퍼 한 곳에 모아야 상한을 걸 수 있다. event·alarm·command·API용 커넥션도 남긴다
- B는 1000대 / 1000ms, 1000대 / 200ms, 2000대 / 200ms만 측정: 저부하 단계는 버퍼가 상한에 닿지 않아 A와 같은 경로
- 개선 C 미룸: 남은 시간 안에 5단계 × 3을 끝낼 수 없어서. 중간에 끊기면 데이터가 어긋날 수 있어 확실히 끝나는 데까지만 함

### 발견한 문제 / 다음 단계 고려 사항
- **디스크 2 GB 감소의 원인**: macOS 스왑 파일로 보인다
  - 스왑은 같은 APFS 컨테이너를 쓰고, 측정 때 12~13 GB(1 GB 파일 여러 개)까지 늘어난다
  - 지난 측정에서 서버 heap이 2 GB까지 늘면서 스왑이 커졌다가 이후 회수된 것으로 보인다
  - 프로젝트(152 MB)·DB 볼륨(219 MB)은 원인이 아니다
- **측정 잡음**: 호스트 메모리 압박 때문에 서버·시뮬레이터 이벤트 루프가 동시에 100~300 ms 멈추고, p99가 실행마다 크게 흔들린다. 비교는 p50·처리량 위주로 할 것
- `docker system df`가 다른 프로젝트 컨테이너의 손상된 스냅샷 때문에 실패한다 (GroundLink와 무관)
- 개선 A의 부작용: 저부하 지연이 약 200 ms(`FLUSH_MS`)로 늘었다. 필요하면 `FLUSH_MS`를 낮춰 조정
- SQL Server 전환 시 파라미터 2,100개 제한 → `BATCH_SIZE` ≤ 260
- A 이후 10초 로그의 저장 합계가 텔레메트리를 빼고 계산되던 버그를 고침 (bench 표는 DB 기준이라 영향 없음)
- 남은 병목: 10,000 msg/s까지 한계가 나오지 않았다. 다음으로 차오르는 것은 서버 Node CPU(평균 37 %, 최대 97 %)
- **결과 점검**: 불가능한 `docker stats` 값, DB 시계 어긋남, 저부하 지연 역전, 실행마다 다른 p99를 발견
  - `docs/perf-improvements.md` "측정 신뢰도" 섹션에 정리
  - A 3단계 postgres CPU 평균 정정 (48 → 36 %), 996 %를 멈춤의 근거로 쓴 문장 수정
- 다음 할 일 (다음 세션에서 이어서)
  - [ ] 시작 전: `cd infra && docker compose up -d`, `npm run build`
    - 이번 세션 끝에 `docker compose down`(볼륨 유지)으로 정리함
  - [ ] bench 보완 ("측정 신뢰도"의 고칠 것 1~4)
    - `docker stats` 이상값 제외
    - 단계 끝 시계 차이 측정, 서버 시계 기준 따라잡기
    - 다른 앱을 닫고 같은 조건 2~3회 반복
    - 저부하 역전 확인
  - [ ] 개선 C: `DB_POOL_SIZE` 환경변수 추가 (TypeORM `poolSize`, 동시 저장 수 = 풀 - 2)
    - 풀 10 / 20 / 30 × 5단계
    - 3000대 / 200ms 이상으로 한계 찾기
    - 2000대에서 event 즉시 저장이 풀에서 줄 서는 현상도 함께 확인
  - [ ] 그 뒤: synchronous_commit, QoS, 파티션, 시뮬레이터 발행 분산 검토 (이번에는 하지 않음)

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
  - README 제목 `satellite-ground` → `GroundLink`
  - compose 프로젝트 `satellite-ground` → `groundlink`
  - 컨테이너 `sg-mosquitto` / `sg-postgres` → `gl-mosquitto` / `gl-postgres`
  - 볼륨 `groundlink_*`
- 새 이름으로 재기동 후 재검증: 컨테이너 Up (postgres healthy), MQTT pub/sub, `SELECT 1` 성공
- CLAUDE.md 작성: 구조, 데이터 흐름, MQTT 토픽, 원칙, 실행 방법

### 결정 & 이유
- 볼륨을 `groundlink_*`로 새로 시작: compose 프로젝트 이름이 볼륨 이름 앞에 붙어서, 이름을 바꾸면 새 볼륨이 생긴다. DB에 실제 데이터가 없어서 옛 볼륨은 이어 쓰지 않음 (옛 볼륨은 승인 후 삭제)
- 클라이언트(WPF, React)는 server API로만 통신하고 DB·브로커에 직접 붙지 않음
- TypeORM 사용, DB 전용 문법 최소화 (나중에 SQL Server로 바꿀 수 있게)

### 주의
- compose의 `name:`을 바꾸면 볼륨·네트워크 이름도 같이 바뀐다. 바꾸기 전에 볼륨을 옮길지부터 정할 것

---

## 2026-11-03 — 환경설정 & 인프라

- 개발 환경: Apple Silicon(arm64), Homebrew 6.0, Git 2.39, Node v24.19 (LTS, nvm) / npm 11.17, @nestjs/cli 12.0.11 (전역), Docker 29.5 / Compose v5.1
- 인프라: `eclipse-mosquitto:2.0.22`, `postgres:17.11-alpine` (docker compose)
  - 포트는 127.0.0.1에만 바인딩
  - postgres healthcheck
  - named volume
- 검증: MQTT pub/sub(`test/hello`), psql `SELECT 1` 성공

### 결정 & 이유
- Node 버전 관리는 fnm을 새로 깔지 않고 기존 nvm 유지: 둘 다 쓰면 PATH가 충돌할 수 있음
- PostgreSQL 18 대신 17: 18부터 데이터 디렉터리 경로 규칙이 바뀜. 볼륨 설정을 단순하게 유지
- Mosquitto 2.1 대신 2.0.22: 2.0 안정 라인

### 주의
- mosquitto 로그의 `chown: ... Read-only file system` 경고는 conf를 `:ro`로 마운트해서 생김. 동작에는 문제 없음
- `infra/.env`의 비밀번호를 바꾸면 기존 볼륨에는 반영되지 않는다. 볼륨을 새로 만들어야 함 (`down -v`는 데이터 삭제라 승인 필요)
