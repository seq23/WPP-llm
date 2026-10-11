#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Daily strengthening sweep: picks the pages to strengthen from measured
 * demand and records them in data/seo/strengthening_ledger.json.
 *
 * WHY. Until 11 Oct 2026 the only pages strengthened were the three in the
 * 28-day Search Console window (25 impressions between them), while 7,288
 * impressions over 90 days sat on query families nobody was serving. The
 * candidate rule now reads the 90-day measured targets:
 *
 *   RULE  a page is a candidate when a query Google showed it for has
 *         >= MIN_IMPRESSIONS impressions at position <= MAX_POSITION in
 *         data/seo/measured_targets.json, OR it is the primary page of a
 *         top-12 family in data/seo/demand_families.json.
 *
 * For each candidate the ledger records why it was flagged, when it was first
 * and last flagged, and when it was last strengthened (data/seo/demand_pages.json
 * and the demand_pages in data/seo/site_head.json carry strengthened_at). A
 * top-12 family with no demand page is flagged needs_demand_page: the
 * publication freeze lets a family's missing primary page through because its
 * query is measured. A flagged secondary page that already links to its
 * family primary (data/seo/demand_links.json) is consolidated_to_primary.
 *
 * RULE 0: zero candidates means the inputs are empty or the rule is broken;
 * the sweep fails instead of writing an empty ledger.
 */
const fs = require('fs');
const path = require('path');
const { resolvePath } = require('./lib/pages_routing.js');
const { loadConfig } = require('./lib/site_head.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = 'data/seo/strengthening_ledger.json';
const MIN_IMPRESSIONS = 50;
const MAX_POSITION = 40;
const readJson = (p, d) => (fs.existsSync(path.join(ROOT, p)) ? JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) : d);
const resolve = (p) => { const r = resolvePath(p, { root: ROOT }); return r.kind === 'redirect' ? r.to : r.kind === 'page' ? p : null; };

function build(today = new Date().toISOString().slice(0, 10)) {
  const mt = readJson('data/seo/measured_targets.json', { targets: [] });
  const fams = readJson('data/seo/demand_families.json', { families: [] });
  const prev = readJson(OUT, { pages: [], runs: [] });
  const prevBy = new Map((prev.pages || []).map((p) => [p.route, p]));
  const cfg = loadConfig();
  const strengthened = new Map((cfg.demand_pages || []).map((d) => [d.route || `/${d.file.replace(/\.html$/, '')}`, d]));
  const linked = new Map((cfg.demand_links || []).map((l) => [l.route, l.links.map((x) => x.href)]));
  const famOfQuery = new Map();
  for (const f of fams.families || []) for (const q of f.queries || []) famOfQuery.set(q.query, f.family);

  const cands = new Map();
  const flag = (route, reason, family) => {
    if (!cands.has(route)) cands.set(route, { route, reasons: [], families: new Set() });
    const c = cands.get(route);
    if (!c.reasons.includes(reason)) c.reasons.push(reason);
    if (family) c.families.add(family);
  };
  for (const t of mt.targets || []) {
    if (Number(t.impressions) < MIN_IMPRESSIONS || Number(t.best_position) > MAX_POSITION) continue;
    for (const p of t.pages || []) {
      const route = resolve(p);
      if (route) flag(route, `"${t.query}": ${t.impressions} impressions at position ${t.best_position} (90 days)`, famOfQuery.get(t.query));
    }
  }
  const missing = [];
  for (const f of fams.families || []) {
    if (!f.top12) continue;
    flag(f.primary_route, `primary page of top-12 family "${f.family}" (${f.impressions} impressions, rank ${f.top12_rank})`, f.family);
    if (![...strengthened.values()].some((d) => d.family === f.family)) missing.push(f.family);
  }

  const impOf = new Map();
  for (const t of mt.targets || []) for (const p of t.pages || []) { const r = resolve(p); if (r) impOf.set(r, (impOf.get(r) || 0) + Number(t.impressions) / t.pages.length); }
  const pages = [...cands.values()].map((c) => {
    const d = strengthened.get(c.route);
    const was = prevBy.get(c.route);
    const fam = [...c.families];
    const needsPage = fam.some((f) => missing.includes(f)) && !d;
    return {
      route: c.route,
      families: fam.sort(),
      impressions_90d: Math.round(impOf.get(c.route) || 0),
      reasons: c.reasons,
      first_flagged_at: was?.first_flagged_at || today,
      last_flagged_at: today,
      last_strengthened_at: d?.strengthened_at || null,
      ...(linked.has(c.route) ? { links_to_primary: linked.get(c.route) } : {}),
      // A secondary page that ranks for a family's query and already links to
      // the family primary is consolidated: the primary is the page being
      // strengthened for that query.
      status: needsPage ? 'needs_demand_page' : d ? 'strengthened' : linked.has(c.route) ? 'consolidated_to_primary' : 'needs_strengthening',
    };
  }).sort((a, b) => b.impressions_90d - a.impressions_90d || a.route.localeCompare(b.route));

  const runs = [...(prev.runs || []).filter((r) => r.at !== today), {
    at: today, flagged: pages.length,
    strengthened: pages.filter((p) => p.status === 'strengthened').length,
    needs_strengthening: pages.filter((p) => p.status === 'needs_strengthening').length,
    needs_demand_page: pages.filter((p) => p.status === 'needs_demand_page').length,
    consolidated_to_primary: pages.filter((p) => p.status === 'consolidated_to_primary').length,
  }].slice(-60);
  return {
    _comment: [
      'Written by scripts/build_strengthening_ledger.js (npm run seo:strengthening-sweep, daily in .github/workflows/search-repair-retest.yml). Do not edit by hand.',
      `Rule: a page is flagged when a query Google showed it for has >= ${MIN_IMPRESSIONS} impressions at position <= ${MAX_POSITION} over 90 days (data/seo/measured_targets.json), or it is the primary page of a top-12 family (data/seo/demand_families.json).`,
      'Strengthen a flagged page at source (data/seo/demand_pages.json for full demand pages, data/seo/site_head.json demand_pages for the lighter form), then npm run demand:refreeze.',
    ],
    rule: { min_impressions_90d: MIN_IMPRESSIONS, max_position: MAX_POSITION, plus: 'every top-12 family primary page' },
    measured_targets_generated_at: mt.generated_at,
    updated_at: today,
    flagged_count: pages.length,
    missing_family_pages: missing,
    pages,
    runs,
  };
}

if (require.main === module) {
  const out = build();
  if (!out.flagged_count) { console.error('strengthening-sweep: zero candidates from the measured targets and demand families; the inputs are empty or the rule is broken.'); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(out, null, 2)}\n`);
  const last = out.runs[out.runs.length - 1];
  console.log(`strengthening-sweep: ${out.flagged_count} page(s) flagged (${last.strengthened} strengthened, ${last.consolidated_to_primary} consolidated to a family primary, ${last.needs_strengthening} need strengthening, ${last.needs_demand_page} need a demand page).`);
}
module.exports = { build, MIN_IMPRESSIONS, MAX_POSITION, OUT };
