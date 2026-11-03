import { Alarm } from './alarm.entity';
import { Command } from './command.entity';
import { SatEvent } from './event.entity';
import { Satellite } from './satellite.entity';
import { Telemetry } from './telemetry.entity';

export { Alarm, Command, SatEvent, Satellite, Telemetry };
export * from './command.entity';

export const ENTITIES = [Satellite, Telemetry, SatEvent, Alarm, Command];
