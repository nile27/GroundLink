#!/usr/bin/env node
/**
 * GroundLink 부하 단계별 측정.
 *
 *   node bench/run.mjs                       # 기본 5단계
 *   STAGES=10x1000,100x1000 STAGE_SEC=60 node bench/run.mjs
 *
 * 사전 조건: infra 컨테이너 실행 중, `npm run build` 완료, 마이그레이션 적용 완료,
 *           서버·시뮬레이터는 꺼져 있을 것 (이 스크립트가 단계마다 직접 띄운다)
 *
 * 단계마다: 서버 시작 → 시뮬레이터 STAGE_SEC 실행 → 시뮬레이터 종료 → 밀린 메시지 저장 대기
 *          → 서버 종료 → DB에서 지표 계산 → REST_SEC 휴식.
 * 한계(따라잡지 못함 / 지연이 계속 증가)에 닿으면 남은 단계는 건너뛴다.
 * 측정 데이터는 지우지 않는다 (단계 시작 시점의 telemetry 최대 id 이후 행만 집계).
 *
 * 결과: bench/results/<runId>/ (git 제외) — env.json, stage-N.json, summary.json, summary.md, 각종 로그
 */
import { spawn, execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import pg from 'pg';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBE = join(ROOT, 'bench', 'probe.cjs');

// ---------- 설정 ----------
const STAGES = (process.env.STAGES ?? '10x1000,100x1000,500x1000,1000x1000,1000x200').split(',').map((s) => {
  const [sats, interval] = s.split('x').map(Number);
  return { sats, intervalMs: interval };
});
const STAGE_SEC = Number(process.env.STAGE_SEC ?? 180);
const REST_SEC = Number(process.env.REST_SEC ?? 30);
const MIN_FREE_GB = Number(process.env.MIN_FREE_GB ?? 5);
const CATCHUP_MAX_SEC = Number(process.env.CATCHUP_MAX_SEC ?? 600);
const RESET = process.env.RESET === '1';
const RUN_LABEL = (process.env.RUN_LABEL ?? '').replace(/[^\w.-]/g, '');
/** 서버 설정 중 결과에 같이 남길 환경변수 */
const SERVER_ENV_KEYS = ['DB_POOL_SIZE', 'BATCH_SIZE', 'FLUSH_MS', 'MAX_BUFFER', 'OVERFLOW_POLICY'];
const RESET_TABLES = ['telemetry', 'events', 'alarms'];
const CATCHUP_IDLE_SEC = 15; // 저장 건수가 이 시간 동안 늘지 않으면 따라잡기 종료로 본다
const BUCKET_SEC = 30;
const SPIKE_MS = 250;
/** 한계 판정 기준 */
const LIMIT = {
  catchUpMs: 2000, // 마지막 발행 → 마지막 저장이 이보다 길면 "밀림"
  growthFactor: 3, // 마지막 3개 구간 e2e p50이 계속 증가하고, 마지막이 두 번째 구간의 3배 이상이고
  growthMinMs: 200, //  200ms 이상이면 "지연 계속 증가"
};

const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + (RUN_LABEL ? `-${RUN_LABEL}` : '');
const OUT = join(ROOT, 'bench', 'results', runId);
mkdirSync(OUT, { recursive: true });

for (const f of [join(ROOT, 'server', '.env'), join(ROOT, 'infra', '.env')]) {
  if (existsSync(f)) process.loadEnvFile(f);
}
const db = new pg.Client({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

// ---------- 유틸 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => {
  const line = `${new Date().toISOString()} [bench] ${msg}`;
  console.log(line);
  appendFileSync(join(OUT, 'bench.log'), line + '\n');
};
const r1 = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const max = (a) => (a.length ? Math.max(...a) : null);
const q = async (sql, params) => (await db.query(sql, params)).rows;

async function freeGb() {
  const { stdout } = await execFileP('df', ['-k', ROOT]);
  const cols = stdout.trim().split('\n').at(-1).split(/\s+/);
  return Number(cols[3]) / 1024 / 1024;
}

const children = new Set();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const c of children) c.kill('SIGINT');
    process.exit(130);
  });
}

function startProc(name, args, env, logFile) {
  const child = spawn(process.execPath, ['--require', PROBE, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const write = (buf) => appendFileSync(logFile, buf);
  child.stdout.on('data', write);
  child.stderr.on('data', write);
  children.add(child);
  child.exited = new Promise((r) => child.on('exit', (code, sig) => { children.delete(child); r({ code, sig }); }));
  log(`${name} 시작 pid=${child.pid}`);
  return child;
}

async function stopProc(name, child, timeoutMs = 30_000) {
  if (child.exitCode !== null) return;
  child.kill('SIGINT');
  const res = await Promise.race([child.exited, sleep(timeoutMs).then(() => null)]);
  if (!res) {
    log(`${name} 종료 대기 초과 → SIGKILL`);
    child.kill('SIGKILL');
    await child.exited;
  }
}

async function waitHealth(timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch('http://127.0.0.1:3000/health');
      if (res.ok && (await res.json()).status === 'ok') return;
    } catch {
      // 아직 안 뜸
    }
    await sleep(300);
  }
  throw new Error('서버 /health 응답 없음');
}

/** docker stats를 반복 실행해 { t, name, cpuPct, memMiB } 를 모은다 */
function startDockerStats(file) {
  const samples = [];
  let running = true;
  const loop = (async () => {
    while (running) {
      try {
        const { stdout } = await execFileP('docker', [
          'stats', '--no-stream', '--format', '{{json .}}', 'gl-mosquitto', 'gl-postgres',
        ]);
        const t = Date.now();
        for (const line of stdout.trim().split('\n')) {
          const j = JSON.parse(line);
          const s = { t, name: j.Name, cpuPct: parseFloat(j.CPUPerc), memMiB: toMiB(j.MemUsage.split('/')[0].trim()) };
          samples.push(s);
          appendFileSync(file, JSON.stringify(s) + '\n');
        }
      } catch (err) {
        log(`docker stats 실패: ${err.message}`);
        await sleep(1000);
      }
    }
  })();
  return { samples, stop: async () => { running = false; await loop; } };
}

function toMiB(s) {
  const m = /^([\d.]+)\s*([KMG]i?B|B)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return { B: n / 1048576, KiB: n / 1024, KB: n / 1024, MiB: n, MB: n, GiB: n * 1024, GB: n * 1024 }[m[2]] ?? null;
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** 시뮬레이터 로그: [rate] 줄과 최종 누적 */
function parseSimLog(file) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const rates = [];
  for (const m of text.matchAll(/^(\S+) \[simulator\] \[rate\] 발행 ([\d.]+) msg\/s \(telemetry ([\d.]+)/gm)) {
    rates.push({ t: Date.parse(m[1]), total: Number(m[2]), telemetry: Number(m[3]) });
  }
  const fin = /최종 누적 발행: telemetry=(\d+) event=(\d+) alarm=(\d+) ack=(\d+)/.exec(text);
  const totals = fin ? { telemetry: +fin[1], event: +fin[2], alarm: +fin[3], ack: +fin[4] } : null;
  return { rates, totals };
}

/** 서버 로그: [rate] 줄(Nest 로컬 시각)과 최종 누적·버림·실패 */
function parseServerLog(file) {
  const text = (existsSync(file) ? readFileSync(file, 'utf8') : '').replace(/\x1b\[[0-9;]*m/g, '');
  const rates = [];
  for (const m of text.matchAll(/(\d\d\/\d\d\/\d{4}, \d+:\d\d:\d\d [AP]M)\s+LOG \[IngestService\] \[rate\] 저장 ([\d.]+) rows\/s \(telemetry ([\d.]+)/g)) {
    rates.push({ t: new Date(m[1].replace(',', '')).getTime(), total: Number(m[2]), telemetry: Number(m[3]) });
  }
  const fin = /최종 누적 저장: telemetry=(\d+) event=(\d+) alarm=(\d+) ack=(\d+) \| 버림 (\d+), 실패 (\d+)/.exec(text);
  const totals = fin ? { telemetry: +fin[1], event: +fin[2], alarm: +fin[3], ack: +fin[4], dropped: +fin[5], failed: +fin[6] } : null;
  const errors = (text.match(/저장 실패/g) ?? []).length;
  return { rates, totals, errors };
}

async function pgSnapshot() {
  const [size] = await q(`SELECT count(*)::bigint AS rows, pg_total_relation_size('telemetry') AS total_bytes,
    pg_relation_size('telemetry') AS heap_bytes, coalesce(max(id),0)::bigint AS max_id FROM telemetry`);
  const [ev] = await q(`SELECT coalesce(max(id),0)::bigint AS max_id FROM events`);
  const [al] = await q(`SELECT coalesce(max(id),0)::bigint AS max_id FROM alarms`);
  const [ckpt] = await q(`SELECT num_timed, num_requested, write_time, sync_time, buffers_written FROM pg_stat_checkpointer`);
  const [wal] = await q(`SELECT wal_records, wal_fpi, wal_bytes::bigint, wal_buffers_full, wal_write, wal_sync FROM pg_stat_wal`);
  return {
    telemetry: { rows: Number(size.rows), totalBytes: Number(size.total_bytes), heapBytes: Number(size.heap_bytes), maxId: Number(size.max_id) },
    eventsMaxId: Number(ev.max_id),
    alarmsMaxId: Number(al.max_id),
    checkpointer: Object.fromEntries(Object.entries(ckpt).map(([k, v]) => [k, Number(v)])),
    wal: Object.fromEntries(Object.entries(wal).map(([k, v]) => [k, Number(v)])),
  };
}

async function envInfo() {
  const sh = async (cmd, args) => (await execFileP(cmd, args)).stdout.trim();
  const [chip, mem, ncpu, pcores, ecores, osv] = await Promise.all([
    sh('sysctl', ['-n', 'machdep.cpu.brand_string']),
    sh('sysctl', ['-n', 'hw.memsize']),
    sh('sysctl', ['-n', 'hw.ncpu']),
    sh('sysctl', ['-n', 'hw.perflevel0.physicalcpu']).catch(() => null),
    sh('sysctl', ['-n', 'hw.perflevel1.physicalcpu']).catch(() => null),
    sh('sw_vers', ['-productVersion']),
  ]);
  const dockerInfo = JSON.parse(await sh('docker', ['info', '--format', '{{json .}}']));
  const pgSettings = await q(`SELECT name, setting, unit FROM pg_settings WHERE name IN
    ('shared_buffers','synchronous_commit','fsync','wal_buffers','max_wal_size','checkpoint_timeout','max_connections','work_mem')`);
  const [pgVer] = await q('SHOW server_version');
  return {
    host: { chip, memoryGiB: Number(mem) / 1024 ** 3, cpus: Number(ncpu), performanceCores: Number(pcores), efficiencyCores: Number(ecores), macOS: osv },
    docker: { serverVersion: dockerInfo.ServerVersion, os: dockerInfo.OperatingSystem, cpus: dockerInfo.NCPU, memoryGiB: dockerInfo.MemTotal / 1024 ** 3 },
    node: process.version,
    postgres: { version: pgVer.server_version, settings: Object.fromEntries(pgSettings.map((s) => [s.name, s.setting + (s.unit ?? '')])) },
    bench: { label: RUN_LABEL || null, reset: RESET, stages: STAGES, stageSec: STAGE_SEC, restSec: REST_SEC, limit: LIMIT, spikeMs: SPIKE_MS, bucketSec: BUCKET_SEC },
    serverEnv: Object.fromEntries(SERVER_ENV_KEYS.map((k) => [k, process.env[k] ?? null])),
  };
}

/** DB 시계와 호스트 시계 차이 (inserted_at은 DB 시계, 나머지는 호스트 시계) */
async function clockOffsetMs() {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const [row] = await q(`SELECT extract(epoch from clock_timestamp())*1000 AS t`);
    const t1 = Date.now();
    samples.push({ rtt: t1 - t0, offset: Number(row.t) - (t0 + t1) / 2 });
  }
  samples.sort((a, b) => a.rtt - b.rtt);
  return { offsetMs: r1(samples[0].offset), rttMs: samples[0].rtt };
}

// ---------- 단계 실행 ----------
async function runStage(idx, stage) {
  const tag = `stage-${idx + 1}`;
  const label = `위성 ${stage.sats}대 / ${stage.intervalMs}ms`;
  const gb = await freeGb();
  log(`=== ${tag}: ${label} | 디스크 여유 ${gb.toFixed(1)}GB`);
  if (gb < MIN_FREE_GB) return { tag, label, aborted: `디스크 여유 ${gb.toFixed(1)}GB < ${MIN_FREE_GB}GB` };

  const files = {
    server: join(OUT, `${tag}-server.log`),
    sim: join(OUT, `${tag}-sim.log`),
    serverProbe: join(OUT, `${tag}-server-probe.jsonl`),
    simProbe: join(OUT, `${tag}-sim-probe.jsonl`),
    docker: join(OUT, `${tag}-docker-stats.jsonl`),
    pgLog: join(OUT, `${tag}-postgres.log`),
  };

  if (RESET) {
    await q(`TRUNCATE ${RESET_TABLES.join(', ')}`);
    log(`TRUNCATE ${RESET_TABLES.join(', ')} 완료`);
  }
  const before = await pgSnapshot();
  const clock = await clockOffsetMs();

  const server = startProc('server', ['server/dist/main.js'], { PROBE_OUT: files.serverProbe }, files.server);
  await waitHealth();
  const stats = startDockerStats(files.docker);
  await sleep(3000); // 유휴 상태 샘플 확보

  const simStart = Date.now();
  const sim = startProc(
    'simulator',
    ['simulator/dist/index.js'],
    { PROBE_OUT: files.simProbe, SAT_COUNT: String(stage.sats), INTERVAL_MS: String(stage.intervalMs), TIME_SCALE: '60', ANOMALY_RATE: '0.001' },
    files.sim,
  );
  await sleep(STAGE_SEC * 1000);
  const simStop = Date.now();
  await stopProc('simulator', sim);
  const { rates: simRates, totals: simTotals } = parseSimLog(files.sim);
  log(`시뮬레이터 종료. 누적 발행 ${JSON.stringify(simTotals)}`);

  // 밀린 메시지가 저장될 때까지 대기
  const target = simTotals?.telemetry ?? Infinity;
  let last = -1;
  let lastChange = Date.now();
  let stored = 0;
  while (true) {
    [{ n: stored }] = await q(`SELECT count(*)::int AS n FROM telemetry WHERE id > $1`, [before.telemetry.maxId]);
    if (stored >= target) break;
    if (stored !== last) { last = stored; lastChange = Date.now(); }
    if (Date.now() - lastChange > CATCHUP_IDLE_SEC * 1000) { log(`저장 건수 ${CATCHUP_IDLE_SEC}s 동안 변화 없음 → 대기 종료`); break; }
    if (Date.now() - simStop > CATCHUP_MAX_SEC * 1000) { log(`따라잡기 대기 ${CATCHUP_MAX_SEC}s 초과 → 대기 종료`); break; }
    await sleep(1000);
  }
  const catchUpWaitMs = Date.now() - simStop;
  log(`저장 ${stored}/${target} (대기 ${(catchUpWaitMs / 1000).toFixed(1)}s)`);

  let appMetrics = null;
  try {
    const res = await fetch('http://127.0.0.1:3000/metrics/ingest');
    if (res.ok) appMetrics = await res.json();
  } catch {
    log('서버 /metrics/ingest 응답 없음 (서버 종료됨?)');
  }

  await sleep(2000);
  await stats.stop();
  await stopProc('server', server);
  const srv = parseServerLog(files.server);
  const after = await pgSnapshot();

  try {
    const { stdout, stderr } = await execFileP('docker', ['logs', '--since', new Date(simStart - 5000).toISOString(), 'gl-postgres']);
    writeFileSync(files.pgLog, stdout + stderr);
  } catch (err) {
    log(`postgres 로그 수집 실패: ${err.message}`);
  }

  return analyze({ tag, label, stage, files, before, after, clock, simStart, simStop, simRates, simTotals, srv, catchUpWaitMs, appMetrics, dockerSamples: stats.samples });
}

async function analyze(ctx) {
  const { tag, label, stage, files, before, after, simStart, simStop } = ctx;
  const startId = before.telemetry.maxId;
  const e2e = `extract(epoch from inserted_at - ts) * 1000`;
  const pr = `extract(epoch from received_at - ts) * 1000`;
  const ri = `extract(epoch from inserted_at - received_at) * 1000`;
  const pct = (expr) => `percentile_cont(ARRAY[0.5, 0.95, 0.99]) WITHIN GROUP (ORDER BY ${expr})`;

  const [lat] = await q(
    `SELECT count(*)::int AS n,
       ${pct(pr)} AS pr, max(${pr}) AS pr_max,
       ${pct(ri)} AS ri, max(${ri}) AS ri_max,
       ${pct(e2e)} AS e2e, max(${e2e}) AS e2e_max,
       extract(epoch from min(ts))*1000 AS first_ts, extract(epoch from max(ts))*1000 AS last_ts,
       extract(epoch from max(inserted_at))*1000 AS last_ins,
       count(*) FILTER (WHERE inserted_at <= to_timestamp($2 / 1000.0))::int AS stored_by_stop,
       count(*) FILTER (WHERE ts <= to_timestamp($2 / 1000.0))::int AS published_by_stop_stored
     FROM telemetry WHERE id > $1`,
    [startId, simStop],
  );
  const toNums = (a) => (a ?? []).map((x) => r1(Number(x)));
  const [p50pr, p95pr, p99pr] = toNums(lat.pr);
  const [p50ri, p95ri, p99ri] = toNums(lat.ri);
  const [p50e, p95e, p99e] = toNums(lat.e2e);

  const buckets = (
    await q(
      `SELECT floor(extract(epoch from ts - to_timestamp($2 / 1000.0)) / ${BUCKET_SEC})::int AS b, count(*)::int AS n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ${e2e}) AS e2e_p50,
         percentile_cont(0.99) WITHIN GROUP (ORDER BY ${e2e}) AS e2e_p99,
         percentile_cont(0.99) WITHIN GROUP (ORDER BY ${pr}) AS pr_p99,
         percentile_cont(0.99) WITHIN GROUP (ORDER BY ${ri}) AS ri_p99
       FROM telemetry WHERE id > $1 GROUP BY 1 ORDER BY 1`,
      [startId, simStart],
    )
  ).map((b) => ({ fromSec: b.b * BUCKET_SEC, n: b.n, e2eP50: r1(b.e2e_p50), e2eP99: r1(b.e2e_p99), prP99: r1(b.pr_p99), riP99: r1(b.ri_p99) }));

  // 초 단위 저장률 (DB inserted_at 기준) — 정상 구간: 시작 15초 이후 ~ 종료 5초 전
  const perSec = await q(
    `SELECT extract(epoch from date_trunc('second', inserted_at))*1000 AS s, count(*)::int AS n
     FROM telemetry WHERE id > $1 GROUP BY 1 ORDER BY 1`,
    [startId],
  );
  const steadyFrom = simStart + 15_000;
  const steadyTo = simStop - 5_000;
  const steadyCounts = [];
  for (let s = Math.ceil(steadyFrom / 1000) * 1000; s < steadyTo; s += 1000) {
    steadyCounts.push(perSec.find((p) => Number(p.s) === s)?.n ?? 0);
  }

  const spikeSeconds = await q(
    `SELECT to_char(date_trunc('second', ts) AT TIME ZONE 'UTC', 'HH24:MI:SS') AS sec, count(*)::int AS n,
       round(max(${pr})::numeric, 1)::float AS pr_max, round(max(${ri})::numeric, 1)::float AS ri_max
     FROM telemetry WHERE id > $1 GROUP BY date_trunc('second', ts)
     HAVING max(${e2e}) > ${SPIKE_MS} ORDER BY 1`,
    [startId],
  );
  const [{ seconds: totalSeconds }] = await q(
    `SELECT count(DISTINCT date_trunc('second', ts))::int AS seconds FROM telemetry WHERE id > $1`,
    [startId],
  );

  const [{ n: evStored }] = await q(`SELECT count(*)::int AS n FROM events WHERE id > $1`, [before.eventsMaxId]);
  const [{ n: alStored }] = await q(`SELECT count(*)::int AS n FROM alarms WHERE id > $1`, [before.alarmsMaxId]);

  // 프로세스·컨테이너 지표 (시뮬레이터 실행 구간만)
  const inWindow = (t) => t >= simStart && t <= simStop + 2000;
  const sp = readJsonl(files.serverProbe).filter((r) => inWindow(r.t));
  const mp = readJsonl(files.simProbe).filter((r) => inWindow(r.t));
  const procStats = (rows, withPool) => ({
    cpuPctAvg: r1(avg(rows.map((r) => r.cpuPct))),
    cpuPctMax: r1(max(rows.map((r) => r.cpuPct))),
    rssMiBMax: r1(max(rows.map((r) => r.rss / 1048576))),
    heapUsedMiBMax: r1(max(rows.map((r) => r.heapUsed / 1048576))),
    heapUsedMiBEnd: r1(rows.at(-1)?.heapUsed / 1048576),
    eventLoopP99MsAvg: r1(avg(rows.map((r) => r.elP99))),
    eventLoopMaxMs: r1(max(rows.map((r) => r.elMax))),
    ...(withPool
      ? {
          poolTotalMax: max(rows.map((r) => r.pool?.total ?? 0)),
          poolWaitingAvg: r1(avg(rows.map((r) => r.pool?.waiting ?? 0))),
          poolWaitingMax: max(rows.map((r) => r.pool?.waiting ?? 0)),
          poolWaitingEnd: rows.at(-1)?.pool?.waiting ?? null,
        }
      : {}),
  });
  const dockerStats = {};
  for (const name of ['gl-mosquitto', 'gl-postgres']) {
    const rows = ctx.dockerSamples.filter((s) => s.name === name && inWindow(s.t));
    dockerStats[name] = {
      cpuPctAvg: r1(avg(rows.map((r) => r.cpuPct))),
      cpuPctMax: r1(max(rows.map((r) => r.cpuPct))),
      memMiBMax: r1(max(rows.map((r) => r.memMiB))),
      samples: rows.length,
    };
  }

  const steadyRate = (rates) => r1(avg(rates.filter((r) => r.t >= simStart + 15_000 && r.t <= simStop + 1000).map((r) => r.total)));
  const published = ctx.simTotals;
  const lost = published ? published.telemetry - lat.n : null;
  const catchUpMs = r1(Number(lat.last_ins) - Number(lat.last_ts));

  // 한계 판정
  const steadyBuckets = buckets.filter((b) => b.fromSec + BUCKET_SEC <= STAGE_SEC);
  const ref = steadyBuckets[1] ?? steadyBuckets[0];
  const lastB = steadyBuckets.at(-1);
  // "계속 늘어나기만": 마지막 3개 구간 p50이 계속 증가하고, 마지막이 기준 구간의 3배 이상·200ms 이상
  // (일시적인 멈춤 한 번으로 한계 판정이 나지 않게. 2026-11-03 새 기준선 3단계에서 오판정)
  const lastThree = steadyBuckets.slice(-3);
  const rising = lastThree.length === 3 && lastThree[0].e2eP50 < lastThree[1].e2eP50 && lastThree[1].e2eP50 < lastThree[2].e2eP50;
  const growing = !!(rising && ref && lastB && lastB.e2eP50 > LIMIT.growthMinMs && lastB.e2eP50 > ref.e2eP50 * LIMIT.growthFactor);
  const behind = catchUpMs > LIMIT.catchUpMs;
  const reasons = [];
  if (behind) reasons.push(`따라잡기 ${(catchUpMs / 1000).toFixed(1)}s > ${LIMIT.catchUpMs / 1000}s`);
  if (growing) reasons.push(`e2e p50 ${ref.e2eP50}ms → ${lastB.e2eP50}ms 계속 증가`);
  if (lost > 0) reasons.push(`유실 ${lost}건`);

  const result = {
    tag,
    label,
    stage,
    window: { simStart: new Date(simStart).toISOString(), simStop: new Date(simStop).toISOString() },
    clock: ctx.clock,
    publishRate: { simLogAvg: steadyRate(ctx.simRates), nominal: r1((stage.sats * 1000) / stage.intervalMs) },
    storeRate: {
      serverLogAvg: steadyRate(ctx.srv.rates),
      dbTelemetryAvg: r1(avg(steadyCounts)),
      dbTelemetryMin: min(steadyCounts),
      dbTelemetryMax: max(steadyCounts),
      storedByStopRatio: lat.published_by_stop_stored ? r1((lat.stored_by_stop / lat.published_by_stop_stored) * 100) : null,
    },
    appMetrics: ctx.appMetrics,
    latencyMs: {
      receiveToCommit: ctx.appMetrics?.latencyMs?.receiveToCommit ?? null,
      publishToCommit: ctx.appMetrics?.latencyMs?.publishToCommit ?? null,
      publishToReceive: { p50: p50pr, p95: p95pr, p99: p99pr, max: r1(lat.pr_max) },
      receiveToInsert: { p50: p50ri, p95: p95ri, p99: p99ri, max: r1(lat.ri_max) },
      endToEnd: { p50: p50e, p95: p95e, p99: p99e, max: r1(lat.e2e_max) },
    },
    buckets,
    catchUpMs,
    catchUpWaitMs: ctx.catchUpWaitMs,
    counts: {
      published,
      stored: { telemetry: lat.n, events: evStored, alarms: alStored },
      lost: { telemetry: lost, events: published ? published.event - evStored : null, alarms: published ? published.alarm - alStored : null },
      server: ctx.srv.totals,
      serverErrors: ctx.srv.errors,
    },
    spikes: { thresholdMs: SPIKE_MS, seconds: spikeSeconds.length, totalSeconds, list: spikeSeconds.slice(0, 50) },
    server: procStats(sp, true),
    simulator: procStats(mp, false),
    docker: dockerStats,
    table: {
      before: before.telemetry,
      after: after.telemetry,
      addedMiB: r1((after.telemetry.totalBytes - before.telemetry.totalBytes) / 1048576),
    },
    postgres: {
      checkpoints: {
        timed: after.checkpointer.num_timed - before.checkpointer.num_timed,
        requested: after.checkpointer.num_requested - before.checkpointer.num_requested,
        writeMs: after.checkpointer.write_time - before.checkpointer.write_time,
        syncMs: after.checkpointer.sync_time - before.checkpointer.sync_time,
      },
      wal: {
        mib: r1((after.wal.wal_bytes - before.wal.wal_bytes) / 1048576),
        records: after.wal.wal_records - before.wal.wal_records,
        syncs: after.wal.wal_sync - before.wal.wal_sync,
        buffersFull: after.wal.wal_buffers_full - before.wal.wal_buffers_full,
      },
    },
    verdict: { limitReached: reasons.length > 0, reasons },
  };
  writeFileSync(join(OUT, `${tag}.json`), JSON.stringify(result, null, 2));
  log(
    `${tag} 결과: 발행 ${result.publishRate.simLogAvg}/s, 저장 ${result.storeRate.dbTelemetryAvg}/s, ` +
      `e2e p50/p99/max ${p50e}/${p99e}/${result.latencyMs.endToEnd.max}ms, 따라잡기 ${catchUpMs}ms, 유실 ${lost}, ` +
      `판정 ${reasons.length ? '한계: ' + reasons.join(', ') : '통과'}`,
  );
  return result;
}

/** RESET=1일 때 실행 전 확인. 'TRUNCATE'를 입력해야 진행한다 (파이프 입력도 허용) */
async function confirmReset() {
  const counts = [];
  for (const t of RESET_TABLES) {
    const [{ n }] = await q(`SELECT count(*)::bigint AS n FROM ${t}`);
    counts.push(`${t} ${Number(n).toLocaleString()}행`);
  }
  console.log(`\n[확인] 각 단계를 시작하기 전에 다음 테이블을 TRUNCATE 합니다 (복구 불가): ${counts.join(', ')}`);
  console.log('       satellites, commands, migrations 는 건드리지 않습니다.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("       계속하려면 TRUNCATE 를 입력하세요: ").catch(() => '')).trim();
  rl.close();
  log(`비우기 확인 응답: "${answer}" (${counts.join(', ')})`);
  return answer === 'TRUNCATE';
}

function min(a) {
  return a.length ? Math.min(...a) : null;
}

function summaryMd(env, results) {
  const L = [];
  L.push(`# 부하 측정 결과 (${runId})`, '');
  L.push(`- 호스트: ${env.host.chip}, 메모리 ${env.host.memoryGiB.toFixed(0)}GiB, CPU ${env.host.cpus}코어 (P ${env.host.performanceCores} + E ${env.host.efficiencyCores}), macOS ${env.host.macOS}`);
  L.push(`- Docker Desktop ${env.docker.serverVersion}: CPU ${env.docker.cpus}, 메모리 ${env.docker.memoryGiB.toFixed(2)}GiB`);
  L.push(`- Node ${env.node}, PostgreSQL ${env.postgres.version} (${Object.entries(env.postgres.settings).map(([k, v]) => `${k}=${v}`).join(', ')})`);
  L.push(`- 단계 ${env.bench.stageSec}s, 휴식 ${env.bench.restSec}s`, '');
  L.push(`- 서버 설정: ${Object.entries(env.serverEnv).map(([k, v]) => `${k}=${v ?? '기본값'}`).join(', ')} / 단계마다 테이블 비움: ${env.bench.reset ? '예' : '아니오'}`, '');
  L.push('| 단계 | 발행/s | 저장/s | 발행→수신 p50/p95/p99/max (ms) | 수신→저장 p50/p95/p99/max (ms) | 수신→커밋 p50/p95/p99/max (ms) | 따라잡기 | 유실 | 서버 CPU avg/max | heap max | EL p99 avg / max | 풀 대기 max | mosquitto CPU avg/max | postgres CPU avg/max | 테이블 +MiB | 판정 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (r.aborted) { L.push(`| ${r.label} | 중단: ${r.aborted} |`); continue; }
    const a = r.latencyMs.publishToReceive, b = r.latencyMs.receiveToInsert, c = r.latencyMs.receiveToCommit ?? {};
    L.push(`| ${r.label} | ${r.publishRate.simLogAvg} | ${r.storeRate.dbTelemetryAvg} | ${a.p50}/${a.p95}/${a.p99}/${a.max} | ${b.p50}/${b.p95}/${b.p99}/${b.max} | ${c.p50 ?? '-'}/${c.p95 ?? '-'}/${c.p99 ?? '-'}/${c.max ?? '-'} | ${(r.catchUpMs / 1000).toFixed(2)}s | ${r.counts.lost.telemetry}${r.appMetrics?.telemetry?.dropped ? ` (역압 ${r.appMetrics.telemetry.dropped})` : ''} | ${r.server.cpuPctAvg}/${r.server.cpuPctMax}% | ${r.server.heapUsedMiBMax}MiB | ${r.server.eventLoopP99MsAvg}/${r.server.eventLoopMaxMs}ms | ${r.server.poolWaitingMax} | ${r.docker['gl-mosquitto'].cpuPctAvg}/${r.docker['gl-mosquitto'].cpuPctMax}% | ${r.docker['gl-postgres'].cpuPctAvg}/${r.docker['gl-postgres'].cpuPctMax}% | ${r.table.addedMiB} | ${r.verdict.limitReached ? '한계: ' + r.verdict.reasons.join('; ') : '통과'} |`);
  }
  return L.join('\n') + '\n';
}

// ---------- main ----------
async function main() {
  await db.connect();
  const env = await envInfo();
  writeFileSync(join(OUT, 'env.json'), JSON.stringify(env, null, 2));
  log(`결과 폴더: ${OUT}`);
  if (RESET && !(await confirmReset())) {
    log('테이블 비우기 확인 안 됨 → 측정 취소');
    await db.end();
    return;
  }
  log(`단계: ${STAGES.map((s) => `${s.sats}x${s.intervalMs}`).join(', ')} / 각 ${STAGE_SEC}s, 휴식 ${REST_SEC}s`);

  const results = [];
  for (let i = 0; i < STAGES.length; i++) {
    const r = await runStage(i, STAGES[i]);
    results.push(r);
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ env, results }, null, 2));
    writeFileSync(join(OUT, 'summary.md'), summaryMd(env, results));
    if (r.aborted) { log(`중단: ${r.aborted}`); break; }
    if (r.verdict.limitReached) {
      log(`한계 도달 (${r.label}) → 남은 단계 생략`);
      for (let j = i + 1; j < STAGES.length; j++) log(`생략: 위성 ${STAGES[j].sats}대 / ${STAGES[j].intervalMs}ms`);
      break;
    }
    if (i < STAGES.length - 1) { log(`휴식 ${REST_SEC}s`); await sleep(REST_SEC * 1000); }
  }
  log(`완료. 요약: ${join(OUT, 'summary.md')}`);
  await db.end();
}

main().catch(async (err) => {
  log(`실패: ${err.stack ?? err}`);
  for (const c of children) c.kill('SIGINT');
  await db.end().catch(() => {});
  process.exit(1);
});
