export interface SimulatorConfig {
  satCount: number;
  intervalMs: number;
  timeScale: number;
  anomalyRate: number;
  mqttUrl: string;
}

function readNumber(name: string, fallback: number, check: (n: number) => boolean, rule: string): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !check(n)) {
    throw new Error(`환경변수 ${name}=${raw} 가 올바르지 않습니다 (${rule})`);
  }
  return n;
}

export function loadConfig(): SimulatorConfig {
  return {
    satCount: readNumber('SAT_COUNT', 10, (n) => Number.isInteger(n) && n >= 1 && n <= 999, '1~999 정수'),
    intervalMs: readNumber('INTERVAL_MS', 1000, (n) => n >= 10, '10 이상'),
    timeScale: readNumber('TIME_SCALE', 60, (n) => n > 0, '0보다 큰 수'),
    anomalyRate: readNumber('ANOMALY_RATE', 0.001, (n) => n >= 0 && n <= 1, '0~1'),
    mqttUrl: process.env.MQTT_URL?.trim() || 'mqtt://127.0.0.1:1883',
  };
}
