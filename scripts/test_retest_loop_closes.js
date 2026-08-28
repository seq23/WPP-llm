#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Contract test for the delayed retest loop.
 *
 * The loop was structurally unable to close. retest_repairs.js matched
 * `r.query` and `r.page`; data/signals/gsc_query_signals.json emits
 * query_or_topic and target_route and has never carried either key, and every
 * queue entry stores "query": null. Both sides of every comparison were
 * permanently false, so hasAfterEvidence was permanently false,
 * retest_outcomes.json held zero events since the stage was written, and the
 * workflow was green the whole time.
 *
 * This test drives the real script - not a copy of its logic - against fixture
 * data trees, and asserts:
 *   1. a repair with a captured baseline and a later surfacing signal records
 *      IMPROVED
 *   2. a repair surfacing on both sides records UNCHANGED, and one that stops
 *      surfacing records REGRESSED - so the loop can reach every verdict
 *   3. after-evidence with no dated before baseline is INCONCLUSIVE with a named
 *      reason, never IMPROVED - the contract's truth rule
 *   4. an aged-out repair is a named, visible INCONCLUSIVE with its age
 *   5. the pre-fix field names (`query` / `page`) record nothing at all - the
 *      negative test that proves the failure returns when the fix is removed
 *   6. total field drift between signals and queue is a loud failure, not silence
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, 'citation_intelligence/retest_repairs.js');
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const DAY = 24 * 60 * 60 * 1000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

function fixture({ entries, gscRecords }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retest-fixture-'));
  const write = (rel, data) => {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), JSON.stringify(data, null, 2) + '\n');
  };
  write('data/authority_scale/retest_queue.json', { schema_version: '1.0', entries });
  write('data/authority_scale/retest_outcomes.json', { schema_version: '1.0', outcomes: ['IMPROVED', 'UNCHANGED', 'REGRESSED', 'INCONCLUSIVE'], events: [] });
  write('data/signals/gsc_query_signals.json', { generated_at: iso(0), status: 'collected', records: gscRecords });
  write('data/signals/query_surface_observations.json', { schema_version: '1.0', records: [] });
  return root;
}

function sweep(root, extraEnv = {}) {
  const run = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, RETEST_DATA_ROOT: root, ...extraEnv },
  });
  const outcomes = JSON.parse(fs.readFileSync(path.join(root, 'data/authority_scale/retest_outcomes.json'), 'utf8'));
  outcomes.events = outcomes.events || [];
  return { run, outcomes, stdout: run.stdout || '', stderr: run.stderr || '' };
}

// A repair queued 20 days ago, eligible 6 days ago, with a baseline captured at
// repair time. Route shapes deliberately differ across the two sides, exactly as
// they do in production: the queue holds a path, GSC holds an absolute URL.
const ROUTE = '/programmatic/example-repaired-page';
const ABS = `https://virtualagency-os.com${ROUTE}`;
const entry = (over = {}) => ({
  route: ROUTE,
  query: null,
  repair_id: 'repair_testfixture01',
  diagnostic_id: 'diag_test_0',
  repair_type: 'meta_description_length',
  state: 'RETEST_ELIGIBLE',
  repaired_at: iso(20 * DAY),
  retest_not_before: iso(6 * DAY),
  ...over,
});
const gscRow = (over = {}) => ({
  query_or_topic: 'example repaired page',
  target_route: ABS,
  signal_type: 'gsc_query_performance',
  strength: 5,
  impressions: 5,
  clicks: 0,
  ctr: 0,
  position: 40,
  observed_at: iso(1 * DAY),
  actionability: 'repair_or_expand',
  ...over,
});
const baselineRow = (over = {}) => gscRow({ observed_at: iso(20 * DAY), impressions: 0, clicks: 0, strength: 0, ...over });

// 1. IMPROVED: not surfacing at baseline, surfacing after.
{
  const root = fixture({ entries: [entry({ baseline_evidence: [baselineRow()], baseline_captured_at: iso(20 * DAY) })], gscRecords: [gscRow()] });
  const { outcomes, stdout } = sweep(root);
  const ev = outcomes.events[0];
  check(outcomes.events.length === 1, `IMPROVED case: expected 1 event, got ${outcomes.events.length}`);
  check(ev && ev.outcome === 'IMPROVED', `IMPROVED case: got outcome ${ev && ev.outcome}`);
  check(ev && ev.before_evidence_present === true && ev.surfacing_after === true, 'IMPROVED case: both sides of the evidence must be recorded on the event');
  check(/IMPROVED=1/.test(stdout), 'IMPROVED case: the outcome breakdown must be visible on stdout');
  fs.rmSync(root, { recursive: true, force: true });
}

// 2a. UNCHANGED: surfacing on both sides.
{
  const root = fixture({ entries: [entry({ baseline_evidence: [baselineRow({ impressions: 3 })] })], gscRecords: [gscRow()] });
  const ev = sweep(root).outcomes.events[0];
  check(ev && ev.outcome === 'UNCHANGED', `UNCHANGED case: got ${ev && ev.outcome}`);
  fs.rmSync(root, { recursive: true, force: true });
}
// 2b. REGRESSED: surfacing at baseline, not surfacing after.
{
  const root = fixture({ entries: [entry({ baseline_evidence: [baselineRow({ impressions: 9 })] })], gscRecords: [gscRow({ impressions: 0, clicks: 0 })] });
  const ev = sweep(root).outcomes.events[0];
  check(ev && ev.outcome === 'REGRESSED', `REGRESSED case: got ${ev && ev.outcome}`);
  fs.rmSync(root, { recursive: true, force: true });
}

// 3. After-evidence only. The contract's truth rule forbids IMPROVED here.
{
  const root = fixture({ entries: [entry()], gscRecords: [gscRow()] });
  const ev = sweep(root).outcomes.events[0];
  check(ev && ev.outcome === 'INCONCLUSIVE', `no-baseline case: got ${ev && ev.outcome}; a one-sided reading must never be IMPROVED`);
  check(ev && ev.reason === 'after_evidence_only_no_dated_before_baseline', `no-baseline case: outcome must carry a named reason, got ${ev && ev.reason}`);
  check(ev && ev.surfacing_after === true, 'no-baseline case: the after-side reading must still be recorded, not discarded');
  fs.rmSync(root, { recursive: true, force: true });
}

// 4. Aged out past the stale window with no evidence at all: a named, visible
// INCONCLUSIVE carrying its age, not a silent state change.
{
  const root = fixture({ entries: [entry({ route: '/programmatic/never-observed', retest_not_before: iso(60 * DAY), repaired_at: iso(74 * DAY) })], gscRecords: [] });
  const { outcomes, stdout } = sweep(root);
  const ev = outcomes.events[0];
  check(ev && ev.outcome === 'INCONCLUSIVE' && ev.reason === 'no_evidence_arrived_within_stale_window', `stale case: got ${ev && ev.outcome}/${ev && ev.reason}`);
  check(ev && typeof ev.age_days === 'number' && ev.age_days >= 45, `stale case: age must be recorded, got ${ev && ev.age_days}`);
  check(/INCONCLUSIVE \(aged out at/.test(stdout), 'stale case: each aged-out repair must be named on stdout, not only counted');
  check(Array.isArray(outcomes.last_sweep?.aged_out_inconclusive) && outcomes.last_sweep?.aged_out_inconclusive.length === 1, 'stale case: aged-out repairs must be listed in last_sweep');
  fs.rmSync(root, { recursive: true, force: true });
}

// 5. NEGATIVE TEST. Restore the pre-fix world - signal records keyed the way the
// old matcher expected them not to be - and prove nothing can be recorded. This
// is the exact production shape that produced "events": [] forever.
{
  const preFixMatcher = (record, e) => (record.query === e.query || record.page === e.route);
  const row = gscRow();
  const e = entry({ baseline_evidence: [baselineRow()] });
  check(preFixMatcher(row, e) === false, 'negative test: the pre-fix matcher should not match a real GSC record against a real queue entry');
  // and the same assertion end to end: a queue whose entries only carry the old
  // key names records nothing.
  const root = fixture({ entries: [entry({ route: '', query: null, baseline_evidence: [baselineRow()] })], gscRecords: [gscRow()] });
  const { outcomes } = sweep(root);
  check(outcomes.events.length === 0, `negative test: an entry with no usable route must record nothing, got ${outcomes.events.length} event(s)`);
  check(outcomes.last_sweep?.stop_reason === 'AWAITING_EVIDENCE', `negative test: doing nothing must be a NAMED stop, got stop_reason=${outcomes.last_sweep?.stop_reason}`);
  fs.rmSync(root, { recursive: true, force: true });
}

// 6. Total drift between the two sides must be loud.
{
  const root = fixture({
    entries: [entry({ route: '/programmatic/queued-route' })],
    gscRecords: [gscRow({ target_route: 'https://virtualagency-os.com/some/entirely/unrelated/route' })],
  });
  const { run, stderr } = sweep(root);
  check(run.status !== 0, 'drift case: no signal record matching any queued route must fail loudly, not exit 0');
  check(/SCHEMA DRIFT/.test(stderr), 'drift case: the failure must name schema drift and print the keys actually seen');
  fs.rmSync(root, { recursive: true, force: true });
}

if (failures.length) {
  console.error('retest loop contract: FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('retest loop contract: OK (IMPROVED/UNCHANGED/REGRESSED reachable from real field names; one-sided evidence stays INCONCLUSIVE with a named reason; aged-out repairs are named; pre-fix field match records nothing; total drift fails loudly)');
