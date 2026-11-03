import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TelemetryQueryDto {
  @ApiPropertyOptional({
    description: '시작 시각 (포함). ISO 8601 또는 epoch ms',
    example: '2026-11-03T08:00:00Z',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: '끝 시각 (포함). ISO 8601 또는 epoch ms', example: '1793750400000' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: '최대 행 수 (최신순)', default: 100, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
