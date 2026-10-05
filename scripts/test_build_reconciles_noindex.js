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
 *   2. a noindex route that gains one impression is restored to index; --check
 *      then reports zero drift
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

// --- pick subjects from the real corpus ---------------------------------------
const policy = require('./lib/noindex_policy.js');
const { klass, noindex } = policy.classify();
const recorded = new Set(JSON.parse(fs.readFileSync(policy.PROTECTED_FILE, 'utf8')));
const gainer = noindex.find((r) => /noindex/i.test(robotsIn(ROOT, r)));
const loser = klass.find((r) => recorded.has(r) && !policy.hasMeasuredDemand(r) && policy.impressionsFor(r) > 0);
check(klass.length > 0, 'zero audience-permutation routes examined');
check(!!gainer, 'no noindex route on disk to promote - case 2 examined zero items');
check(!!loser, 'no recorded-protected, impression-only route - case 3 examined zero items');

// --- temp copy of everything the policy and applier read ----------------------
function stage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noindex-reconcile-'));
  for (const rel of ['scripts', 'programmatic', 'data/demand', 'data/content/page_admission_registry.json',
    'data/signals/gsc_query_signals.json', 'data/authority_scale/query_atlas.json']) {
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
