import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Topics, type CommandAckMessage, type SetModeCommand, type SatMode } from '@groundlink/shared';
import { Command } from '../database/entities';
import { MqttService } from '../mqtt/mqtt.service';

const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

@Injectable()
export class CommandsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandsService.name);
  private readonly timeoutMs: number;
  /** ack를 기다리는 명령의 타임아웃 타이머 (cmdId → timer) */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly mqtt: MqttService,
    config: ConfigService,
    @InjectRepository(Command) private readonly commands: Repository<Command>,
  ) {
    const raw = config.get<string>('COMMAND_TIMEOUT_MS');
    const n = raw === undefined || raw.trim() === '' ? DEFAULT_COMMAND_TIMEOUT_MS : Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`COMMAND_TIMEOUT_MS=${raw} 가 올바르지 않습니다 (0보다 큰 ms)`);
    this.timeoutMs = n;
  }

  /**
   * 서버가 꺼져 있던 동안 남은 PENDING 명령 정리.
   * - 이미 타임아웃이 지난 명령: 바로 TIMEOUT
   * - 아직 시간이 남은 명령: 남은 시간만큼 타이머 등록
   */
  async onModuleInit(): Promise<void> {
    const pending = await this.commands.find({ where: { status: 'PENDING' }, select: { id: true, requestedAt: true } });
    const now = Date.now();
    const expired: string[] = [];
    for (const c of pending) {
      const remaining = c.requestedAt.getTime() + this.timeoutMs - now;
      if (remaining <= 0) expired.push(c.id);
      else this.scheduleTimeout(c.id, remaining);
    }
    if (expired.length > 0) {
      await this.commands.update(
        { id: In(expired), status: 'PENDING' },
        { status: 'TIMEOUT', resultMessage: this.timeoutMessage('서버 재시작 시 정리') },
      );
    }
    this.logger.log(
      `명령 타임아웃 ${this.timeoutMs}ms | 시작 시 PENDING ${pending.length}건 ` +
        `→ TIMEOUT ${expired.length}건, 대기 계속 ${pending.length - expired.length}건`,
    );
  }

  onModuleDestroy(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** commands 테이블에 PENDING으로 기록한 뒤 MQTT로 명령을 발행한다. */
  async sendSetMode(satId: string, mode: SatMode): Promise<Command> {
    const cmdId = randomUUID();
    const saved = await this.commands.save(
      this.commands.create({
        id: cmdId,
        satId,
        type: 'SET_MODE',
        params: { mode },
        status: 'PENDING',
        resultMessage: null,
        ackedAt: null,
      }),
    );

    const msg: SetModeCommand = { cmdId, satId, ts: Date.now(), type: 'SET_MODE', mode };
    try {
      await this.mqtt.publish(Topics.cmd(satId), msg, 1);
    } catch (err) {
      const message = `MQTT 발행 실패: ${(err as Error).message}`;
      await this.commands.update({ id: cmdId }, { status: 'FAILED', resultMessage: message });
      this.logger.error(`명령 ${cmdId} ${message}`);
      return { ...saved, status: 'FAILED', resultMessage: message };
    }

    this.scheduleTimeout(cmdId, this.timeoutMs);
    this.logger.log(`명령 발행 ${cmdId}: ${satId} SET_MODE ${mode}`);
    return saved;
  }

  /**
   * ack를 받아 결과를 갱신한다. PENDING 상태인 명령만 갱신하며,
   * 해당 명령이 없거나 이미 TIMEOUT 등으로 끝난 명령이면 false.
   */
  async applyAck(ack: CommandAckMessage): Promise<boolean> {
    const result = await this.commands.update(
      { id: ack.cmdId, satId: ack.satId, status: 'PENDING' },
      {
        status: ack.success ? 'SUCCESS' : 'FAILED',
        resultMessage: ack.message ?? null,
        ackedAt: new Date(ack.ts),
      },
    );
    if (!result.affected) {
      const existing = await this.commands.findOne({ where: { id: ack.cmdId }, select: { id: true, status: true } });
      if (existing) {
        this.logger.warn(`이미 ${existing.status} 상태인 명령의 ack (늦게 도착): ${ack.cmdId} (${ack.satId})`);
      } else {
        this.logger.warn(`알 수 없는 명령의 ack: ${ack.cmdId} (${ack.satId})`);
      }
      return false;
    }
    this.clearTimeout(ack.cmdId);
    this.logger.log(`명령 ack ${ack.cmdId}: ${ack.success ? 'SUCCESS' : 'FAILED'} - ${ack.message ?? ''}`);
    return true;
  }

  findBySatellite(satId: string, limit: number): Promise<Command[]> {
    return this.commands.find({ where: { satId }, order: { requestedAt: 'DESC' }, take: limit });
  }

  private scheduleTimeout(cmdId: string, delayMs: number): void {
    this.clearTimeout(cmdId);
    const timer = setTimeout(() => void this.expire(cmdId), delayMs);
    this.timers.set(cmdId, timer);
  }

  private clearTimeout(cmdId: string): void {
    const t = this.timers.get(cmdId);
    if (t) clearTimeout(t);
    this.timers.delete(cmdId);
  }

  /** 아직 PENDING이면 TIMEOUT으로. ack와 동시에 와도 status 조건으로 한쪽만 반영된다. */
  private async expire(cmdId: string): Promise<void> {
    this.timers.delete(cmdId);
    try {
      const result = await this.commands.update(
        { id: cmdId, status: 'PENDING' },
        { status: 'TIMEOUT', resultMessage: this.timeoutMessage() },
      );
      if (result.affected) this.logger.warn(`명령 타임아웃 ${cmdId}: ${this.timeoutMs}ms 안에 ack 없음`);
    } catch (err) {
      this.logger.error(`명령 타임아웃 처리 실패 ${cmdId}: ${(err as Error).message}`);
    }
  }

  private timeoutMessage(note?: string): string {
    return `${this.timeoutMs}ms 안에 ack 없음` + (note ? ` (${note})` : '');
  }
}
