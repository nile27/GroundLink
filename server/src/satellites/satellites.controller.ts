import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Command, Telemetry } from '../database/entities';
import { CommandsService } from '../commands/commands.service';
import { CreateCommandDto } from './dto/create-command.dto';
import { SatelliteStatsDto } from './dto/satellite-stats.dto';
import { SatelliteSummaryDto } from './dto/satellite-summary.dto';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';
import { TelemetrySummaryPointDto } from './dto/telemetry-summary-point.dto';
import { TelemetrySummaryQueryDto } from './dto/telemetry-summary-query.dto';
import { SatellitesService } from './satellites.service';

@ApiTags('satellites')
@Controller('satellites')
export class SatellitesController {
  constructor(
    private readonly satellites: SatellitesService,
    private readonly commands: CommandsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [SatelliteSummaryDto], description: '위성 목록 + 각 위성 최신 텔레메트리' })
  list(): Promise<SatelliteSummaryDto[]> {
    return this.satellites.listWithLatest();
  }

  // 고정 경로는 ':id' 로 시작하는 라우트보다 먼저 선언한다 (나중에 GET /satellites/:id 가 생겨도 stats 가 가려지지 않게)
  @Get('stats')
  @ApiOkResponse({ type: SatelliteStatsDto, description: '각 위성 최신 텔레메트리 기준 집계' })
  stats(): Promise<SatelliteStatsDto> {
    return this.satellites.stats();
  }

  @Get(':id/telemetry')
  @ApiOkResponse({ type: [Telemetry], description: '텔레메트리 (최신순)' })
  @ApiNotFoundResponse({ description: '위성 없음' })
  telemetry(@Param('id') id: string, @Query() query: TelemetryQueryDto): Promise<Telemetry[]> {
    return this.satellites.findTelemetry(id, query);
  }

  @Get(':id/telemetry/summary')
  @ApiOkResponse({
    type: [TelemetrySummaryPointDto],
    description: '배터리 구간 요약 (t 오름차순). 데이터 없는 구간은 빠진다',
  })
  @ApiBadRequestResponse({ description: 'from/to/bucketSeconds 형식 오류 또는 from > to' })
  @ApiNotFoundResponse({ description: '위성 없음' })
  telemetrySummary(
    @Param('id') id: string,
    @Query() query: TelemetrySummaryQueryDto,
  ): Promise<TelemetrySummaryPointDto[]> {
    return this.satellites.summarizeTelemetry(id, query);
  }

  @Post(':id/commands')
  @HttpCode(202)
  @ApiAcceptedResponse({
    type: Command,
    description:
      '명령을 발행했고 PENDING 상태로 기록함. ack가 오면 SUCCESS/FAILED, COMMAND_TIMEOUT_MS(기본 10초) 안에 오지 않으면 TIMEOUT으로 갱신된다',
  })
  @ApiNotFoundResponse({ description: '위성 없음' })
  async sendCommand(@Param('id') id: string, @Body() dto: CreateCommandDto): Promise<Command> {
    await this.satellites.assertExists(id);
    return this.commands.sendSetMode(id, dto.mode);
  }

  @Get(':id/commands')
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 20, minimum: 1, maximum: 200 } })
  @ApiOkResponse({ type: [Command], description: '명령 이력 (최신순). ack 결과 확인용' })
  @ApiNotFoundResponse({ description: '위성 없음' })
  async listCommands(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<Command[]> {
    await this.satellites.assertExists(id);
    return this.commands.findBySatellite(id, Math.min(Math.max(limit, 1), 200));
  }
}
