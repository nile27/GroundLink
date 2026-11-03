import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { COMMAND_TYPES, SAT_MODES, type CommandType, type SatMode } from '@groundlink/shared';

export class CreateCommandDto {
  @ApiProperty({ enum: COMMAND_TYPES, example: 'SET_MODE' })
  @IsIn(COMMAND_TYPES)
  type: CommandType;

  @ApiProperty({ enum: SAT_MODES, example: 'SAFE' })
  @IsIn(SAT_MODES)
  mode: SatMode;
}
