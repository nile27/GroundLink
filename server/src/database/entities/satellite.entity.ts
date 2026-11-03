import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('satellites')
export class Satellite {
  @ApiProperty({ example: 'SAT-001' })
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @ApiProperty({ description: '처음 메시지를 받은 시각' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty({ required: false, nullable: true, example: null })
  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;
}
