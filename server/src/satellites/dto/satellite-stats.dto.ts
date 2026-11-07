import { ApiProperty } from '@nestjs/swagger';

/** 위성 상태 집계. 각 위성의 최신 텔레메트리 기준 (신선도 기준 없음) */
export class SatelliteStatsDto {
  @ApiProperty({ description: '전체 위성 수 (텔레메트리 없는 위성 포함)', type: 'integer', example: 7 })
  total: number;

  @ApiProperty({ description: '경고: mode SAFE 또는 battery < 20', type: 'integer', example: 2 })
  warning: number;

  @ApiProperty({ description: 'mode SAFE', type: 'integer', example: 1 })
  safe: number;

  @ApiProperty({ description: '교신 중: 최신 rssi 가 null 이 아님', type: 'integer', example: 2 })
  contact: number;
}
