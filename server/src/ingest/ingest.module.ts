import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alarm, SatEvent, Satellite, Telemetry } from '../database/entities';
import { CommandsModule } from '../commands/commands.module';
import { IngestService } from './ingest.service';
import { TelemetryWriterService } from './telemetry-writer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Satellite, Telemetry, SatEvent, Alarm]), CommandsModule],
  providers: [IngestService, TelemetryWriterService],
})
export class IngestModule {}
