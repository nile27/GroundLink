import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { ENV_FILE_PATHS } from '../config/env';
import { buildDataSourceOptions } from './typeorm-options';

/**
 * TypeORM CLI 전용 DataSource (migration:generate / run / revert).
 * 서버와 같은 .env 파일을 읽는다. 이미 설정된 환경변수는 덮어쓰지 않으므로
 * 앞에 있는 파일(server/.env)이 우선하고, 셸에서 준 값이 가장 우선한다.
 */
for (const path of ENV_FILE_PATHS) {
  if (existsSync(path)) process.loadEnvFile(path);
}

export default new DataSource(buildDataSourceOptions((key) => process.env[key]));
