import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

type EnvGetter = (key: string) => string | undefined;

/**
 * 서버(AppModule)와 TypeORM CLI(data-source.ts)가 함께 쓰는 접속 설정.
 * 스키마는 마이그레이션으로만 바꾼다 (synchronize 사용 안 함).
 */
export function buildDataSourceOptions(env: EnvGetter): DataSourceOptions {
  const required = (key: string): string => {
    const v = env(key);
    if (!v) throw new Error(`환경변수 ${key} 가 없습니다 (infra/.env 확인)`);
    return v;
  };
  return {
    type: 'postgres',
    host: env('DB_HOST') ?? '127.0.0.1',
    port: Number(env('DB_PORT') ?? '5432'),
    database: required('POSTGRES_DB'),
    username: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
    entities: ENTITIES,
    // dist/database/migrations/*.js (빌드 결과 기준)
    migrations: [join(__dirname, 'migrations', '*.js')],
    migrationsTableName: 'migrations',
    synchronize: false,
  };
}
