import { join } from 'node:path';

/**
 * 읽을 .env 파일 목록. 앞에 있는 파일이 우선한다.
 * - server/.env       : 서버 전용 설정 (선택)
 * - infra/.env        : POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD (docker compose와 공유)
 * dist/config/env.js 기준 경로로 계산하므로 실행 위치(cwd)와 무관하다.
 */
export const ENV_FILE_PATHS = [
  join(__dirname, '..', '..', '.env'),
  join(__dirname, '..', '..', '..', 'infra', '.env'),
];
