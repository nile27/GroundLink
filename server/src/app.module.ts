import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENV_FILE_PATHS } from './config/env';
import { ENTITIES } from './database/entities';
import { MqttModule } from './mqtt/mqtt.module';
import { IngestModule } from './ingest/ingest.module';
import { SatellitesModule } from './satellites/satellites.module';
import { AlarmsModule } from './alarms/alarms.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ENV_FILE_PATHS }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: Number(config.get<string>('DB_PORT', '5432')),
        database: config.getOrThrow<string>('POSTGRES_DB'),
        username: config.getOrThrow<string>('POSTGRES_USER'),
        password: config.getOrThrow<string>('POSTGRES_PASSWORD'),
        entities: ENTITIES,
        // 개발 단계: 엔티티 기준으로 테이블 자동 생성/변경. 운영 전에는 마이그레이션으로 전환
        synchronize: config.get<string>('DB_SYNC', 'true') !== 'false',
      }),
    }),
    MqttModule,
    IngestModule,
    SatellitesModule,
    AlarmsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
