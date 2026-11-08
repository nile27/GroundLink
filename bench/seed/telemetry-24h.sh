#!/bin/bash
# SEED-001 24시간 텔레메트리 시드 실행. 저장소 루트에서: bash bench/seed/telemetry-24h.sh
# infra/.env 의 POSTGRES_DB / POSTGRES_USER 로 gl-postgres 컨테이너 안 psql 에 SQL 을 넘긴다
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$ROOT/infra/.env"; set +a
docker exec -i gl-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$ROOT/bench/seed/telemetry-24h.sql"
