import type { Alarm, BatteryPoint, Command, CreateCommand, SatMode, SatelliteStats, SatelliteSummary } from '../types/api';

/** API 기본 주소. VITE_API_BASE_URL 이 없으면 로컬 서버 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

/** 2xx 가 아닌 응답 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) {
    // NestJS 에러 본문: { message: string | string[], error, statusCode }
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string | string[] };
      detail = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? '');
    } catch {
      // 본문이 JSON 이 아니면 상태 코드만
    }
    throw new ApiError(res.status, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

/** GET /satellites */
export function getSatellites(signal?: AbortSignal): Promise<SatelliteSummary[]> {
  return request('/satellites', { signal });
}

/** GET /satellites/stats */
export function getSatelliteStats(signal?: AbortSignal): Promise<SatelliteStats> {
  return request('/satellites/stats', { signal });
}

/** GET /alarms?limit= (서버 허용 1~500, 기본 50) */
export function getAlarms(limit: number, signal?: AbortSignal): Promise<Alarm[]> {
  return request(`/alarms?limit=${limit}`, { signal });
}

/** GET /satellites/:id/telemetry/summary */
export function getBatterySummary(
  satId: string,
  from: Date,
  to: Date,
  bucketSeconds: number,
  signal?: AbortSignal,
): Promise<BatteryPoint[]> {
  const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), bucketSeconds: String(bucketSeconds) });
  return request(`/satellites/${encodeURIComponent(satId)}/telemetry/summary?${q}`, { signal });
}

/** GET /satellites/:id/commands?limit= (최신순, 서버 허용 1~200) */
export function getCommands(satId: string, limit: number, signal?: AbortSignal): Promise<Command[]> {
  return request(`/satellites/${encodeURIComponent(satId)}/commands?limit=${limit}`, { signal });
}

/** POST /satellites/:id/commands (SET_MODE). 202 = 발행됨, 반영은 텔레메트리로 확인 */
export function sendSetMode(satId: string, mode: SatMode): Promise<Command> {
  const body: CreateCommand = { type: 'SET_MODE', mode };
  return request(`/satellites/${encodeURIComponent(satId)}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 에러를 화면 표시용 문자열로 */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return `서버에 연결할 수 없음 (${e.message})`;
  return e instanceof Error ? e.message : String(e);
}
