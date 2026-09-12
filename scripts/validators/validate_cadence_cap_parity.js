#!/usr/bin/env node
/**
 * The publisher's cap and the gate's cap must be the same computation.
 *
 * THE DEFECT CLASS. Two components each keeping their own count of one governed
 * number, with no link between them. On 2026-09-12 run 34693860366 went red:
 *
 *   BLOCK weekly_cap: 4 editorial URLs are new since the ledger was last
 *   accepted, cap is 2 per week
 *
 * The publisher had created 2 pages on 09-05 and 2 on 09-12 and been inside its
 * trailing-7-day count of 2/week on both days. The gate counted every URL absent
 * from data/cadence/known_urls.json since a human last ran cadence:accept - 14
 * days earlier - and compared that lifetime total to a per-WEEK cap. Both read
 * data/cadence/policy.json. Both were right by their own arithmetic. They
 * disagreed, and a publisher obeying 2/week was guaranteed to block the gate in
 * week two, forever, unless a human accepted every seven days.
 *
 * WHAT IS ASSERTED, on fixtures built in a temp directory, not on prose:
 *
 *   1. Inputs exist and are non-empty: the real ledger, at least one governed
 *      record in it, the real sitemap URL set, a finite cap. Zero of any of
 *      these is a hard failure, not a pass.
 *   2. Every governed URL recorded this week is present in the sitemap the gate
 *      reads. If the recorder's origin ever drifts from the sitemap builder's,
 *      the gate would count governed pages as ungoverned - the same disagreement
 *      in a new costume.
 *   3. The gate's weekly_cap verdict is exactly `used + ungoverned > cap`, where
 *      `used` is scripts/cadence/weekly_cap.js weeklyAllowance().used - the
 *      number the publisher takes its headroom from - across a table of
 *      scenarios including the one that went red.
 *   4. The publisher's headroom is exactly max(0, cap - used) from the same
 *      function on the same ledger.
 *   5. Recording a governed publication moves the gate's count by exactly the
 *      number recorded, and refuses to record past the cap.
 *   6. The publisher, the applier and the gate all import the shared module and
 *      neither keeps a private week: no second ledger, no local window
 *      arithmetic. The release lane's push gate runs cadence:gate, so it cannot
 *      push what CI would then block.
 *
 * Deliberately NOT asserted: whether the current tree passes the gate. That is
 * the gate's job. This only asserts that when it speaks, it and the publisher are
 * saying the same thing.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = process.cwd();
const failures = [];
const fail = (m) => failures.push(m);
let examined = 0;

const weeklyCap = require(path.join(ROOT, 'scripts/cadence/weekly_cap.js'));
const gate = require(path.join(ROOT, 'scripts/cadence_gate.js'));

// --- 1. real inputs, non-empty ---------------------------------------------
const realLedger = weeklyCap.readLedger(ROOT);
const realCap = weeklyCap.readCap(ROOT);
const realUrls = gate.sitemapUrls(ROOT);
const today = weeklyCap.todayISO();
if (!realLedger.exists) fail(`ledger_missing: ${weeklyCap.LEDGER_REL} does not exist or has no urls[]. There is no shared count to compare.`);
if (!Number.isFinite(realCap)) fail(`cap_missing: ${weeklyCap.POLICY_REL} declares no usable new_pages_per_week.`);
if (!realUrls.size) fail('sitemap_empty: the gate reads zero sitemap URLs, so nothing here examines a real page.');
const governedAll = Object.entries(realLedger.sources || {}).filter(([, s]) => s === weeklyCap.SOURCE_GOVERNED).map(([u]) => u);
if (!governedAll.length) {
  fail(`no_governed_records: ${weeklyCap.LEDGER_REL} holds zero URLs with source ${weeklyCap.SOURCE_GOVERNED}. The release lane records every page it creates there (apply_release_plan.js); zero records means either nothing has been recorded since the mechanism landed or the recorder is not wired - both are the disconnected-count defect this validator exists for.`);
}
for (const u of governedAll) {
  examined += 1;
  if (!weeklyCap.readLedger(ROOT).urls.has(u)) fail(`governed_not_in_baseline: ${u} has a source but is not in urls[].`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(realLedger.first_seen[u] || '')) fail(`governed_undated: ${u} is recorded as governed with no first_seen date, so it can never fall inside or outside a week.`);
}

// --- 2. what was recorded this week is what the gate reads ------------------
const realAllowance = weeklyCap.weeklyAllowance(ROOT, { today, ledger: realLedger });
for (const u of realAllowance.used_urls) {
  examined += 1;
  if (!realUrls.has(u)) fail(`governed_not_in_sitemap: ${u} was recorded as published this week but is not in any sitemap. Either the page was never built or the recorder's origin (${weeklyCap.SITE_ORIGIN}) differs from the sitemap builder's; in both cases the gate cannot tie the record to the page.`);
}

// --- 3-5. fixtures: verdict and headroom are one function --------------------
function fixture(name, { governed = {}, ungoverned = 0, baseline = 3, cap = 2 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cap-parity-${name}-`));
  fs.mkdirSync(path.join(dir, 'data/cadence'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data/cadence/policy.json'), JSON.stringify({ refresh_window_days: 91, high_value_window_days: 30, stale_tolerance_pct: 20, require_lastmod: true, new_pages_per_week: cap, refresh_capacity_per_week: 25 }));
  const urls = [];
  const baseUrls = Array.from({ length: baseline }, (_, i) => `https://fixture.test/base-${i}`);
  urls.push(...baseUrls);
  const first_seen = {}; const sources = {};
  for (const [date, n] of Object.entries(governed)) {
    for (let i = 0; i < n; i += 1) {
      const u = `https://fixture.test/governed-${date}-${i}`;
      urls.push(u); first_seen[u] = date; sources[u] = weeklyCap.SOURCE_GOVERNED;
    }
  }
  const ungovernedUrls = Array.from({ length: ungoverned }, (_, i) => `https://fixture.test/unrecorded-${i}`);
  fs.writeFileSync(path.join(dir, 'data/cadence/known_urls.json'), JSON.stringify({ generated_at: today, urls, first_seen, sources }, null, 2));
  const all = [...urls, ...ungovernedUrls];
  const xml = `<?xml version="1.0"?><urlset>${all.map((u) => `<url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('')}</urlset>`;
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), xml);
  return dir;
}
const daysAgo = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

const scenarios = [
  // The exact shape of run 34693860366: 2 governed a week ago, 2 governed today, cap 2. Must be CLEAR.
  { name: 'red-run-shape', governed: { [daysAgo(7)]: 2, [today]: 2 }, ungoverned: 0, expectUsed: 2, expectBlocked: false },
  { name: 'inside-window-edge', governed: { [daysAgo(6)]: 2 }, ungoverned: 0, expectUsed: 2, expectBlocked: false },
  { name: 'three-governed-today', governed: { [today]: 3 }, ungoverned: 0, expectUsed: 3, expectBlocked: true },
  { name: 'two-governed-one-unrecorded', governed: { [today]: 2 }, ungoverned: 1, expectUsed: 2, expectBlocked: true },
  { name: 'one-governed-one-unrecorded', governed: { [today]: 1 }, ungoverned: 1, expectUsed: 1, expectBlocked: false },
  { name: 'nothing-this-week', governed: { [daysAgo(20)]: 5 }, ungoverned: 0, expectUsed: 0, expectBlocked: false },
  { name: 'unrecorded-backlog-only', governed: {}, ungoverned: 3, expectUsed: 0, expectBlocked: true },
];
let scenariosRun = 0;
for (const sc of scenarios) {
  const dir = fixture(sc.name, sc);
  try {
    const cap = 2;
    const allowance = weeklyCap.weeklyAllowance(dir, { today });
    const { report, newEditorial } = gate.evaluate(dir, 'data/cadence/policy.json');
    const blockedOnCap = report.blocking.some((b) => b.startsWith('weekly_cap:'));
    const otherBlocks = report.blocking.filter((b) => !b.startsWith('weekly_cap:'));
    scenariosRun += 1; examined += 1;
    if (otherBlocks.length) fail(`fixture_invalid[${sc.name}]: gate blocked on something other than weekly_cap (${otherBlocks.join('; ')}); the fixture does not isolate the cap.`);
    if (allowance.used !== sc.expectUsed) fail(`shared_count_wrong[${sc.name}]: weeklyAllowance().used=${allowance.used}, expected ${sc.expectUsed}.`);
    if (allowance.headroom !== Math.max(0, cap - allowance.used)) fail(`publisher_headroom_wrong[${sc.name}]: headroom=${allowance.headroom}, expected max(0, ${cap} - ${allowance.used}).`);
    const expectedVerdict = allowance.used + newEditorial.length > cap;
    if (blockedOnCap !== expectedVerdict) fail(`gate_disagrees_with_publisher[${sc.name}]: gate weekly_cap blocked=${blockedOnCap}, but used(${allowance.used}) + ungoverned(${newEditorial.length}) > cap(${cap}) is ${expectedVerdict}. The two components are counting differently again.`);
    if (blockedOnCap !== sc.expectBlocked) fail(`verdict_wrong[${sc.name}]: expected blocked=${sc.expectBlocked}, got ${blockedOnCap}.`);
    if (report.governed_editorial_this_week !== allowance.used) fail(`gate_report_mismatch[${sc.name}]: report.governed_editorial_this_week=${report.governed_editorial_this_week} but weeklyAllowance().used=${allowance.used}.`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
if (scenariosRun !== scenarios.length) fail(`scenarios_incomplete: ran ${scenariosRun} of ${scenarios.length}.`);

// 5. recording moves the count by exactly what was recorded, and cannot pass the cap.
{
  const dir = fixture('record', { governed: { [today]: 1 } });
  try {
    const before = gate.evaluate(dir).report.governed_editorial_this_week;
    const r = weeklyCap.recordGovernedPublication(dir, ['https://fixture.test/created-1'], { today });
    const after = gate.evaluate(dir).report.governed_editorial_this_week;
    examined += 1;
    if (r.recorded !== 1 || after !== before + 1) fail(`record_not_visible_to_gate: recorded ${r.recorded}, gate count went ${before} -> ${after}; expected +1. The publisher's record is not what the gate reads.`);
    let refused = false;
    try { weeklyCap.recordGovernedPublication(dir, ['https://fixture.test/created-2'], { today }); } catch { refused = true; }
    if (!refused) fail('record_past_cap_allowed: recordGovernedPublication accepted a third page in a week capped at 2. The record can then launder an overrun the planner should have prevented.');
    const again = gate.evaluate(dir).report.governed_editorial_this_week;
    if (again !== after) fail(`record_refusal_wrote_anyway: count moved ${after} -> ${again} on a refused record.`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- 6. one module, wired at every site; no private week anywhere ------------
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf8') : null);
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"])\/\/.*$/, '$1')).join('\n');
const sites = [
  { rel: 'scripts/citation_intelligence/build_release_plan.js', requires: /require\(\s*['"]\.\.\/cadence\/weekly_cap\.js['"]\s*\)/, uses: [/weeklyCap\.weeklyAllowance\(/], role: 'publisher planner' },
  { rel: 'scripts/citation_intelligence/apply_release_plan.js', requires: /require\(\s*['"]\.\.\/cadence\/weekly_cap\.js['"]\s*\)/, uses: [/weeklyCap\.recordGovernedPublication\(/], role: 'publisher applier' },
  { rel: 'scripts/cadence_gate.js', requires: /require\(\s*['"]\.\/cadence\/weekly_cap\.js['"]\s*\)/, uses: [/weeklyCap\.weeklyAllowance\(/], role: 'gate' },
  { rel: 'scripts/cadence_accept.js', requires: /require\(\s*['"]\.\/cadence\/weekly_cap\.js['"]\s*\)/, uses: [/weeklyCap\.recordAcceptance\(/], role: 'human acceptance' },
];
for (const s of sites) {
  const src = read(s.rel);
  examined += 1;
  if (src === null) { fail(`site_missing: ${s.rel} (${s.role}) does not exist.`); continue; }
  const code = strip(src);
  if (!s.requires.test(code)) fail(`site_not_linked: ${s.rel} (${s.role}) does not require scripts/cadence/weekly_cap.js. A component with its own count is the defect.`);
  for (const u of s.uses) if (!u.test(code)) fail(`site_not_using_shared_count: ${s.rel} (${s.role}) does not call ${u.source.replace(/\\/g, '')}.`);
  if (/weekly_velocity_ledger/.test(code)) fail(`private_week_ledger: ${s.rel} still reads or writes data/releases/weekly_velocity_ledger.json, the parallel count that disagreed with the gate.`);
  if (s.role !== 'gate' && /trailingWeekDates|trailingWindow\s*\(/.test(code)) fail(`private_window_arithmetic: ${s.rel} computes its own week instead of taking weeklyAllowance().`);
}
if (fs.existsSync(path.join(ROOT, 'data/releases/weekly_velocity_ledger.json'))) fail('parallel_ledger_present: data/releases/weekly_velocity_ledger.json exists. Two ledgers for one number is how the counts diverged.');

// The release lane must run the gate before it pushes, on the exact commit.
const pkg = JSON.parse(read('package.json') || '{}');
const pushGate = String((pkg.scripts || {})['release:push-gate'] || '');
examined += 1;
if (!/npm run cadence:gate/.test(pushGate)) fail('release_lane_ungated: package.json release:push-gate does not run cadence:gate, so the release lane can push a commit that CI will then block on the same policy.');
const releaseWf = read('.github/workflows/programmatic-release.yml');
if (releaseWf === null) fail('release_workflow_missing: .github/workflows/programmatic-release.yml does not exist.');
else {
  const code = releaseWf.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
  const m = code.match(/PRE_PUSH_VALIDATION_ARGV:\s*(.+)/);
  const argv = m ? m[1].trim() : 'npm run release:push-gate';
  if (!/release:push-gate/.test(argv)) fail(`release_lane_bypasses_push_gate: programmatic-release.yml validates with "${argv}", not release:push-gate, so the cadence gate never runs before its push.`);
  if (!/commit_and_push_if_changed\.sh/.test(code)) fail('release_lane_push_helper_missing: programmatic-release.yml does not push through commit_and_push_if_changed.sh, where the pre-push validation runs.');
}

if (examined === 0) fail('examined_zero: this validator examined nothing.');

const receipt = {
  validator: 'cadence_cap_parity',
  status: failures.length ? 'FAIL' : 'PASS',
  hard_failures: failures.length,
  strong_warnings: 0,
  soft_warnings: 0,
  examined,
  scenarios_run: scenariosRun,
  governed_records_total: governedAll.length,
  governed_this_week: realAllowance.used,
  cap: realCap,
  publisher_headroom_now: realAllowance.headroom,
  window: realAllowance.window,
  failures,
};
console.log(JSON.stringify(receipt, null, 2));
process.exit(failures.length ? 1 : 0);
