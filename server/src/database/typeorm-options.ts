import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

/** pg 커넥션 풀 크기 기본값 (DB_POOL_SIZE로 변경) */
export const DEFAULT_POOL_SIZE = 10;

/** DB_POOL_SIZE 환경변수를 읽는다. 서버(TypeORM 풀)와 텔레메트리 일괄 저장(동시 저장 수)이 같은 값을 쓴다 */
export function readPoolSize(env: EnvGetter): number {
  const raw = env('DB_POOL_SIZE');
  if (raw === undefined || raw.trim() === '') return DEFAULT_POOL_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 3 || n > 90) throw new Error(`DB_POOL_SIZE=${raw} 가 올바르지 않습니다 (3~90 정수)`);
  return n;
}

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
    poolSize: readPoolSize(env),
  };
}
