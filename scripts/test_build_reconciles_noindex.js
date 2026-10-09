#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Contract test: when Search Console evidence moves, `npm run build` brings the
 * robots meta on disk back into agreement with scripts/lib/noindex_policy.js
 * BEFORE the sitemap is written - in both directions - and never throws on a
 * recorded-protected route whose evidence rolled out of the 90-day window.
 *
 * The failure this pins (5 Oct 2026, runs 37279727181 and 37286898247, commit
 * 01ed5872): /programmatic/agency-rfp-questions-for-financial-services-teams
 * was noindex (audience-permutation class, no evidence). The day's GSC pull gave
 * it its first impression. The policy is recomputed from live signals, so it
 * now called the page protected; nothing in `build` rewrote the page, and
 * validate_demand_backed_pages.js refused it as "noindex with nothing
 * sanctioning it". Both scheduled lanes went red on a data change, not a commit.
 *
 * Drives the real applier against a temp copy of the real corpus and signals:
 *   1. source pin: build runs apply_noindex_policy.js before update_sitemap_all_html.js
 *   2. a noindex route that gains one impression is restored to index, STAYS
 *      indexed through authority:scale:restore (the frozen copy is reconciled
 *      too), frozen status shows no drift, and --check reports zero drift
 *      and the cadence ledger records it as reindexed_existing, which the gate
 *      does not count as a new publication - while a forged reindexed_existing
 *      record for a route NOT on the pre-gate baseline is still counted
 *   3. a recorded-protected class route that loses every impression stays
 *      indexed and the applier does not throw
 *   4. the committed tree has zero drift against the committed signals
 * Hard-fails if any case has zero items to examine.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const ROBOTS_RE = /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i;
const robotsIn = (root, route) =>
  (fs.readFileSync(path.join(root, `${route.replace(/^\//, '')}.html`), 'utf8').match(ROBOTS_RE) || [])[1] || '';
const slugOf = (route) => String(route).replace(/\/+$/, '').split('/').pop();
const runApply = (root, args = []) =>
  spawnSync(process.execPath, [path.join(root, 'scripts/apply_noindex_policy.js'), ...args], { cwd: root, encoding: 'utf8' });

// --- 1. source pin -----------------------------------------------------------
const steps = require(path.join(ROOT, 'package.json')).scripts.build.split('&&').map((s) => s.trim());
const applyAt = steps.indexOf('node scripts/apply_noindex_policy.js');
const sitemapAt = steps.indexOf('node scripts/update_sitemap_all_html.js');
check(sitemapAt >= 0, 'build no longer runs update_sitemap_all_html.js; this test pins the wrong order');
check(applyAt >= 0 && applyAt < sitemapAt,
  'build must run node scripts/apply_noindex_policy.js before node scripts/update_sitemap_all_html.js');
// The query-intelligence lane pushes the Search Console signals the policy
// reads but does not run `build`. 5 Oct 2026 (add924a84): it pushed a pull that
// promoted a page and left the committed page noindex, so case 4 below was red
// on main until the next release run. The lane must reconcile what its signals
// govern before it commits.
{
  const qi = fs.readFileSync(path.join(ROOT, '.github/workflows/query-intelligence.yml'), 'utf8');
  const reconcileAt = qi.indexOf('node scripts/apply_noindex_policy.js');
  const sitemapQiAt = qi.indexOf('node scripts/update_sitemap_all_html.js');
  const commitAt = qi.indexOf('commit_and_push_if_changed.sh');
  check(reconcileAt >= 0 && sitemapQiAt > reconcileAt && commitAt > sitemapQiAt,
    'query-intelligence.yml must run node scripts/apply_noindex_policy.js then node scripts/update_sitemap_all_html.js before its commit step, or a signals push leaves the committed pages drifting from the policy');
}

// --- pick subjects from the real corpus ---------------------------------------
const policy = require('./lib/noindex_policy.js');
const { klass, noindex } = policy.classify();
const recorded = new Set(JSON.parse(fs.readFileSync(policy.PROTECTED_FILE, 'utf8')));
const frozenRoutes = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/frozen_output_registry.json'), 'utf8')).pages.map((p) => p.route));
const gainer = noindex.find((r) => frozenRoutes.has(r) && /noindex/i.test(robotsIn(ROOT, r)));
const loser = klass.find((r) => recorded.has(r) && !policy.hasMeasuredDemand(r) && policy.impressionsFor(r) > 0);
check(klass.length > 0, 'zero audience-permutation routes examined');
check(!!gainer, 'no noindex route on disk to promote - case 2 examined zero items');
check(!!loser, 'no recorded-protected, impression-only route - case 3 examined zero items');

// --- temp copy of everything the policy and applier read ----------------------
function stage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noindex-reconcile-'));
  for (const rel of ['scripts', 'programmatic', 'data/demand', 'data/content/page_admission_registry.json',
    'data/signals/gsc_query_signals.json', 'data/authority_scale/query_atlas.json', 'data/release', 'data/cadence', 'sitemap.xml',
    'data/topic-taxonomy.json', 'data/publications.json']) {
    const src = path.join(ROOT, rel);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dir, rel), { recursive: true });
  }
  return dir;
}
function editSignals(dir, fn) {
  const file = path.join(dir, 'data/signals/gsc_query_signals.json');
  const packet = JSON.parse(fs.readFileSync(file, 'utf8'));
  packet.records = fn(packet.records || []);
  fs.writeFileSync(file, JSON.stringify(packet));
}

if (gainer && loser) {
  // --- 2. gains an impression -> restored to index --------------------------
  const a = stage();
  try {
    editSignals(a, (recs) => recs.concat([{ query: 'test reconcile', target_route: `https://virtualagency-os.com${gainer}`, impressions: 1, clicks: 0 }]));
    const r = runApply(a);
    check(r.status === 0, `applier failed after an impression was gained: ${(r.stderr || '').slice(0, 300)}`);
    check(!/noindex/i.test(robotsIn(a, gainer)), `${gainer} gained an impression but is still noindex after apply`);
    // build runs authority:scale:restore AFTER this step and after the sitemap;
    // the decision must survive it (5 Oct 2026, runs 37323430900/37323426591).
    check(frozenRoutes.has(gainer), `${gainer} is not a frozen route - the restore case examined zero items`);
    const restore = spawnSync(process.execPath, [path.join(a, 'scripts/authority_scale/frozen_outputs.mjs'), 'restore'], { cwd: a, encoding: 'utf8' });
    check(restore.status === 0, `frozen restore failed: ${(restore.stderr || '').slice(0, 300)}`);
    check(!/noindex/i.test(robotsIn(a, gainer)), `${gainer} was indexed by apply but authority:scale:restore put the frozen noindex copy back`);
    const status = spawnSync(process.execPath, [path.join(a, 'scripts/authority_scale/frozen_outputs.mjs'), 'status'], { cwd: a, encoding: 'utf8' });
    check(status.status === 0, `frozen outputs drift after apply + restore: ${(status.stdout || '').slice(0, 300)}`);

    // The cadence gate must read the re-index of an existing page as an index
    // change, not a new publication (2026-10-05, runs 37326411405 / 37327054767:
    // "3 editorial URLs this week ... 1 with no record at all", cap 2).
    const gainerUrl = `https://virtualagency-os.com${gainer}`;
    const forgedUrl = 'https://virtualagency-os.com/programmatic/zz-cadence-test-genuinely-new-page';
    const sm = path.join(a, 'sitemap.xml');
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(sm, fs.readFileSync(sm, 'utf8').replace('</urlset>',
      `<url><loc>${gainerUrl}</loc><lastmod>${today}</lastmod></url><url><loc>${forgedUrl}</loc><lastmod>${today}</lastmod></url></urlset>`));
    const tempCap = require(path.join(a, 'scripts/cadence/weekly_cap.js'));
    const ledgerA = tempCap.readLedger(a);
    // Two records satisfy the gate, and both are true statements about the
    // page: it is BASELINE (in `urls` with no first_seen - #34 restored the 714
    // class pages the 29 Aug ledger rebuild had dropped), or, for a pre-gate
    // page the baseline somehow lacks, the applier recorded it as
    // reindexed_existing (#33). Anything else and the gate counts it as new.
    const baselineRecord = ledgerA.urls.has(gainerUrl) && !(gainerUrl in ledgerA.first_seen);
    const reindexedRecord = ledgerA.sources[gainerUrl] === tempCap.SOURCE_REINDEXED;
    check(baselineRecord || reindexedRecord,
      `${gainerUrl} was returned to the index but ${tempCap.LEDGER_REL} neither holds it as baseline nor records it as ${tempCap.SOURCE_REINDEXED}`);
    // A baseline page must not have been re-recorded as this week's publication.
    check(!(baselineRecord && ledgerA.sources[gainerUrl]), `${gainerUrl} is baseline yet carries a source record (${ledgerA.sources[gainerUrl]})`);
    const refusal = tempCap.recordReindexedExisting(a, [forgedUrl]);
    check(refusal.recorded === 0 && refusal.refused.includes(forgedUrl), 'recordReindexedExisting accepted a route that is not on the pre-gate baseline');
    // Forge the record directly: the gate itself must still count a non-pre-gate URL.
    const forged = tempCap.readLedger(a);
    forged.urls.add(forgedUrl); forged.first_seen[forgedUrl] = today; forged.sources[forgedUrl] = tempCap.SOURCE_REINDEXED;
    tempCap.writeLedger(a, forged, today);
    const gate = require(path.join(a, 'scripts/cadence_gate.js')).evaluate(a);
    check(gate.urls.has(gainerUrl) && gate.urls.has(forgedUrl), 'cadence case examined zero items: injected URLs not read from the sitemap');
    check(!gate.newEditorial.includes(gainerUrl), `cadence gate counts ${gainerUrl} (an existing page re-indexed by the noindex policy) as a new unrecorded publication`);
    check(gate.newEditorial.includes(forgedUrl), 'cadence gate excused a genuinely new page because its ledger record claims reindexed_existing');
    const c = runApply(a, ['--check']);
    check(c.status === 0, `--check reports drift after apply: ${(c.stderr || '').slice(0, 300)}`);
  } finally { fs.rmSync(a, { recursive: true, force: true }); }

  // --- 3. recorded-protected route loses its impressions -> stays indexed ---
  const b = stage();
  try {
    const slug = slugOf(loser);
    editSignals(b, (recs) => recs.filter((rec) => slugOf((() => {
      try { return new URL(String(rec.target_route)).pathname; } catch { return String(rec.target_route || ''); }
    })()) !== slug));
    const r = runApply(b);
    check(r.status === 0, `applier threw when ${loser} rolled out of the GSC window: ${(r.stderr || '').slice(0, 300)}`);
    check(!/noindex/i.test(robotsIn(b, loser)), `${loser} is on FINAL_protected.json but was noindexed when its impressions rolled off`);
  } finally { fs.rmSync(b, { recursive: true, force: true }); }
}

// --- 4. committed tree agrees with committed signals --------------------------
const live = runApply(ROOT, ['--check']);
check(live.status === 0, `committed pages drift from the noindex policy: ${(live.stderr || '').slice(0, 300)}`);

if (failures.length) {
  console.error('test:build-reconciles-noindex FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`test:build-reconciles-noindex OK (class ${klass.length}, gained ${gainer}, rolled-off ${loser})`);
