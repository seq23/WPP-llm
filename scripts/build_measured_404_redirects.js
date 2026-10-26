#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Writes data/redirects/measured_404_redirects.json: one 301 for every URL that
 * Search Console measured (any window: 90-day query x page, rolling 28-day, the
 * 28-day export, the page dimension and additive page history in
 * data/search_intelligence/gsc_truth.json, every Google-chosen canonical in the
 * URL Inspection file, and the dead-URL list in
 * data/seo/consolidation_candidates.json)
 * and that this build answers with a 404.
 *
 * Why: on 11 Oct 2026, 149 measured URLs returned 404 while the same page lived
 * under /programmatic/. They had carried 5,366 of ~7,474 impressions in 90 days.
 *
 * Target, in order:
 *   1. the live /programmatic/ twin of the same slug;
 *   2. else the hub the twin (or the URL) would fold into, from
 *      data/seo/consolidation_candidates.json (`fold_into`);
 *   3. else the homepage. Never a 404.
 * A URL already covered by data/redirects/legacy_404_redirects.json stays there
 * and is not duplicated here. Rules are additive: a URL measured once keeps its
 * rule even after it ages out of the measurement windows.
 *
 * scripts/update_redirects_clean_to_html.js emits these into _redirects;
 * scripts/validators/validate_measured_urls_resolve.js proves each lands on a page.
 */
const fs = require('fs');
const path = require('path');
const { resolvePath } = require('./lib/pages_routing.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data/redirects/measured_404_redirects.json');
const rel = (p) => path.join(ROOT, p);
const readJson = (p, d) => (fs.existsSync(rel(p)) ? JSON.parse(fs.readFileSync(rel(p), 'utf8')) : d);
const pathOf = (u) => { try { return new URL(u, 'https://virtualagency-os.com').pathname; } catch { return null; } };

function measuredPages() {
  const imp = new Map();
  const add = (u, n) => { const p = pathOf(u); if (p) imp.set(p, (imp.get(p) || 0) + Number(n || 0)); };
  for (const r of readJson('data/signals/gsc_query_signals.json', { records: [] }).records || []) {
    if (r.signal_type === 'gsc_query_performance') add(r.target_route, r.impressions);
  }
  for (const r of readJson('data/search_intelligence/search_analytics_28d.json', { rows: [] }).rows || []) add(r.page, 0);
  // The page dimension on its own, and the history that keeps it. Search Console
  // withholds the query on low-volume rows, so a page can carry impressions all
  // quarter with no query x page row anywhere above: on 26 Oct 2026, 42 root URLs
  // Google had measured in 90 days answered 404 while their /programmatic/ twin
  // was live, and none of them appeared in any query x page source. page_history
  // is additive, so a URL keeps its rule after it ages out of the window.
  const truth = readJson('data/search_intelligence/gsc_truth.json', {});
  for (const r of truth.pages || []) add(r.page, r.impressions);
  for (const r of truth.pages_90d || []) add(r.page, r.impressions);
  for (const r of truth.page_history || []) add(r.page, r.impressions_best_window);
  const dir = rel('data/search_intelligence');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^gsc_export_28d_.*\.json$/.test(x)) : []) {
    for (const r of readJson(`data/search_intelligence/${f}`, {}).top_pages || []) add(r.page || r.url, 0);
  }
  // URLs Google chose as the canonical of one of our pages (URL Inspection,
  // data/search_intelligence/index_coverage.json). 16 Oct 2026: 55 root-level
  // slugs, retired when their pages moved under /programmatic/ on 22 Jul, were
  // still Google's canonical for the /programmatic/ twin and 46 answered 404, so
  // the signal could not consolidate onto the page we keep.
  for (const v of Object.values(readJson('data/search_intelligence/index_coverage.json', { urls: {} }).urls || {})) {
    if (v && v.googleCanonical) add(v.googleCanonical, 0);
  }
  const cand = readJson('data/seo/consolidation_candidates.json', {});
  for (const d of cand.dead_urls_with_live_twin || []) {
    const p = pathOf(d.dead_url);
    if (p) imp.set(p, Math.max(imp.get(p) || 0, Number(d.impressions_measured || 0)));
  }
  return imp;
}

function main() {
  const legacy = new Set((readJson('data/redirects/legacy_404_redirects.json', { rules: [] }).rules || []).map((r) => r.from));
  const foldInto = new Map((readJson('data/seo/consolidation_candidates.json', {}).candidates || []).map((c) => [c.route, c.fold_into]));
  const previous = new Map((readJson('data/redirects/measured_404_redirects.json', { rules: [] }).rules || []).map((r) => [r.from, r]));
  const isPage = (p) => resolvePath(p, { root: ROOT, rules: [] }).kind === 'page';
  // Variants consolidated onto their family page
  // (data/seo/duplicate_family_consolidation.json) carry their own 301, and a
  // measured twin that was one of them lands on the family page directly.
  const retiredTo = new Map(require('./lib/consolidated_families.js').redirectRules().map((r) => [r.from, r.to]));

  const rules = new Map();
  const consider = (from, impressions, prior) => {
    if (legacy.has(from) || retiredTo.has(from) || isPage(from)) return;
    const twin = `/programmatic${from}`;
    let to; let why;
    if (isPage(twin)) { to = twin; why = 'Measured in Search Console, then 404. The same page is published at this /programmatic/ route.'; }
    else if (retiredTo.get(twin) && isPage(retiredTo.get(twin))) { to = retiredTo.get(twin); why = 'Measured in Search Console, then 404. Its /programmatic/ twin was merged into the indexed page of its duplicate family.'; }
    else if (foldInto.get(twin) && isPage(foldInto.get(twin))) { to = foldInto.get(twin); why = 'Measured in Search Console, then 404. No same-slug page; lands on the hub its twin folds into.'; }
    else if (foldInto.get(from) && isPage(foldInto.get(from))) { to = foldInto.get(from); why = 'Measured in Search Console, then 404. No same-slug page; lands on the hub it folds into.'; }
    else { to = '/'; why = 'Measured in Search Console, then 404. No same-slug page and no fold_into hub; lands on the homepage rather than a 404.'; }
    rules.set(from, { from, to, why, impressions_measured: Math.max(impressions || 0, prior?.impressions_measured || 0) });
  };
  for (const [p, n] of measuredPages()) consider(p, n, previous.get(p));
  for (const [p, r] of previous) if (!rules.has(p)) consider(p, r.impressions_measured, r);

  const list = [...rules.values()].sort((a, b) => b.impressions_measured - a.impressions_measured || a.from.localeCompare(b.from));
  if (!list.length && !previous.size) {
    console.error('measured-404-redirects: zero rules and no previous file; refusing to write an empty list.');
    process.exit(1);
  }
  fs.writeFileSync(OUT, `${JSON.stringify({
    _comment: [
      'Written by scripts/build_measured_404_redirects.js. Do not edit by hand.',
      'Every URL Search Console measured that this build answers with a 404, each with a 301 target: the same-slug /programmatic/ page, else its fold_into hub, else the homepage.',
      'Emitted into _redirects by scripts/update_redirects_clean_to_html.js; proven by scripts/validators/validate_measured_urls_resolve.js and, live, by scripts/live_check_measured_redirects.js.',
    ],
    rule_count: list.length,
    impressions_measured: list.reduce((a, r) => a + r.impressions_measured, 0),
    rules: list,
  }, null, 2)}\n`);
  const off = list.filter((r) => !r.to.startsWith('/programmatic/')).length;
  console.log(`measured-404-redirects: ${list.length} rule(s); ${list.length - off} to the /programmatic/ twin, ${off} to a hub.`);
}

main();
