import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiNotFoundResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Command, Telemetry } from '../database/entities';
import { CommandsService } from '../commands/commands.service';
import { CreateCommandDto } from './dto/create-command.dto';
import { SatelliteSummaryDto } from './dto/satellite-summary.dto';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';
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

  @Get(':id/telemetry')
  @ApiOkResponse({ type: [Telemetry], description: '텔레메트리 (최신순)' })
  @ApiNotFoundResponse({ description: '위성 없음' })
  telemetry(@Param('id') id: string, @Query() query: TelemetryQueryDto): Promise<Telemetry[]> {
    return this.satellites.findTelemetry(id, query);
  }

  @Post(':id/commands')
  @HttpCode(202)
  @ApiAcceptedResponse({
    type: Command,
    description: '명령을 발행했고 PENDING 상태로 기록함. ack가 오면 SUCCESS/FAILED로 갱신된다',
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
