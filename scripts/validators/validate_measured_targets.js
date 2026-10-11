#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * The demand target set is measured, and the consolidation list is sound.
 *  - data/seo/measured_targets.json: every target has Search Console
 *    impressions > 0 from a named GSC source; every dropped record has a reason;
 *    the configured demand pages' queries are targets.
 *  - data/seo/consolidation_candidates.json: every candidate is a sitemap page
 *    with zero measured impressions, under the thin floor, folding into a hub
 *    page that exists; no candidate is a page a target lists.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const errors = [];
const read = (p) => { const f = path.join(ROOT, p); if (!fs.existsSync(f)) { errors.push(`${p} missing`); return null; } return JSON.parse(fs.readFileSync(f, 'utf8')); };
const SOURCES = new Set(['gsc_28d_query_page', 'gsc_28d_export', 'gsc_90d_query_page']);
const norm = (q) => String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const exists = (route) => { const r = route.replace(/^\//, ''); return [r === '' ? 'index.html' : `${r}.html`, `${r}/index.html`].some((c) => fs.existsSync(path.join(ROOT, c))); };

const t = read('data/seo/measured_targets.json');
const c = read('data/seo/consolidation_candidates.json');
const cfg = read('data/seo/site_head.json');
if (t) {
  if (!(t.targets || []).length) errors.push('measured_targets.json has zero targets');
  for (const x of t.targets || []) {
    if (!(Number(x.impressions) > 0)) errors.push(`target "${x.query}" has no measured impressions`);
    if (!(x.sources || []).length || x.sources.some((s) => !SOURCES.has(s))) errors.push(`target "${x.query}" has a non-Search-Console source: ${JSON.stringify(x.sources)}`);
  }
  for (const d of t.dropped || []) if (!d.reason) errors.push(`dropped "${d.query}" has no reason`);
  if (t.target_count !== (t.targets || []).length) errors.push('target_count does not match targets');
  const q = new Set((t.targets || []).map((x) => norm(x.query)));
  for (const d of (cfg && cfg.demand_pages) || []) if (!q.has(norm(d.query))) errors.push(`demand page query "${d.query}" is not a measured target`);
}
if (c && t) {
  if (!(c.sitemap_urls > 0)) errors.push('consolidation list was built over zero sitemap URLs');
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const targetPages = new Set((t.targets || []).flatMap((x) => x.pages || []));
  if (c.candidate_count !== (c.candidates || []).length) errors.push('candidate_count does not match candidates');
  for (const x of c.candidates || []) {
    if (!sm.includes(`<loc>https://virtualagency-os.com${x.route}</loc>`)) errors.push(`candidate ${x.route} is not in sitemap.xml`);
    if (x.impressions_measured !== 0 || targetPages.has(x.route)) errors.push(`candidate ${x.route} has measured impressions`);
    if (!(x.words < 700)) errors.push(`candidate ${x.route} is not thin (${x.words} words)`);
    if (!x.fold_into || !exists(x.fold_into)) errors.push(`candidate ${x.route} folds into a hub that does not exist: ${x.fold_into}`);
  }
}
if (errors.length) { console.error('measured targets FAILED:\n- ' + errors.slice(0, 40).join('\n- ')); process.exit(1); }
console.log(`measured targets OK: ${t.target_count} measured target(s), ${(t.dropped || []).length} dropped with reasons; ${c.candidate_count} consolidation candidate(s), each folding into an existing hub.`);
