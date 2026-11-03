import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alarm } from '../database/entities';
import { AlarmsController } from './alarms.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Alarm])],
  controllers: [AlarmsController],
})
export class AlarmsModule {}
