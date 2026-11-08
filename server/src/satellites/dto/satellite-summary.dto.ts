import { ApiProperty } from '@nestjs/swagger';
import { Telemetry } from '../../database/entities';

export class SatelliteSummaryDto {
  @ApiProperty({ example: 'SAT-001' })
  id: string;

  @ApiProperty({ nullable: true, type: String, description: '위성 이름. 없으면 null (항상 포함)' })
  name: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: Telemetry, nullable: true, description: '가장 최근 텔레메트리. 없으면 null' })
  latestTelemetry: Telemetry | null;
}
