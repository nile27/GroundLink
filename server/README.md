# @groundlink/server

NestJS 수집 서버. MQTT 메시지를 구독해 PostgreSQL에 저장하고 REST API를 제공합니다.

## 실행

```bash
# 사전: infra 컨테이너 실행 (cd infra && docker compose up -d)
# 루트에서 (최초 1회: npm install && npm run build)
npm run start:server

# 개발 중 자동 재시작 (전역 @nestjs/cli 사용)
cd server && npm run start:dev
```

- API 문서(Swagger): http://127.0.0.1:3000/api/docs (JSON: `/api/docs-json`)
- SIGINT/SIGTERM → MQTT·DB 연결 정리 후 종료

## 설정

- DB 이름·사용자·비밀번호: `infra/.env`의 `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` (docker compose와 같은 값)
- 서버 전용 값: `server/.env` (선택, `.env.example` 참고). 같은 키는 `infra/.env`보다 우선

| 변수 | 기본값 |
|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3000` |
| `MQTT_URL` | `mqtt://127.0.0.1:1883` |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `5432` |

## 마이그레이션

스키마는 TypeORM 마이그레이션으로만 바꾼다 (`synchronize: false`). 서버는 시작할 때 마이그레이션을 자동 실행하지 않는다.

```bash
cd server
npm run migration:run                                   # 대기 중인 마이그레이션 적용
npm run migration:show                                  # 적용 상태 확인
npm run migration:revert                                # 마지막 1개 되돌리기
npm run migration:generate -- src/database/migrations/<이름>   # 엔티티 변경 → 마이그레이션 생성
```

- 스크립트는 빌드 후 `dist/database/data-source.js`를 사용한다 (서버와 같은 .env를 읽음)
- 새 DB: `migration:run` 한 번으로 전체 스키마 생성
- `synchronize`로 만들었던 기존 DB는 `InitialSchema`를 적용된 것으로 기록해 두었다 (`docs/devlog.md` 참고)

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | DB·MQTT 연결 상태 |
| GET | `/satellites` | 위성 목록 + 각 위성 최신 텔레메트리 |
| GET | `/satellites/:id/telemetry?from=&to=&limit=` | 텔레메트리 (최신순, from/to는 ISO 8601 또는 epoch ms, limit 기본 100·최대 1000) |
| POST | `/satellites/:id/commands` | `{"type":"SET_MODE","mode":"SAFE"}` → 202 + PENDING 명령. ack가 오면 SUCCESS/FAILED로 갱신 |
| GET | `/satellites/:id/commands?limit=` | 명령 이력과 ack 결과 |
| GET | `/alarms?limit=` | 최근 알람 (기본 50·최대 500) |

## 테이블

| 테이블 | 내용 |
|---|---|
| `satellites` | 처음 보는 위성을 자동 등록 |
| `telemetry` | 텔레메트리. 인덱스 `(sat_id, ts)` |
| `events` | 이벤트. 인덱스 `(sat_id, ts)` |
| `alarms` | 알람. 인덱스 `(ts)` |
| `commands` | 명령과 ack 결과 (`id` = MQTT `cmdId`) |

## 구조

```
src/
├─ main.ts                 부트스트랩, ValidationPipe, Swagger
├─ app.module.ts           Config / TypeORM / 각 모듈 조립
├─ config/env.ts           .env 파일 경로 (server/.env → infra/.env)
├─ mqtt/                   mqtt.js 래퍼 서비스 (연결·구독·발행)
├─ ingest/                 MQTT 수신 → 메시지 1건당 INSERT 1건, 10초마다 저장률 로그
├─ commands/               명령 기록·발행, ack 반영
├─ satellites/             /satellites API
├─ alarms/                 /alarms API
├─ health/                 /health
├─ database/entities/      TypeORM 엔티티
├─ database/migrations/    마이그레이션
├─ database/typeorm-options.ts  접속 설정 (서버·CLI 공용)
└─ database/data-source.ts      TypeORM CLI용 DataSource
```

> 현재는 **성능 개선 전 기준선** 구현입니다. 메시지마다 INSERT를 하나씩 하고, `/satellites`는 위성마다 쿼리를 1건씩 실행합니다(N+1).
> 측정값은 `docs/perf-baseline.md`에 있습니다.
