import { ApiProperty } from '@nestjs/swagger';
import { COMMAND_TYPES, type CommandType } from '@groundlink/shared';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Satellite } from './satellite.entity';

/** TIMEOUT: COMMAND_TIMEOUT_MS 안에 ack가 오지 않음 */
export const COMMAND_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

@Entity('commands')
@Index('idx_commands_sat_requested', ['satId', 'requestedAt'])
export class Command {
  @ApiProperty({ description: '명령 ID (UUID). MQTT cmd/ack의 cmdId와 같음' })
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @ApiProperty()
  @Column({ name: 'sat_id', type: 'varchar', length: 32 })
  satId: string;

  @ManyToOne(() => Satellite, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sat_id' })
  satellite?: Satellite;

  @ApiProperty({ enum: COMMAND_TYPES })
  @Column({ type: 'varchar', length: 32 })
  type: CommandType;

  @ApiProperty({ type: Object, example: { mode: 'SAFE' } })
  @Column({ type: 'simple-json' })
  params: Record<string, unknown>;

  @ApiProperty({ enum: COMMAND_STATUSES })
  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: CommandStatus;

  @ApiProperty({ required: false, nullable: true, type: String, description: 'ack 메시지 또는 실패·타임아웃 사유' })
  @Column({ name: 'result_message', type: 'varchar', length: 255, nullable: true })
  resultMessage: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @ApiProperty({ required: false, nullable: true, type: Date })
  @Column({ name: 'acked_at', type: 'timestamptz', nullable: true })
  ackedAt: Date | null;
}
