import { ApiProperty } from '@nestjs/swagger';
import { Telemetry } from '../../database/entities';

export class SatelliteSummaryDto {
  @ApiProperty({ example: 'SAT-001' })
  id: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  name: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: Telemetry, nullable: true, description: '가장 최근 텔레메트리. 없으면 null' })
  latestTelemetry: Telemetry | null;
}
