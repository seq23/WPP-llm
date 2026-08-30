#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, cleanRoute } = require('../citation_intelligence/content_quality.js');
const { QUALITY_REJECTION_REASONS } = require('../citation_intelligence/quality_rejection_reasons.js');

const MAX_CYCLES = Number(process.env.RELEASE_SELF_HEAL_CYCLES || 3);
const BLOCKING = new Set(['thin', 'exact_duplicate', 'near_duplicate']);
const read = (rel, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; }
};
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
const headJson = (rel, fallback) => {
  try { return JSON.parse(execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8' })); } catch { return fallback; }
};
const headFile = (rel) => {
  try { return execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT }); } catch { return null; }
};
const run = (command, args, env = {}) => execFileSync(command, args, {
  cwd: ROOT,
  env: { ...process.env, ...env },
  stdio: 'inherit',
});

function routeFile(route) {
  return `${cleanRoute(route).replace(/^\//, '')}.html`;
}

function changedBlockers() {
  const plan = read('data/releases/daily_release_plan.json', { units: [] });
  const report = read('data/content/programmatic_quality_report.json', { pages: [] });
  const rows = new Map((report.pages || []).map((row) => [cleanRoute(row.route), row]));
  return (plan.units || []).map((unit) => ({ unit, row: rows.get(cleanRoute(unit.target_route)) }))
    .filter(({ row }) => row && (row.flags || []).some((flag) => BLOCKING.has(flag)));
}

function restoreRejectedPages(rejected) {
  for (const { unit } of rejected) {
    const rel = routeFile(unit.target_route);
    const prior = headFile(rel);
    const file = path.join(ROOT, rel);
    if (prior === null) fs.rmSync(file, { force: true });
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, prior);
    }
  }
}

function restoreRegistryRoutes(rel, arrayKey, rejectedRoutes) {
  const current = read(rel, { [arrayKey]: [] });
  const prior = headJson(rel, { [arrayKey]: [] });
  const keep = (current[arrayKey] || []).filter((row) => !rejectedRoutes.has(cleanRoute(row.route)));
  const restore = (prior[arrayKey] || []).filter((row) => rejectedRoutes.has(cleanRoute(row.route)));
  current[arrayKey] = [...keep, ...restore];
  write(rel, current);
}

function quarantine(rejected, cycle) {
  const rejectedRoutes = new Set(rejected.map(({ unit }) => cleanRoute(unit.target_route)));
  restoreRejectedPages(rejected);
  restoreRegistryRoutes('data/content/page_admission_registry.json', 'admissions', rejectedRoutes);

  const stateRel = 'data/content/content_state_registry.json';
  const state = read(stateRel, { published_routes: [] });
  const priorState = headJson(stateRel, { published_routes: [] });
  const priorPublished = new Set((priorState.published_routes || []).map(cleanRoute));
  state.published_routes = (state.published_routes || []).filter((route) => !rejectedRoutes.has(cleanRoute(route)) || priorPublished.has(cleanRoute(route)));
  for (const route of priorState.published_routes || []) {
    if (rejectedRoutes.has(cleanRoute(route)) && !(state.published_routes || []).some((item) => cleanRoute(item) === cleanRoute(route))) state.published_routes.push(route);
  }
  if (state.last_release_run) {
    state.last_release_run.created = Math.max(0, Number(state.last_release_run.created || 0) - rejected.filter(({ unit }) => unit.release_action === 'create').length);
    state.last_release_run.repaired = Math.max(0, Number(state.last_release_run.repaired || 0) - rejected.filter(({ unit }) => unit.release_action === 'repair').length);
    state.last_release_run.quality_rejected = Number(state.last_release_run.quality_rejected || 0) + rejected.length;
    state.last_release_run.skipped = Number(state.last_release_run.skipped || 0) + rejected.length;
  }
  write(stateRel, state);

  const planRel = 'data/releases/daily_release_plan.json';
  const plan = read(planRel, { units: [], blocked: [] });
  const rejectedUnits = (plan.units || []).filter((unit) => rejectedRoutes.has(cleanRoute(unit.target_route)));
  plan.units = (plan.units || []).filter((unit) => !rejectedRoutes.has(cleanRoute(unit.target_route)));
  plan.release_units = plan.units;
  plan.blocked = [...(plan.blocked || []), ...rejected.map(({ unit, row }) => ({
    target_route: unit.target_route,
    query: unit.query,
    release_action: unit.release_action,
    reason: QUALITY_REJECTION_REASONS.POSTBUILD_QUARANTINE,
    details: row.flags,
    max_similarity: row.max_similarity,
    nearest_route: row.nearest_route,
    self_heal_cycle: cycle,
  }))];
  if (!plan.units.length) plan.status = 'COMPLETED_NO_CHANGES';
  write(planRel, plan);
  write('releases/citation_release_plan.json', plan);
  write('.build/citation_release_trace.json', plan);

  const creates = rejectedUnits.filter((unit) => unit.release_action === 'create').length;
  const repairs = rejectedUnits.filter((unit) => unit.release_action === 'repair').length;
  for (const rel of ['.build/indexnow-priority.txt', '.build/indexnow-batch.txt']) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const kept = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).filter((url) => !rejectedRoutes.has(cleanRoute(url)));
    fs.writeFileSync(file, kept.join('\n') + '\n');
  }
  const traceRel = 'artifacts/release/release_plan_distribution_trace.json';
  const distributionTrace = read(traceRel, {});
  distributionTrace.units = plan.units.length;
  distributionTrace.creates = plan.units.filter((unit) => unit.release_action === 'create').length;
  distributionTrace.repairs = plan.units.filter((unit) => unit.release_action === 'repair').length;
  distributionTrace.quality_rejected = Number(distributionTrace.quality_rejected || 0) + rejectedUnits.length;
  distributionTrace.priority_url_count = fs.existsSync(path.join(ROOT, '.build/indexnow-priority.txt')) ? fs.readFileSync(path.join(ROOT, '.build/indexnow-priority.txt'), 'utf8').split(/\r?\n/).filter(Boolean).length : 0;
  distributionTrace.batch_url_count = fs.existsSync(path.join(ROOT, '.build/indexnow-batch.txt')) ? fs.readFileSync(path.join(ROOT, '.build/indexnow-batch.txt'), 'utf8').split(/\r?\n/).filter(Boolean).length : 0;
  write(traceRel, distributionTrace);
  const summaryRel = 'artifacts/release/apply_release_plan_summary.json';
  const summary = read(summaryRel, { created: 0, repaired: 0, quality_rejected: 0, skipped: 0, skipped_records: [] });
  summary.created = Math.max(0, Number(summary.created || 0) - creates);
  summary.repaired = Math.max(0, Number(summary.repaired || 0) - repairs);
  summary.quality_rejected = Number(summary.quality_rejected || 0) + rejectedUnits.length;
  summary.skipped = Number(summary.skipped || 0) + rejectedUnits.length;
  summary.total = plan.units.length;
  summary.skipped_records = [...(summary.skipped_records || []), ...rejected.map(({ unit, row }) => ({
    route: unit.target_route,
    reason: QUALITY_REJECTION_REASONS.POSTBUILD_QUARANTINE,
    details: row.flags,
    max_similarity: row.max_similarity,
    nearest_route: row.nearest_route,
  }))];
  summary.status = summary.created || summary.repaired ? 'COMPLETED_WITH_CHANGES' : 'COMPLETED_ALL_SKIPPED';
  write(summaryRel, summary);

  const ledgerRel = 'data/releases/daily_velocity_ledger.json';
  const ledger = read(ledgerRel, { new_pages_used: 0, repairs_used: 0, runs: [] });
  ledger.new_pages_used = Math.max(0, Number(ledger.new_pages_used || 0) - creates);
  ledger.repairs_used = Math.max(0, Number(ledger.repairs_used || 0) - repairs);
  const last = (ledger.runs || [])[ledger.runs.length - 1];
  if (last) {
    last.created = Math.max(0, Number(last.created || 0) - creates);
    last.repairs = Math.max(0, Number(last.repairs || 0) - repairs);
    last.quality_rejected = Number(last.quality_rejected || 0) + rejectedUnits.length;
    last.skipped = Number(last.skipped || 0) + rejectedUnits.length;
  }
  write(ledgerRel, ledger);
}

const receipt = { schema_version: '1.0', max_cycles: MAX_CYCLES, cycles: [], status: 'RUNNING' };
for (let cycle = 1; cycle <= MAX_CYCLES; cycle += 1) {
  run(process.execPath, ['scripts/citation_intelligence/analyze_content_quality.js']);
  const rejected = changedBlockers();
  receipt.cycles.push({ cycle, rejected: rejected.map(({ unit, row }) => ({ route: unit.target_route, action: unit.release_action, flags: row.flags, nearest_route: row.nearest_route, max_similarity: row.max_similarity })) });
  if (!rejected.length) {
    receipt.status = 'PASS';
    receipt.converged_cycle = cycle;
    write('artifacts/release/self_heal_release_quality.json', receipt);
    console.log(`Release quality self-heal PASS (cycle ${cycle}/${MAX_CYCLES}).`);
    process.exit(0);
  }
  quarantine(rejected, cycle);
  write('artifacts/release/self_heal_release_quality.json', receipt);
  run(process.execPath, ['scripts/authority_scale/frozen_outputs.mjs', 'prepare-scope']);
  run('npm', ['run', 'build'], { SKIP_RELEASE_PLAN: '1' });
}
run(process.execPath, ['scripts/citation_intelligence/analyze_content_quality.js']);
const remaining = changedBlockers();
receipt.status = remaining.length ? 'FAIL' : 'PASS';
receipt.remaining = remaining.map(({ unit, row }) => ({ route: unit.target_route, flags: row.flags }));
write('artifacts/release/self_heal_release_quality.json', receipt);
if (remaining.length) {
  console.error(`Release quality self-heal failed after ${MAX_CYCLES} cycles: ${remaining.map(({ unit }) => unit.target_route).join(', ')}`);
  process.exit(1);
}
console.log(`Release quality self-heal PASS after ${MAX_CYCLES} repair cycles.`);
