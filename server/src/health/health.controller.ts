import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { MqttService } from '../mqtt/mqtt.service';

class HealthDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'] })
  db: 'up' | 'down';

  @ApiProperty({ enum: ['connected', 'disconnected'] })
  mqtt: 'connected' | 'disconnected';

  @ApiProperty({ description: '서버 가동 시간 (초)' })
  uptimeSec: number;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mqtt: MqttService,
  ) {}

  @Get()
  @ApiOkResponse({ type: HealthDto })
  async check(): Promise<HealthDto> {
    let db: HealthDto['db'] = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {
      // db = down
    }
    const mqtt = this.mqtt.connected ? 'connected' : 'disconnected';
    return {
      status: db === 'up' && mqtt === 'connected' ? 'ok' : 'degraded',
      db,
      mqtt,
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
