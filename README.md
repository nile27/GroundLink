# GroundLink

가상 위성 지상국 시스템 — 위성 시뮬레이터(TypeScript) → Mosquitto(MQTT) → NestJS 수집 서버 → PostgreSQL

| 폴더 | 내용 |
|---|---|
| `shared/` | 메시지 타입·토픽 상수 (npm workspaces) |
| `simulator/` | 위성 시뮬레이터 |
| `server/` | 수집 서버 + REST API (Swagger: `/api/docs`) |
| `infra/` | Docker Compose (Mosquitto, PostgreSQL) |
| `docs/` | 성능 기준선 등 기록 |

## 로컬 실행

요구사항: Node.js 24+, Docker Desktop

```bash
# 1) 인프라
cd infra
cp .env.example .env      # 최초 1회
docker compose up -d      # Mosquitto(127.0.0.1:1883), PostgreSQL(127.0.0.1:5432)
cd ..

# 2) 의존성 설치 + 빌드 (shared → simulator, server 순서)
npm install
npm run build

# 3) 서버 (터미널 1)
npm run start:server      # http://127.0.0.1:3000/api/docs

# 4) 시뮬레이터 (터미널 2)
npm run start:sim         # Ctrl+C 로 종료
```

종료: 각 터미널에서 Ctrl+C, 인프라는 `cd infra && docker compose down` (볼륨은 유지됨)
