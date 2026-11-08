import { ApiProperty } from '@nestjs/swagger';
import { COMMAND_TYPES, SAT_MODES, type CommandType, type SatMode } from '@groundlink/shared';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Satellite } from './satellite.entity';

/** TIMEOUT: COMMAND_TIMEOUT_MS 안에 ack가 오지 않음 */
export const COMMAND_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

/**
 * params 의 문서용 형태. 명령 종류가 SET_MODE 하나라 { mode } 뿐 (commands.service.ts sendSetMode).
 * 컬럼 타입(Record<string, unknown>)과 저장 내용은 그대로, Swagger 선언만 맞춘다.
 */
export class SetModeParamsDto {
  @ApiProperty({ enum: SAT_MODES })
  mode: SatMode;
}

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

  @ApiProperty({ type: SetModeParamsDto, description: '명령 파라미터 (SET_MODE: { mode })' })
  @Column({ type: 'simple-json' })
  params: Record<string, unknown>;

  @ApiProperty({ enum: COMMAND_STATUSES })
  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: CommandStatus;

  @ApiProperty({ nullable: true, type: String, description: 'ack 메시지 또는 실패·타임아웃 사유. PENDING 동안 null (항상 포함)' })
  @Column({ name: 'result_message', type: 'varchar', length: 255, nullable: true })
  resultMessage: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @ApiProperty({ nullable: true, type: Date, description: 'ack 수신 시각 (위성 시각). ack 전·TIMEOUT·MQTT 발행 실패면 null (항상 포함)' })
  @Column({ name: 'acked_at', type: 'timestamptz', nullable: true })
  ackedAt: Date | null;
}
