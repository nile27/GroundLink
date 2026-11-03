import { connectAsync, type MqttClient } from 'mqtt';
import {
  Topics,
  TopicFilters,
  parseTopic,
  isCommandMessage,
  type CommandAckMessage,
} from '@groundlink/shared';
import { loadConfig } from './config';
import { SimpleOrbitModel } from './orbit/simple-orbit-model';
import type { OrbitModel } from './orbit/orbit-model';
import { Satellite } from './satellite';

type Kind = 'telemetry' | 'event' | 'alarm' | 'ack';

const RATE_LOG_INTERVAL_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const satIds = Array.from({ length: config.satCount }, (_, i) => `SAT-${String(i + 1).padStart(3, '0')}`);

  // 시뮬레이션 시계: 실제 1주기마다 INTERVAL_MS × TIME_SCALE 만큼 진행
  let simTimeMs = Date.now();
  const simStepMs = config.intervalMs * config.timeScale;
  const dtMin = simStepMs / 60_000;

  const orbit: OrbitModel = new SimpleOrbitModel(satIds);
  const satellites = new Map(satIds.map((id) => [id, new Satellite(id, orbit.stateAt(id, simTimeMs))]));

  log(
    `위성 ${config.satCount}대, 주기 ${config.intervalMs}ms, 배속 x${config.timeScale} ` +
      `(1주기 = 시뮬레이션 ${dtMin}분), 이상 확률 ${config.anomalyRate}`,
  );
  log(`MQTT 연결: ${config.mqttUrl}`);

  const client: MqttClient = await connectAsync(config.mqttUrl, {
    clientId: `gl-simulator-${process.pid}`,
    reconnectPeriod: 2000,
  });
  client.on('reconnect', () => log('MQTT 재연결 시도'));
  client.on('offline', () => log('MQTT 연결 끊김 (발행은 메모리 큐에 쌓임)'));
  client.on('error', (err) => log(`MQTT 오류: ${err.message}`));
  log('MQTT 연결됨');

  // ---------- 발행 카운터 ----------
  const window: Record<Kind, number> = { telemetry: 0, event: 0, alarm: 0, ack: 0 };
  const total: Record<Kind, number> = { telemetry: 0, event: 0, alarm: 0, ack: 0 };
  let anomalies = 0;

  const publish = (kind: Kind, topic: string, payload: object, qos: 0 | 1): void => {
    client.publish(topic, JSON.stringify(payload), { qos }, (err) => {
      if (err) log(`발행 실패 ${topic}: ${err.message}`);
    });
    window[kind]++;
    total[kind]++;
  };

  // ---------- 명령 수신 ----------
  await client.subscribeAsync(TopicFilters.cmd, { qos: 1 });
  client.on('message', (topic, buf) => {
    const parsed = parseTopic(topic);
    if (parsed?.kind !== 'cmd') return;

    let msg: unknown;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      log(`잘못된 명령 JSON (${topic})`);
      return;
    }
    if (!isCommandMessage(msg)) {
      log(`형식이 맞지 않는 명령 (${topic}): ${buf.toString()}`);
      return;
    }

    const now = Date.now();
    const sat = satellites.get(parsed.satId);
    let ack: CommandAckMessage;

    if (!sat || msg.satId !== parsed.satId) {
      ack = { cmdId: msg.cmdId, satId: parsed.satId, ts: now, success: false, message: '알 수 없는 위성' };
    } else {
      const result = sat.setModeByCommand(msg.mode, now);
      if (result.ok) {
        if (result.event) publish('event', Topics.event(sat.id), result.event, 1);
        ack = {
          cmdId: msg.cmdId,
          satId: sat.id,
          ts: now,
          success: true,
          message: result.changed ? `모드 변경: ${msg.mode}` : `이미 ${msg.mode} 모드`,
          mode: sat.mode,
        };
      } else {
        ack = { cmdId: msg.cmdId, satId: sat.id, ts: now, success: false, message: result.reason, mode: sat.mode };
      }
    }

    publish('ack', Topics.cmdAck(parsed.satId), ack, 1);
    log(`명령 ${msg.type}(${msg.mode}) → ${parsed.satId}: ${ack.success ? '성공' : '실패'} - ${ack.message}`);
  });
  log(`명령 구독: ${TopicFilters.cmd}`);

  // ---------- 메인 루프: 타이머 하나로 전체 위성 처리 ----------
  const tick = (): void => {
    simTimeMs += simStepMs;
    const now = Date.now();

    for (const sat of satellites.values()) {
      const result = sat.step(orbit.stateAt(sat.id, simTimeMs), dtMin, config.anomalyRate, now);

      for (const ev of result.events) publish('event', Topics.event(sat.id), ev, 1);
      for (const al of result.alarms) publish('alarm', Topics.alarm(sat.id), al, 1);
      publish('telemetry', Topics.telemetry(sat.id), result.telemetry, 0);

      if (result.anomaly) {
        anomalies++;
        log(`이상 발생: ${sat.id} 온도 급상승 → ${result.telemetry.temp}°C`);
      }
    }
  };
  const tickTimer = setInterval(tick, config.intervalMs);

  // ---------- 10초마다 초당 발행 건수 ----------
  const rateTimer = setInterval(() => {
    const sec = RATE_LOG_INTERVAL_MS / 1000;
    const sum = window.telemetry + window.event + window.alarm + window.ack;
    log(
      `[rate] 발행 ${(sum / sec).toFixed(1)} msg/s ` +
        `(telemetry ${(window.telemetry / sec).toFixed(1)}, event ${(window.event / sec).toFixed(1)}, ` +
        `alarm ${(window.alarm / sec).toFixed(1)}, ack ${(window.ack / sec).toFixed(1)}) | ` +
        `누적 telemetry=${total.telemetry} event=${total.event} alarm=${total.alarm} ack=${total.ack}`,
    );
    window.telemetry = window.event = window.alarm = window.ack = 0;
  }, RATE_LOG_INTERVAL_MS);

  // ---------- 종료 처리 ----------
  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log(`${signal} 수신 → 종료 중`);
    clearInterval(tickTimer);
    clearInterval(rateTimer);
    try {
      await client.endAsync(); // 대기 중인 QoS1 발행을 마무리하고 연결 종료
    } catch (err) {
      log(`MQTT 종료 중 오류: ${(err as Error).message}`);
    }
    log(
      `최종 누적 발행: telemetry=${total.telemetry} event=${total.event} alarm=${total.alarm} ` +
        `ack=${total.ack}, 이상 발생 ${anomalies}회`,
    );
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

function log(msg: string): void {
  console.log(`${new Date().toISOString()} [simulator] ${msg}`);
}

main().catch((err: unknown) => {
  console.error(`${new Date().toISOString()} [simulator] 시작 실패:`, err);
  process.exit(1);
});
