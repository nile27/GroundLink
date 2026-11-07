import { ApiProperty } from '@nestjs/swagger';

/** 배터리 구간 요약 한 점 */
export class TelemetrySummaryPointDto {
  @ApiProperty({ description: '구간 시작 시각 (from 기준으로 bucketSeconds 간격)', type: String, format: 'date-time' })
  t: Date;

  @ApiProperty({ description: '구간 안 배터리 최솟값 (%)', example: 70.1 })
  min: number;

  @ApiProperty({ description: '구간 안 배터리 최댓값 (%)', example: 77.9 })
  max: number;

  @ApiProperty({ description: '구간 안 배터리 평균 (%)', example: 74.2 })
  avg: number;
}
