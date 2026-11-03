import { Global, Module } from '@nestjs/common';
import { IngestMetricsService } from './ingest-metrics.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  providers: [IngestMetricsService],
  controllers: [MetricsController],
  exports: [IngestMetricsService],
})
export class MetricsModule {}
