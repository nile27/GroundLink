import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Satellite, Telemetry } from '../database/entities';
import { SatelliteSummaryDto } from './dto/satellite-summary.dto';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';

const DEFAULT_TELEMETRY_LIMIT = 100;

@Injectable()
export class SatellitesService {
  constructor(
    @InjectRepository(Satellite) private readonly satellites: Repository<Satellite>,
    @InjectRepository(Telemetry) private readonly telemetry: Repository<Telemetry>,
  ) {}

  /**
   * 위성 목록 + 각 위성의 최신 텔레메트리.
   * [기준선] 위성마다 쿼리 1건 (N+1). (sat_id, ts) 인덱스를 타므로 위성 수가 적을 때는 충분하다.
   */
  async listWithLatest(): Promise<SatelliteSummaryDto[]> {
    const sats = await this.satellites.find({ order: { id: 'ASC' } });
    return Promise.all(
      sats.map(async (s) => ({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        latestTelemetry: await this.telemetry.findOne({ where: { satId: s.id }, order: { ts: 'DESC' } }),
      })),
    );
  }

  async assertExists(satId: string): Promise<void> {
    if (!(await this.satellites.existsBy({ id: satId }))) {
      throw new NotFoundException(`위성 ${satId} 없음`);
    }
  }

  async findTelemetry(satId: string, q: TelemetryQueryDto): Promise<Telemetry[]> {
    await this.assertExists(satId);

    const from = parseTime(q.from, 'from');
    const to = parseTime(q.to, 'to');
    if (from && to && from > to) throw new BadRequestException('from 이 to 보다 늦습니다');

    const where: FindOptionsWhere<Telemetry> = { satId };
    if (from && to) where.ts = Between(from, to);
    else if (from) where.ts = MoreThanOrEqual(from);
    else if (to) where.ts = LessThanOrEqual(to);

    return this.telemetry.find({ where, order: { ts: 'DESC' }, take: q.limit ?? DEFAULT_TELEMETRY_LIMIT });
  }
}

/** ISO 8601 문자열 또는 epoch ms 숫자 문자열을 Date로 */
function parseTime(value: string | undefined, name: string): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const d = /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${name}: ISO 8601 또는 epoch ms 형식이어야 합니다 (${value})`);
  }
  return d;
}
