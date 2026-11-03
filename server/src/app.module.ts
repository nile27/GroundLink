import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENV_FILE_PATHS } from './config/env';
import { buildDataSourceOptions } from './database/typeorm-options';
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
      useFactory: (config: ConfigService) => buildDataSourceOptions((key) => config.get<string>(key)),
    }),
    MqttModule,
    IngestModule,
    SatellitesModule,
    AlarmsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
