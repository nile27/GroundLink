/**
 * 측정용 프리로드 스크립트. 서버·시뮬레이터 코드를 바꾸지 않고 프로세스 내부 지표를 기록한다.
 *
 *   PROBE_OUT=/path/out.jsonl node --require ./bench/probe.cjs server/dist/main.js
 *
 * PROBE_INTERVAL_MS(기본 1000)마다 JSON 한 줄:
 *   t           epoch ms
 *   cpuPct      직전 구간 CPU 사용률 (user+system, 코어 1개 = 100)
 *   rss, heapUsed, heapTotal, external  (bytes)
 *   elP50, elP99, elMax   이벤트 루프 지연 (ms, perf_hooks.monitorEventLoopDelay)
 *   pool        pg 커넥션 풀 { total, idle, waiting } — pg를 쓰는 프로세스(서버)만
 */
'use strict';

const fs = require('node:fs');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const out = process.env.PROBE_OUT;
if (out) start(out);

function start(outPath) {
  const intervalMs = Number(process.env.PROBE_INTERVAL_MS ?? 1000);
  const el = monitorEventLoopDelay({ resolution: 10 });
  el.enable();

  // TypeORM이 만드는 pg.Pool을 잡아 두기 위해 connect()를 감싼다 (동작은 그대로)
  const pools = new Set();
  try {
    const pg = require('pg');
    const original = pg.Pool.prototype.connect;
    pg.Pool.prototype.connect = function patchedConnect(...args) {
      pools.add(this);
      return original.apply(this, args);
    };
  } catch {
    // pg를 쓰지 않는 프로세스 (시뮬레이터)
  }

  let lastCpu = process.cpuUsage();
  let lastT = process.hrtime.bigint();

  const timer = setInterval(() => {
    const now = process.hrtime.bigint();
    const cpu = process.cpuUsage(lastCpu);
    const wallUs = Number(now - lastT) / 1000;
    const mem = process.memoryUsage();

    let pool = null;
    for (const p of pools) {
      pool = pool ?? { total: 0, idle: 0, waiting: 0 };
      pool.total += p.totalCount;
      pool.idle += p.idleCount;
      pool.waiting += p.waitingCount;
    }

    const row = {
      t: Date.now(),
      cpuPct: round(((cpu.user + cpu.system) / wallUs) * 100),
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      elP50: round(el.percentile(50) / 1e6),
      elP99: round(el.percentile(99) / 1e6),
      elMax: round(el.max / 1e6),
      pool,
    };
    fs.appendFileSync(outPath, JSON.stringify(row) + '\n');

    el.reset();
    lastCpu = process.cpuUsage();
    lastT = now;
  }, intervalMs);
  timer.unref();
}

function round(n) {
  return Math.round(n * 10) / 10;
}
