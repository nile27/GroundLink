import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alarm, SatEvent, Satellite, Telemetry } from '../database/entities';
import { CommandsModule } from '../commands/commands.module';
import { IngestService } from './ingest.service';

@Module({
  imports: [TypeOrmModule.forFeature([Satellite, Telemetry, SatEvent, Alarm]), CommandsModule],
  providers: [IngestService],
})
export class IngestModule {}
