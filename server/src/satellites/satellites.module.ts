import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Satellite, Telemetry } from '../database/entities';
import { CommandsModule } from '../commands/commands.module';
import { SatellitesController } from './satellites.controller';
import { SatellitesService } from './satellites.service';

@Module({
  imports: [TypeOrmModule.forFeature([Satellite, Telemetry]), CommandsModule],
  controllers: [SatellitesController],
  providers: [SatellitesService],
})
export class SatellitesModule {}
