import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, Min } from 'class-validator';

export class TelemetrySummaryQueryDto {
  @ApiProperty({ description: '시작 시각 (포함). ISO 8601. 구간 경계의 기준점', example: '2026-11-07T08:00:00Z', format: 'date-time' })
  @IsISO8601({ strict: true })
  from: string;

  @ApiProperty({ description: '끝 시각 (포함). ISO 8601', example: '2026-11-07T09:00:00Z', format: 'date-time' })
  @IsISO8601({ strict: true })
  to: string;

  @ApiProperty({ description: '구간 길이 (초). 양의 정수', example: 60, minimum: 1, type: 'integer' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bucketSeconds: number;
}
