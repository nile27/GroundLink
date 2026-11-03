import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alarm } from '../database/entities';

@ApiTags('alarms')
@Controller('alarms')
export class AlarmsController {
  constructor(@InjectRepository(Alarm) private readonly alarms: Repository<Alarm>) {}

  @Get()
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 50, minimum: 1, maximum: 500 } })
  @ApiOkResponse({ type: [Alarm], description: '최근 알람 (최신순)' })
  list(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number): Promise<Alarm[]> {
    return this.alarms.find({ order: { ts: 'DESC' }, take: Math.min(Math.max(limit, 1), 500) });
  }
}
