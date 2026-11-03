import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TopicFilters,
  parseTopic,
  isAlarmMessage,
  isCommandAckMessage,
  isEventMessage,
  isTelemetryMessage,
  type TopicKind,
} from '@groundlink/shared';
import { Alarm, SatEvent, Satellite, Telemetry } from '../database/entities';
import { MqttService } from '../mqtt/mqtt.service';
import { CommandsService } from '../commands/commands.service';

type StoredKind = Exclude<TopicKind, 'cmd'>;

const RATE_LOG_INTERVAL_MS = 10_000;

/**
 * MQTT 메시지를 받아 DB에 저장한다.
 *
 * [기준선] 메시지 1건 = INSERT 1건. 일괄 저장·큐·집계 없음.
 * 성능 개선은 다음 단계에서 이 구현과 비교하며 진행한다.
 */
@Injectable()
export class IngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestService.name);

  /** satellites 테이블에 등록이 끝난(또는 진행 중인) 위성. 동시에 온 첫 메시지들이 중복 INSERT 하지 않게 Promise를 보관 */
  private readonly registered = new Map<string, Promise<void>>();

  private readonly window = this.emptyCounts();
  private readonly total = this.emptyCounts();
  private dropped = 0;
  private failed = 0;
  private rateTimer: NodeJS.Timeout;

  constructor(
    private readonly mqtt: MqttService,
    private readonly commands: CommandsService,
    @InjectRepository(Satellite) private readonly satellites: Repository<Satellite>,
    @InjectRepository(Telemetry) private readonly telemetry: Repository<Telemetry>,
    @InjectRepository(SatEvent) private readonly events: Repository<SatEvent>,
    @InjectRepository(Alarm) private readonly alarms: Repository<Alarm>,
  ) {}

  async onModuleInit(): Promise<void> {
    // 이미 등록된 위성 목록을 불러와 재시작 후 중복 등록을 피한다
    const existing = await this.satellites.find({ select: { id: true } });
    for (const s of existing) this.registered.set(s.id, Promise.resolve());

    await this.mqtt.subscribe(
      [TopicFilters.telemetry, TopicFilters.event, TopicFilters.alarm, TopicFilters.cmdAck],
      (topic, payload) => void this.handle(topic, payload),
    );
    this.rateTimer = setInterval(() => this.logRate(), RATE_LOG_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.rateTimer);
    this.logger.log(`최종 누적 저장: ${this.format(this.total)} | 버림 ${this.dropped}, 실패 ${this.failed}`);
  }

  private async handle(topic: string, payload: Buffer): Promise<void> {
    const parsed = parseTopic(topic);
    if (!parsed || parsed.kind === 'cmd') return;

    let msg: unknown;
    try {
      msg = JSON.parse(payload.toString());
    } catch {
      this.drop(topic, 'JSON 파싱 실패');
      return;
    }

    try {
      switch (parsed.kind) {
        case 'telemetry':
          if (!isTelemetryMessage(msg) || msg.satId !== parsed.satId) return this.drop(topic, '형식 오류');
          await this.ensureSatellite(msg.satId);
          await this.telemetry.insert({
            satId: msg.satId,
            ts: new Date(msg.ts),
            battery: msg.battery,
            temp: msg.temp,
            rssi: msg.rssi,
            mode: msg.mode,
            sunlit: msg.sunlit,
          });
          break;

        case 'event':
          if (!isEventMessage(msg) || msg.satId !== parsed.satId) return this.drop(topic, '형식 오류');
          await this.ensureSatellite(msg.satId);
          await this.events.insert({
            satId: msg.satId,
            ts: new Date(msg.ts),
            type: msg.type,
            detail: msg.detail ?? null,
          });
          break;

        case 'alarm':
          if (!isAlarmMessage(msg) || msg.satId !== parsed.satId) return this.drop(topic, '형식 오류');
          await this.ensureSatellite(msg.satId);
          await this.alarms.insert({
            satId: msg.satId,
            ts: new Date(msg.ts),
            type: msg.type,
            severity: msg.severity,
            value: msg.value,
            threshold: msg.threshold,
            message: msg.message,
          });
          break;

        case 'cmdAck':
          if (!isCommandAckMessage(msg) || msg.satId !== parsed.satId) return this.drop(topic, '형식 오류');
          if (!(await this.commands.applyAck(msg))) return; // 모르는 cmdId는 저장 건수에서 제외
          break;
      }
      this.count(parsed.kind);
    } catch (err) {
      this.failed++;
      this.logger.error(`저장 실패 (${topic}): ${(err as Error).message}`);
    }
  }

  /** 처음 보는 위성이면 satellites 테이블에 등록 */
  private ensureSatellite(satId: string): Promise<void> {
    let pending = this.registered.get(satId);
    if (!pending) {
      pending = this.satellites
        .createQueryBuilder()
        .insert()
        .into(Satellite)
        .values({ id: satId })
        .orIgnore()
        .execute()
        .then(() => this.logger.log(`새 위성 등록: ${satId}`));
      // 실패하면 다음 메시지에서 다시 시도하도록 기록을 지운다
      pending.catch(() => this.registered.delete(satId));
      this.registered.set(satId, pending);
    }
    return pending;
  }

  private drop(topic: string, reason: string): void {
    this.dropped++;
    this.logger.warn(`메시지 버림 (${topic}): ${reason}`);
  }

  private count(kind: StoredKind): void {
    this.window[kind]++;
    this.total[kind]++;
  }

  private logRate(): void {
    const sec = RATE_LOG_INTERVAL_MS / 1000;
    const sum = Object.values(this.window).reduce((a, b) => a + b, 0);
    const perSec = (n: number) => (n / sec).toFixed(1);
    this.logger.log(
      `[rate] 저장 ${perSec(sum)} rows/s ` +
        `(telemetry ${perSec(this.window.telemetry)}, event ${perSec(this.window.event)}, ` +
        `alarm ${perSec(this.window.alarm)}, ack ${perSec(this.window.cmdAck)}) | ` +
        `누적 ${this.format(this.total)} | 버림 ${this.dropped}, 실패 ${this.failed}`,
    );
    for (const k of Object.keys(this.window) as StoredKind[]) this.window[k] = 0;
  }

  private format(c: Record<StoredKind, number>): string {
    return `telemetry=${c.telemetry} event=${c.event} alarm=${c.alarm} ack=${c.cmdAck}`;
  }

  private emptyCounts(): Record<StoredKind, number> {
    return { telemetry: 0, event: 0, alarm: 0, cmdAck: 0 };
  }
}
