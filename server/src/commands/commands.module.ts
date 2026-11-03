import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Command } from '../database/entities';
import { CommandsService } from './commands.service';

@Module({
  imports: [TypeOrmModule.forFeature([Command])],
  providers: [CommandsService],
  exports: [CommandsService],
})
export class CommandsModule {}
