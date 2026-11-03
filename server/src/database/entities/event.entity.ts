import { ApiProperty } from '@nestjs/swagger';
import { EVENT_TYPES, type EventType } from '@groundlink/shared';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Satellite } from './satellite.entity';

@Entity('events')
@Index('idx_events_sat_ts', ['satId', 'ts'])
export class SatEvent {
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

  @ApiProperty({ enum: EVENT_TYPES })
  @Column({ type: 'varchar', length: 32 })
  type: EventType;

  @ApiProperty({ required: false, nullable: true, type: Object, example: { from: 'NORMAL', to: 'SAFE', reason: 'COMMAND' } })
  @Column({ type: 'simple-json', nullable: true })
  detail: Record<string, string | number | boolean | null> | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
