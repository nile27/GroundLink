import { ApiProperty } from '@nestjs/swagger';
import { ALARM_SEVERITIES, ALARM_TYPES, type AlarmSeverity, type AlarmType } from '@groundlink/shared';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Satellite } from './satellite.entity';

@Entity('alarms')
@Index('idx_alarms_ts', ['ts'])
export class Alarm {
  @ApiProperty({ type: String })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ApiProperty()
  @Column({ name: 'sat_id', type: 'varchar', length: 32 })
  satId: string;

  @ManyToOne(() => Satellite, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sat_id' })
  satellite?: Satellite;

  @ApiProperty()
  @Column({ type: 'timestamptz' })
  ts: Date;

  @ApiProperty({ enum: ALARM_TYPES })
  @Column({ type: 'varchar', length: 32 })
  type: AlarmType;

  @ApiProperty({ enum: ALARM_SEVERITIES })
  @Column({ type: 'varchar', length: 16 })
  severity: AlarmSeverity;

  @ApiProperty({ description: '측정값' })
  @Column({ type: 'real' })
  value: number;

  @ApiProperty({ description: '임계값' })
  @Column({ type: 'real' })
  threshold: number;

  @ApiProperty()
  @Column({ type: 'varchar', length: 255 })
  message: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
