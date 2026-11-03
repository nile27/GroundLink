import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IngestMetricsService, type IngestMetricsSnapshot } from './ingest-metrics.service';

class LatencySummaryDto {
  @ApiProperty() count: number;
  @ApiProperty({ nullable: true, type: Number }) p50: number | null;
  @ApiProperty({ nullable: true, type: Number }) p95: number | null;
  @ApiProperty({ nullable: true, type: Number }) p99: number | null;
  @ApiProperty({ nullable: true, type: Number }) max: number | null;
  @ApiProperty({ nullable: true, type: Number }) avg: number | null;
}

class TelemetryCountsDto {
  @ApiProperty({ description: '받은 텔레메트리 (형식 검증 통과)' }) received: number;
  @ApiProperty({ description: 'DB 커밋까지 끝난 행' }) committed: number;
  @ApiProperty({ description: '저장 실패 행' }) failed: number;
}

class BufferDto {
  @ApiProperty({ description: '현재 저장 대기 행 수' }) size: number;
  @ApiProperty({ description: '시작 이후 최대 저장 대기 행 수' }) maxSize: number;
}

class FlushDto {
  @ApiProperty({ description: '다중 행 INSERT 횟수' }) count: number;
  @ApiProperty({ nullable: true, type: Number, description: 'INSERT 1회당 평균 행 수' }) avgRows: number | null;
}

class IngestLatencyDto {
  @ApiProperty({ type: LatencySummaryDto, description: '서버 수신 → INSERT 커밋 완료 (ms)' })
  receiveToCommit: LatencySummaryDto;

  @ApiProperty({ type: LatencySummaryDto, description: '위성 발행(ts) → INSERT 커밋 완료 (ms). 시뮬레이터와 서버 시계가 같을 때만 의미 있음' })
  publishToCommit: LatencySummaryDto;
}

class IngestMetricsDto implements IngestMetricsSnapshot {
  @ApiProperty() startedAt: string;
  @ApiProperty() uptimeSec: number;
  @ApiProperty({ type: TelemetryCountsDto }) telemetry: TelemetryCountsDto;
  @ApiProperty({ type: BufferDto }) buffer: BufferDto;
  @ApiProperty({ type: FlushDto }) flush: FlushDto;
  @ApiProperty({ type: IngestLatencyDto }) latencyMs: IngestLatencyDto;
}

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: IngestMetricsService) {}

  @Get('ingest')
  @ApiOkResponse({ type: IngestMetricsDto, description: '서버 시작 이후 수집 경로 지표 (건수, 커밋 지연 백분위)' })
  ingest(): IngestMetricsSnapshot {
    return this.metrics.snapshot();
  }
}
