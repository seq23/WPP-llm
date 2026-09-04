#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Workflow liveness. A workflow declared active must actually be running.
 *
 * The defect. On 2026-06-25 commit 924f9707 deleted
 * .github/workflows/auto_publish_insights.yml during an Actions spine split.
 * Deleting the file did not delete the workflow: GitHub kept id 231677534 with
 * state=active, frozen on its last event, a failure. For the following 71 days
 * the repository reported an ACTIVE workflow whose most recent run was red,
 * while ci.yml, distribution.yml, programmatic-release.yml, query-intelligence.yml
 * and search-repair-retest.yml all ran daily and green. Nobody noticed, because
 * nothing was red day to day - nothing ran at all. Silence reads identically to
 * health on every dashboard this repo has.
 *
 * The same failure had already been seen once in this portfolio: a deploy
 * workflow deleted as collateral in a large sync commit stopped production
 * shipping for three weeks with zero red runs.
 *
 * What this asserts, in order, and every one of them hard-fails:
 *
 *   1. Structure. .github/workflows exists and is non-empty; every file parses
 *      as YAML and carries name/on/jobs. A zero-job run means a parse error and
 *      the Actions log will never say so - that is exactly how the workflow
 *      above died silently rather than loudly.
 *   2. Heredoc terminators inside `run: |` blocks are indented to the block.
 *      This is the precise defect that killed auto_publish_insights.yml.
 *   3. Ledger integrity. Every entry in _workflow_liveness_contract.json retired[]
 *      names a reason and a superseding workflow that exists, and its own file is
 *      gone. A retired workflow whose file reappeared is a contradiction.
 *   4. Reachability. The live check needs the actions:read scope, so ci.yml must
 *      grant it and must invoke this validator. A guard that cannot observe what
 *      it governs reports a status without enforcing anything.
 *   5. Liveness, against the GitHub API:
 *        - every workflow GitHub reports as active must be a file on disk or a
 *          retired[] entry. Active-with-no-source and no retirement record is
 *          the exact 2026-06-25 condition.
 *        - every on-disk workflow declaring a cron must have run inside its own
 *          declared window, computed from its cron rather than assumed.
 *
 * Zero-item hard fail. Zero workflow files, zero scheduled workflows, or an
 * empty workflow list from the API all exit non-zero. An empty input set here
 * means the scan broke or every lane was deleted, and both are the emergency
 * this validator exists to catch. It must never be read as "nothing to do".
 *
 * Named stop. Without API credentials the live check cannot run. That prints an
 * explicit NAMED STOP and exits 0 - but only after checks 1 to 4 have run and
 * done real work, so no invocation exits 0 having done nothing. When a token IS
 * present and the API refuses, that is a hard failure, not a stop.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');
const CONTRACT = path.join(ROOT, '_workflow_liveness_contract.json');
const HOUR = 3600 * 1000;

const errors = [];
const notes = [];
const fail = (m) => errors.push(m);
const rel = (p) => path.relative(ROOT, p);

// --- 0. contract -----------------------------------------------------------
if (!fs.existsSync(CONTRACT)) {
  console.error(`workflow liveness FAILED: missing ${rel(CONTRACT)} - the retirement ledger is the only record of why a workflow stopped.`);
  process.exit(1);
}
const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
const repo = contract.repository;
if (!repo || !/^[^/]+\/[^/]+$/.test(String(repo))) {
  console.error('workflow liveness FAILED: contract has no valid "repository" (owner/name).');
  process.exit(1);
}
const retired = Array.isArray(contract.retired) ? contract.retired : null;
if (!retired) {
  console.error('workflow liveness FAILED: contract has no retired[] array.');
  process.exit(1);
}
const tolerance = Number(contract.schedule_tolerance_multiplier);
const minGraceHours = Number(contract.min_grace_hours);
if (!(tolerance >= 1) || !(minGraceHours > 0)) {
  console.error('workflow liveness FAILED: contract needs a schedule_tolerance_multiplier >= 1 and a positive min_grace_hours.');
  process.exit(1);
}

// --- 1. structure ----------------------------------------------------------
if (!fs.existsSync(WORKFLOW_DIR)) {
  console.error(`workflow liveness FAILED: no ${rel(WORKFLOW_DIR)} to examine.`);
  process.exit(1);
}
const files = fs.readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
if (!files.length) {
  console.error('workflow liveness FAILED: examined zero workflow files - refusing to pass vacuously.');
  process.exit(1);
}

const parsed = new Map(); // filename -> doc
for (const file of files) {
  const text = fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8');
  let doc;
  try {
    doc = YAML.parse(text);
  } catch (e) {
    // The failure mode with no log line. Name it here so it is never silent.
    fail(`${file}: YAML parse error - GitHub would accept the push and produce a zero-job failed run that never says why: ${e.message}`);
    continue;
  }
  if (!doc || typeof doc !== 'object') { fail(`${file}: parsed YAML is not a mapping`); continue; }
  if (!doc.name) fail(`${file}: missing name`);
  if (!Object.prototype.hasOwnProperty.call(doc, 'on')) fail(`${file}: missing on: trigger - a workflow with no trigger can never run`);
  if (!doc.jobs || typeof doc.jobs !== 'object' || !Object.keys(doc.jobs).length) fail(`${file}: missing jobs`);
  parsed.set(file, doc);

  // --- 2. heredoc terminators inside run: | blocks ------------------------
  // `node - <<'NODE'` whose closing NODE sits at column 0 ends the YAML block
  // scalar instead of the heredoc. This is what broke auto_publish_insights.yml.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const open = lines[i].match(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*$/);
    if (!open) continue;
    const bodyIndent = lines[i].match(/^(\s*)/)[1].length;
    let closed = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      const m = lines[j].match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*$/);
      if (!m || m[2] !== open[1]) continue;
      if (m[1].length < bodyIndent) {
        fail(`${file}:${j + 1}: heredoc terminator "${open[1]}" is indented ${m[1].length}, shallower than its run: block content at ${bodyIndent}. GitHub parses it as YAML, not shell, and the run fails with zero jobs and no explanation.`);
      }
      closed = true;
      break;
    }
    if (!closed) fail(`${file}:${i + 1}: heredoc "${open[1]}" is never terminated`);
  }
}

// --- 3. ledger integrity ---------------------------------------------------
const onDisk = new Set(files.map((f) => `.github/workflows/${f}`));
const retiredPaths = new Set();
for (const entry of retired) {
  const label = entry.path || JSON.stringify(entry);
  for (const field of ['path', 'reason', 'retired_on', 'superseded_by']) {
    if (!entry[field] || (Array.isArray(entry[field]) && !entry[field].length)) {
      fail(`retired entry ${label}: missing ${field} - retirement must be recorded with a reason, never by silent deletion`);
    }
  }
  if (typeof entry.reason === 'string' && entry.reason.trim().length < 40) {
    fail(`retired entry ${label}: reason is too thin to be a record`);
  }
  if (retiredPaths.has(entry.path)) fail(`retired entry ${label}: duplicated in the ledger`);
  retiredPaths.add(entry.path);
  if (onDisk.has(entry.path)) {
    fail(`retired entry ${label}: the file exists on disk. It is either live and must leave retired[], or retired and must be removed.`);
  }
  for (const sup of entry.superseded_by || []) {
    if (!onDisk.has(sup)) fail(`retired entry ${label}: names superseded_by ${sup}, which does not exist. A retirement pointing at a missing successor hides a second gap.`);
  }
}

// --- 4. reachability: the live check must have a lane that can run it ------
const liveLane = contract.live_check_workflow;
const laneFile = liveLane ? path.basename(liveLane) : null;
const SELF_INVOCATION = 'validate:workflow-liveness';
if (!laneFile || !parsed.has(laneFile)) {
  fail(`contract live_check_workflow "${liveLane}" is not a parsed workflow in ${rel(WORKFLOW_DIR)}`);
} else {
  const laneDoc = parsed.get(laneFile);
  const perms = laneDoc.permissions;
  const actionsPerm = perms && typeof perms === 'object' ? perms.actions : null;
  if (!['read', 'write'].includes(actionsPerm)) {
    fail(`${laneFile}: permissions.actions is ${JSON.stringify(actionsPerm)}; the liveness check needs actions:read to list workflow runs. Without it this validator can only ever emit a named stop, which is the silence it exists to prevent.`);
  }
  const laneText = fs.readFileSync(path.join(WORKFLOW_DIR, laneFile), 'utf8');
  if (!laneText.includes(SELF_INVOCATION)) {
    fail(`${laneFile}: does not invoke "${SELF_INVOCATION}". A guard nothing calls enforces nothing.`);
  }
}

// --- cron window -----------------------------------------------------------
// Longest gap between fires, simulated minute by minute over 21 days rather than
// assumed, so '35 8,20 * * *' yields 12h and '45 13 * * 1' yields 168h.
function cronField(spec, min, max) {
  const out = new Set();
  for (const part of String(spec).split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw ? parseInt(stepRaw, 10) : 1;
    if (!(step > 0)) return null;
    let lo;
    let hi;
    if (range === '*') { lo = min; hi = max; } else if (range.includes('-')) {
      [lo, hi] = range.split('-').map((n) => parseInt(n, 10));
    } else { lo = parseInt(range, 10); hi = lo; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

function maxGapHours(cron) {
  const f = String(cron).trim().split(/\s+/);
  if (f.length !== 5) return null;
  const minutes = cronField(f[0], 0, 59);
  const hours = cronField(f[1], 0, 23);
  const doms = cronField(f[2], 1, 31);
  const months = cronField(f[3], 1, 12);
  const dowsRaw = cronField(f[4], 0, 7);
  if (!minutes || !hours || !doms || !months || !dowsRaw) return null;
  const dows = new Set([...dowsRaw].map((d) => (d === 7 ? 0 : d)));
  const domRestricted = f[2] !== '*';
  const dowRestricted = f[4] !== '*';
  const start = Date.UTC(2026, 0, 4); // a Sunday, so every weekday appears
  let last = null;
  let gap = 0;
  const total = 21 * 24 * 60;
  for (let i = 0; i <= total; i += 1) {
    const t = start + i * 60000;
    const d = new Date(t);
    if (!months.has(d.getUTCMonth() + 1)) continue;
    // cron OR-semantics: with both day fields restricted, either may match.
    const dayOk = domRestricted && dowRestricted
      ? doms.has(d.getUTCDate()) || dows.has(d.getUTCDay())
      : (!domRestricted || doms.has(d.getUTCDate())) && (!dowRestricted || dows.has(d.getUTCDay()));
    if (!dayOk) continue;
    if (!hours.has(d.getUTCHours()) || !minutes.has(d.getUTCMinutes())) continue;
    if (last !== null) gap = Math.max(gap, t - last);
    last = t;
  }
  return gap ? gap / HOUR : null;
}

function crons(doc) {
  const on = doc && doc.on;
  const sched = on && typeof on === 'object' ? on.schedule : null;
  if (!Array.isArray(sched)) return [];
  return sched.map((s) => s && s.cron).filter(Boolean);
}

// --- 5. liveness against the GitHub API ------------------------------------
function api(route) {
  const args = ['api', '-H', 'Accept: application/vnd.github+json', route];
  return JSON.parse(execFileSync('gh', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString());
}

let credentialed = false;
try {
  execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  credentialed = true;
} catch { credentialed = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN); }

let liveChecked = 0;
if (credentialed) {
  let list;
  try {
    list = api(`repos/${repo}/actions/workflows?per_page=100`);
  } catch (e) {
    // Credentials are present and the API refused. That is a finding, not a stop.
    fail(`GitHub API unreachable with credentials present (${String(e.stderr || e.message).trim().split('\n')[0]}). Cannot prove any lane is alive.`);
    list = null;
  }
  if (list) {
    const remote = Array.isArray(list.workflows) ? list.workflows : [];
    if (!remote.length) {
      fail(`GitHub reports zero workflows for ${repo}. An empty workflow list is an emergency, not a clean bill of health.`);
    }
    for (const wf of remote) {
      if (wf.state !== 'active') continue;
      if (onDisk.has(wf.path)) continue;
      if (retiredPaths.has(wf.path)) { notes.push(`${wf.path}: retired on the record (id ${wf.id}), GitHub still lists it active - expected`); continue; }
      fail(`${wf.path} (id ${wf.id}) is state=active on GitHub but has no file in .github/workflows and no retired[] entry. It cannot run, so it can never go red; it will sit on its last result forever. Restore it or retire it with a reason.`);
    }

    let addedCache = null;
    const addedAt = (file) => {
      if (!addedCache) addedCache = new Map();
      if (addedCache.has(file)) return addedCache.get(file);
      let v = null;
      try {
        const out = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%cI', '-1', '--', `.github/workflows/${file}`], { cwd: ROOT }).toString().trim();
        if (out) v = Date.parse(out);
      } catch { /* shallow clone or untracked; treat as unknown */ }
      addedCache.set(file, v);
      return v;
    };

    const byPath = new Map(remote.map((w) => [w.path, w]));
    let scheduled = 0;
    for (const file of files) {
      const doc = parsed.get(file);
      const list2 = doc ? crons(doc) : [];
      if (!list2.length) continue;
      scheduled += 1;
      const gaps = list2.map(maxGapHours);
      if (gaps.some((g) => g === null)) { fail(`${file}: unparseable cron expression ${JSON.stringify(list2)}`); continue; }
      const windowHours = Math.max(minGraceHours, Math.max(...gaps) * tolerance);
      const wf = byPath.get(`.github/workflows/${file}`);
      if (!wf) { fail(`${file}: declares a schedule but GitHub knows no workflow at that path`); continue; }
      if (wf.state !== 'active') { notes.push(`${file}: GitHub state=${wf.state}, schedule window not enforced`); continue; }
      let runs;
      try {
        runs = api(`repos/${repo}/actions/workflows/${wf.id}/runs?per_page=1`);
      } catch (e) {
        fail(`${file}: cannot read runs (${String(e.stderr || e.message).trim().split('\n')[0]})`);
        continue;
      }
      const latest = (runs.workflow_runs || [])[0];
      const born = addedAt(file);
      if (!latest) {
        if (born !== null && Date.now() - born < windowHours * HOUR) {
          notes.push(`${file}: added ${((Date.now() - born) / HOUR).toFixed(1)}h ago, inside its ${windowHours.toFixed(0)}h window, no run yet`);
        } else {
          fail(`${file}: declares cron ${JSON.stringify(list2)} but has never produced a run.`);
        }
        liveChecked += 1;
        continue;
      }
      const ageHours = (Date.now() - Date.parse(latest.created_at)) / HOUR;
      liveChecked += 1;
      if (ageHours > windowHours) {
        fail(`${file}: declared cron ${JSON.stringify(list2)} fires at least every ${Math.max(...gaps).toFixed(0)}h, but the newest run is ${ageHours.toFixed(0)}h old (${latest.created_at}, ${latest.conclusion}) - past its ${windowHours.toFixed(0)}h window. The lane is silent, not healthy.`);
      } else {
        notes.push(`${file}: last run ${ageHours.toFixed(1)}h ago (${latest.conclusion}) within ${windowHours.toFixed(0)}h window`);
      }
    }
    if (!scheduled) {
      fail('examined zero scheduled workflows - every cron lane has vanished, or the schedule parse is broken. Refusing to pass vacuously.');
    }
  }
}

if (errors.length) {
  console.error(`validate:workflow-liveness FAILED (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

for (const n of notes) console.log(`  ${n}`);
if (!credentialed) {
  // Rule 0: this exits 0 only because checks 1-4 above did real work.
  console.log(`NAMED STOP: workflow-liveness live check skipped - no GitHub credentials (gh auth / GH_TOKEN / GITHUB_TOKEN) in this environment.`);
  console.log(`  Structure, heredoc, ledger and reachability checks ran over ${files.length} workflow files and ${retired.length} retired entries and passed.`);
  console.log(`  The live check runs with actions:read in ${liveLane}.`);
  process.exit(0);
}
console.log(`validate:workflow-liveness OK - ${files.length} workflow files parsed, ${retired.length} retired on the record, ${liveChecked} scheduled lanes proven live against ${repo}.`);
