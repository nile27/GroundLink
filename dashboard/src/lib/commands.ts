import type { Command } from '../types/api';

export type CommandStatus = Command['status'];

/**
 * 종료 상태. 근거: server/src/database/entities/command.entity.ts COMMAND_STATUSES,
 * server/src/commands/commands.service.ts
 * - PENDING → SUCCESS / FAILED : ack 수신 (applyAck)
 * - PENDING → TIMEOUT          : COMMAND_TIMEOUT_MS(기본 10초) 안에 ack 없음 (expire)
 * - 처음부터 FAILED            : MQTT 발행 실패 (sendSetMode 가 FAILED 로 응답)
 */
export function isFinalStatus(status: CommandStatus): boolean {
  return status === 'SUCCESS' || status === 'FAILED' || status === 'TIMEOUT';
}

/** 명령 결과 확인을 그만두는 시간 (ms). 넘으면 "응답 없음" */
export const COMMAND_CHECK_TIMEOUT_MS = 10_000;

/** 상세 패널에 표시할 명령 결과. checking = 확인 중, done = 종료 상태, no-response = 10초 넘음 */
export interface CommandResult {
  satId: string;
  cmdId: string;
  mode: Command['params']['mode'];
  status: CommandStatus;
  message: string | null;
  phase: 'checking' | 'done' | 'no-response';
}
