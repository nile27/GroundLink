# satellite-ground

가상 위성 지상국 시스템 — 위성 시뮬레이터(TypeScript) → Mosquitto(MQTT) → NestJS 수집 서버 → PostgreSQL

## 로컬 실행

```bash
cd infra
cp .env.example .env      # 최초 1회
docker compose up -d      # Mosquitto(127.0.0.1:1883), PostgreSQL(127.0.0.1:5432) 실행
docker compose ps         # 상태 확인
docker compose down       # 종료 (데이터는 named volume에 유지)
```
