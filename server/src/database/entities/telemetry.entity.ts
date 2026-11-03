import { ApiProperty } from '@nestjs/swagger';
import { SAT_MODES, type SatMode } from '@groundlink/shared';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Satellite } from './satellite.entity';

@Entity('telemetry')
@Index('idx_telemetry_sat_ts', ['satId', 'ts'])
export class Telemetry {
  @ApiProperty({ type: String, description: 'bigint (문자열로 반환)', example: '1024' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ApiProperty({ example: 'SAT-001' })
  @Column({ name: 'sat_id', type: 'varchar', length: 32 })
  satId: string;

  @ManyToOne(() => Satellite, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sat_id' })
  satellite?: Satellite;

  @ApiProperty({ description: '위성 측정 시각' })
  @Column({ type: 'timestamptz' })
  ts: Date;

  @ApiProperty({ description: '배터리 (%)', example: 76.5 })
  @Column({ type: 'real' })
  battery: number;

  @ApiProperty({ description: '온도 (°C)', example: 21.3 })
  @Column({ type: 'real' })
  temp: number;

  @ApiProperty({ description: 'RSSI (dBm). 교신 중이 아니면 null', nullable: true, type: Number, example: -92.4 })
  @Column({ type: 'real', nullable: true })
  rssi: number | null;

  @ApiProperty({ enum: SAT_MODES })
  @Column({ type: 'varchar', length: 16 })
  mode: SatMode;

  @ApiProperty({ description: '햇빛 구간 여부' })
  @Column({ type: 'boolean' })
  sunlit: boolean;

  @ApiProperty({ description: '서버 저장 시각' })
  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
