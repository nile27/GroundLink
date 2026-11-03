import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Topics, type CommandAckMessage, type SetModeCommand, type SatMode } from '@groundlink/shared';
import { Command } from '../database/entities';
import { MqttService } from '../mqtt/mqtt.service';

@Injectable()
export class CommandsService {
  private readonly logger = new Logger(CommandsService.name);

  constructor(
    private readonly mqtt: MqttService,
    @InjectRepository(Command) private readonly commands: Repository<Command>,
  ) {}

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

    this.logger.log(`명령 발행 ${cmdId}: ${satId} SET_MODE ${mode}`);
    return saved;
  }

  /** ack를 받아 결과를 갱신한다. 해당 명령이 없으면 false. */
  async applyAck(ack: CommandAckMessage): Promise<boolean> {
    const result = await this.commands.update(
      { id: ack.cmdId, satId: ack.satId },
      {
        status: ack.success ? 'SUCCESS' : 'FAILED',
        resultMessage: ack.message ?? null,
        ackedAt: new Date(ack.ts),
      },
    );
    if (!result.affected) {
      this.logger.warn(`알 수 없는 명령의 ack: ${ack.cmdId} (${ack.satId})`);
      return false;
    }
    this.logger.log(`명령 ack ${ack.cmdId}: ${ack.success ? 'SUCCESS' : 'FAILED'} - ${ack.message ?? ''}`);
    return true;
  }

  findBySatellite(satId: string, limit: number): Promise<Command[]> {
    return this.commands.find({ where: { satId }, order: { requestedAt: 'DESC' }, take: limit });
  }
}
