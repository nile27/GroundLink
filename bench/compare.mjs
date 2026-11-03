#!/usr/bin/env node
/**
 * 여러 측정 결과(같은 조건 반복, 다른 설정)를 묶어 비교표(Markdown)를 만든다.
 *
 *   node bench/compare.mjs bench/results/<runA> bench/results/<runB> ...
 *
 * 서버 설정(env.json의 serverEnv)이 같은 실행끼리 묶어서, 단계마다
 * 저장률·수신→커밋 p50/p99의 평균과 범위(최소~최대)를 보여 준다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('사용: node bench/compare.mjs <결과 폴더>...');
  process.exit(1);
}

const groups = new Map(); // 설정 키 → { name, runs: [{ dir, results }] }
for (const dir of dirs) {
  const f = join(dir, 'summary.json');
  if (!existsSync(f)) {
    console.error(`건너뜀 (summary.json 없음): ${dir}`);
    continue;
  }
  const { env, results } = JSON.parse(readFileSync(f, 'utf8'));
  const cfg = Object.entries(env.serverEnv ?? {}).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`).join(', ') || '기본값';
  if (!groups.has(cfg)) groups.set(cfg, { name: cfg, runs: [] });
  groups.get(cfg).runs.push({ dir: basename(dir), results });
}

const fmt = (n) => (n === null || n === undefined || Number.isNaN(n) ? '-' : String(Math.round(n * 10) / 10));
const stat = (vals) => {
  const v = vals.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  if (v.length === 0) return '-';
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return v.length === 1 ? fmt(mean) : `${fmt(mean)} (${fmt(Math.min(...v))}~${fmt(Math.max(...v))})`;
};

const out = [];
for (const g of groups.values()) {
  out.push(`### ${g.name} — ${g.runs.length}회`, '');
  out.push(`실행: ${g.runs.map((r) => '`' + r.dir + '`').join(', ')}`, '');
  out.push('| 단계 | 회수 | 저장/s | 수신→커밋 p50 (ms) | 수신→커밋 p99 (ms) | 수신→커밋 max (ms) | 따라잡기 (s) | 유실 | 서버 CPU avg (%) | CPU µs/msg | flush p50 (ms) | 풀 대기 max | 판정 |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const labels = [];
  for (const run of g.runs) for (const r of run.results) if (!r.aborted && !labels.includes(r.label)) labels.push(r.label);
  for (const label of labels) {
    const rs = g.runs.map((run) => run.results.find((r) => r.label === label)).filter(Boolean);
    const rc = (k) => rs.map((r) => r.latencyMs.receiveToCommit?.[k]);
    out.push(
      `| ${label} | ${rs.length} | ${stat(rs.map((r) => r.storeRate.serverCommitAvg ?? r.storeRate.dbTelemetryAvg))} | ${stat(rc('p50'))} | ${stat(rc('p99'))} | ${stat(rc('max'))} | ` +
        `${stat(rs.map((r) => r.catchUpMs / 1000))} | ${stat(rs.map((r) => r.counts.lost.telemetry))} | ${stat(rs.map((r) => r.server.cpuPctAvg))} | ` +
        `${stat(rs.map((r) => r.lowLoadProbe?.cpuUsPerMsg))} | ${stat(rs.map((r) => r.lowLoadProbe?.flushDurationMs?.p50))} | ${stat(rs.map((r) => r.server.poolWaitingMax))} | ` +
        `${rs.map((r) => (r.verdict.limitReached ? '한계' : '통과')).join(', ')} |`,
    );
  }
  out.push('');
}
console.log(out.join('\n'));
