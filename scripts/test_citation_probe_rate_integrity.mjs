#!/usr/bin/env node
/**
 * Contract test for the citation probe's rate rule.
 *
 * The rule: data/signals/llm_citation_observations.json may carry a
 * self_cited_rate_pct only when the provider actually answered, and that rate is
 * always self_cited / answered - never self_cited / attempted.
 *
 * This exists because the rule was previously a comment. On 2026-08-28 the probe
 * recorded errored: 11 of 11 and still published self_cited_rate_pct: 0, because
 * the denominator was the attempt count. A comment cannot fail a run.
 *
 * Two halves are checked:
 *   1. the live artifact on disk obeys the rule
 *   2. the probe itself refuses to write a rate when nothing was answered -
 *      proved by running it against a provider endpoint that only ever errors,
 *      which is the exact pre-fix failure shape, with no network access needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const ROOT = process.cwd();
const OUT = 'data/signals/llm_citation_observations.json';
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

function auditSummary(s, label) {
  if (!s) return;
  const hasRate = Object.prototype.hasOwnProperty.call(s, 'self_cited_rate_pct');
  const answered = s.answered;
  check(typeof answered === 'number', `${label}: no 'answered' count recorded, so the rate's denominator cannot be verified`);
  if (typeof answered !== 'number') return;
  check(!(hasRate && answered === 0),
    `${label}: self_cited_rate_pct=${s.self_cited_rate_pct} published with answered=0. That is a dead instrument reported as a measurement.`);
  check(!(!hasRate && answered > 0),
    `${label}: answered=${answered} but no self_cited_rate_pct - a real measurement was dropped.`);
  if (hasRate && answered > 0) {
    const expected = Number(((100 * s.self_cited) / answered).toFixed(1));
    check(s.self_cited_rate_pct === expected,
      `${label}: self_cited_rate_pct=${s.self_cited_rate_pct} but self_cited/answered = ${expected}. The denominator must be answered observations, not attempted ones.`);
  }
  if (typeof s.observations === 'number' && typeof s.errored === 'number') {
    check(answered + s.errored === s.observations,
      `${label}: accounting does not balance (answered ${answered} + errored ${s.errored} != observations ${s.observations}).`);
  }
  check(!(answered === 0 && s.status !== 'NO_PROVIDER_ANSWER'),
    `${label}: answered=0 must be named NO_PROVIDER_ANSWER, got status=${s.status}.`);
}

// 1. the artifact on disk
const full = path.join(ROOT, OUT);
if (fs.existsSync(full)) {
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  auditSummary(data.latest_summary, 'latest_summary');
} else {
  console.log(`(${OUT} absent; skipping artifact half)`);
}

// 2. the probe refuses to invent a rate when every call fails.
// A local server that answers every request with an error reproduces the
// all-errored run deterministically and offline.
const server = http.createServer((req, res) => {
  res.writeHead(429, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'RESOURCE_EXHAUSTED (simulated)' } }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-rate-'));
const probeOut = path.join(tmp, 'observations.json');
const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/llm_citation_probe.mjs'), '--limit', '3'], {
  cwd: ROOT,
  encoding: 'utf8',
  env: {
    ...process.env,
    CITATION_PROBE_MODE: 'grounded',
    OPENROUTER_API_KEY: 'test-key-not-a-real-credential',
    OPENROUTER_BASE_URL: `http://127.0.0.1:${port}`,
    CITATION_PROBE_OUT: probeOut,
    PROBE_TIMEOUT_MS: '5000',
  },
});
server.close();

check(run.status !== 0, `probe exited 0 with every call errored; a stage may not exit 0 having measured nothing (stdout: ${(run.stdout || '').trim()})`);
check(/NO_PROVIDER_ANSWER/.test(`${run.stdout}${run.stderr}`), 'probe did not name the all-errored run NO_PROVIDER_ANSWER');

if (fs.existsSync(probeOut)) {
  const written = JSON.parse(fs.readFileSync(probeOut, 'utf8'));
  const s = written.latest_summary || {};
  check(!Object.prototype.hasOwnProperty.call(s, 'self_cited_rate_pct'),
    `probe wrote self_cited_rate_pct=${s.self_cited_rate_pct} for a run where every call errored`);
  check(s.status === 'NO_PROVIDER_ANSWER', `probe wrote status=${s.status} for a run where every call errored`);
  check(s.errored === s.observations && s.answered === 0, 'probe did not record the all-errored run honestly');
  auditSummary(s, 'all-errored run');
} else {
  failures.push('probe wrote no artifact for the all-errored run; the failure must be recorded, not swallowed');
}
fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length) {
  console.error('citation probe rate integrity: FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('citation probe rate integrity: OK (artifact obeys the rate rule; probe refuses to write a rate over zero answers and exits non-zero)');
