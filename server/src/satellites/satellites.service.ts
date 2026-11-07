import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Satellite, Telemetry } from '../database/entities';
import { SatelliteStatsDto } from './dto/satellite-stats.dto';
import { SatelliteSummaryDto } from './dto/satellite-summary.dto';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';
import { TelemetrySummaryPointDto } from './dto/telemetry-summary-point.dto';
import { TelemetrySummaryQueryDto } from './dto/telemetry-summary-query.dto';

const DEFAULT_TELEMETRY_LIMIT = 100;

/** 경고 기준 배터리 (%). 미만이면 경고 (dashboard 판정과 같은 값) */
export const WARNING_BATTERY = 20;

/**
 * 각 위성의 최신 텔레메트리 1행 (없으면 t.* 가 모두 NULL). satellites 별칭은 s.
 * PostgreSQL LATERAL. SQL Server로 바꿀 때는 OUTER APPLY (SELECT TOP 1 ...)로 대응한다.
 */
const LATEST_TELEMETRY_JOIN = `LEFT JOIN LATERAL (
    SELECT * FROM telemetry t WHERE t.sat_id = s.id ORDER BY t.ts DESC LIMIT 1
  ) t ON true`;

const LATEST_COLUMNS = `t.id AS t_id, t.sat_id AS t_sat_id, t.ts AS t_ts, t.battery AS t_battery, t.temp AS t_temp,
  t.rssi AS t_rssi, t.mode AS t_mode, t.sunlit AS t_sunlit, t.received_at AS t_received_at, t.inserted_at AS t_inserted_at`;

/** pg 드라이버가 돌려주는 행. bigint는 string, real은 number, timestamptz는 Date */
interface LatestRow {
  id: string;
  name: string | null;
  created_at: Date;
  t_id: string | null;
  t_sat_id: string;
  t_ts: Date;
  t_battery: number;
  t_temp: number;
  t_rssi: number | null;
  t_mode: Telemetry['mode'];
  t_sunlit: boolean;
  t_received_at: Date | null;
  t_inserted_at: Date;
}

/** 키 순서는 Telemetry 엔티티 선언 순서와 같게 (이전 응답과 동일한 JSON) */
function toTelemetry(r: LatestRow): Telemetry | null {
  if (r.t_id === null) return null;
  return {
    id: r.t_id,
    satId: r.t_sat_id,
    ts: r.t_ts,
    battery: r.t_battery,
    temp: r.t_temp,
    rssi: r.t_rssi,
    mode: r.t_mode,
    sunlit: r.t_sunlit,
    receivedAt: r.t_received_at,
    insertedAt: r.t_inserted_at,
  };
}

@Injectable()
export class SatellitesService {
  constructor(
    @InjectRepository(Satellite) private readonly satellites: Repository<Satellite>,
    @InjectRepository(Telemetry) private readonly telemetry: Repository<Telemetry>,
  ) {}

  /**
   * 위성 목록 + 각 위성의 최신 텔레메트리. 쿼리 1건.
   * 위성마다 (sat_id, ts) 인덱스를 역순으로 1행만 읽는다 (LEFT JOIN LATERAL ... LIMIT 1).
   * 응답 형태는 이전(N+1, 위성마다 findOne)과 같다: 키 순서·타입 포함.
   */
  async listWithLatest(): Promise<SatelliteSummaryDto[]> {
    const rows: LatestRow[] = await this.satellites.query(
      `SELECT s.id, s.name, s.created_at, ${LATEST_COLUMNS}
         FROM satellites s
         ${LATEST_TELEMETRY_JOIN}
        ORDER BY s.id`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      latestTelemetry: toTelemetry(r),
    }));
  }

  /**
   * 위성 상태 집계. listWithLatest와 같은 LATERAL로 최신 텔레메트리를 구해 쿼리 1건으로 센다.
   * 텔레메트리 없는 위성은 t.* 가 NULL이라 total에만 들어간다.
   */
  async stats(): Promise<SatelliteStatsDto> {
    const [row]: SatelliteStatsDto[] = await this.satellites.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE t.mode = 'SAFE' OR t.battery < $1)::int AS warning,
              count(*) FILTER (WHERE t.mode = 'SAFE')::int AS safe,
              count(*) FILTER (WHERE t.rssi IS NOT NULL)::int AS contact
         FROM satellites s
         ${LATEST_TELEMETRY_JOIN}`,
      [WARNING_BATTERY],
    );
    return { total: row.total, warning: row.warning, safe: row.safe, contact: row.contact };
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

  /**
   * 배터리 구간 요약. from~to(둘 다 포함)를 from 기준 bucketSeconds 간격으로 묶어 min/max/avg.
   * 묶기는 DB에서 date_bin (PostgreSQL 14+). 데이터 없는 구간은 응답에 없다. t 오름차순
   */
  async summarizeTelemetry(satId: string, q: TelemetrySummaryQueryDto): Promise<TelemetrySummaryPointDto[]> {
    await this.assertExists(satId);

    const from = new Date(q.from);
    const to = new Date(q.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('from, to 는 ISO 8601 형식이어야 합니다');
    }
    if (from > to) throw new BadRequestException('from 이 to 보다 늦습니다');

    const rows: { t: Date; min: number; max: number; avg: number }[] = await this.telemetry.query(
      `SELECT date_bin(make_interval(secs => $4), ts, $2) AS t,
              min(battery) AS min, max(battery) AS max, avg(battery) AS avg
         FROM telemetry
        WHERE sat_id = $1 AND ts >= $2 AND ts <= $3
        GROUP BY 1
        ORDER BY 1`,
      [satId, from, to, q.bucketSeconds],
    );
    return rows.map((r) => ({ t: r.t, min: r.min, max: r.max, avg: r.avg }));
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
