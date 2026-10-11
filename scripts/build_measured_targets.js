#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Rebuild the demand target set from measured Search Console rows only, and
 * list the thin zero-impression pages with the hub each would fold into.
 *
 * Sources (all Search Console, nothing estimated):
 *   data/search_intelligence/search_analytics_28d.json   rolling 28-day query x page,
 *                                                        written daily by
 *                                                        distribution_scripts/gsc_search_intelligence.py
 *   data/search_intelligence/gsc_export_28d_*.json       the 28-day portfolio export
 *                                                        (first truth file, 2026-10-08)
 *   data/signals/gsc_query_signals.json                  90-day query x page, written by
 *                                                        distribution_scripts/gsc_collect_query_signals.py
 *
 * Third-party volume estimates (data/seo/priority_queries.json, Semrush records in
 * data/demand/measured_demand.json) are not targets unless Search Console has
 * shown the site for them; each one is listed under `dropped` with the reason.
 *
 * Outputs: data/seo/measured_targets.json, data/seo/consolidation_candidates.json.
 * No redirects are written; consolidation is a list, not an action.
 */
const fs = require('fs');
const path = require('path');
const { norm } = require('./lib/publication_freeze.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://virtualagency-os.com';
const THIN_WORDS = 700; // the repo's thin floor (data/demand/recommended_retirement_list.json criteria)
const rel = (p) => path.join(ROOT, p);
const readJson = (p, d) => (fs.existsSync(rel(p)) ? JSON.parse(fs.readFileSync(rel(p), 'utf8')) : d);
const pathOf = (u) => { const s = String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, ''); return s || '/'; };

function sources() {
  const out = [];
  const live = readJson('data/search_intelligence/search_analytics_28d.json', null);
  if (live && (live.rows || []).length) out.push({ id: 'gsc_28d_query_page', window: `${live.start_date}..${live.end_date}`, rows: live.rows.map((r) => ({ query: r.query, page: r.page, impressions: r.impressions, clicks: r.clicks, position: r.position })) });
  const exports = fs.readdirSync(rel('data/search_intelligence')).filter((f) => /^gsc_export_28d_.*\.json$/.test(f)).sort();
  if (exports.length) {
    const e = readJson(`data/search_intelligence/${exports[exports.length - 1]}`);
    out.push({ id: 'gsc_28d_export', window: `${e.start_date}..${e.end_date}`, rows: (e.top_queries || []).map((r) => ({ query: r.query, page: null, impressions: r.impressions, clicks: r.clicks, position: r.position })), pages: (e.top_pages || []).map((r) => ({ page: r.page, impressions: r.impressions })) });
  }
  const sig = readJson('data/signals/gsc_query_signals.json', { records: [] });
  if ((sig.records || []).length) out.push({ id: 'gsc_90d_query_page', window: `90 days to ${String(sig.generated_at).slice(0, 10)}`, rows: sig.records.filter((r) => r.signal_type === 'gsc_query_performance').map((r) => ({ query: r.query_or_topic, page: r.target_route, impressions: r.impressions, clicks: r.clicks, position: r.position })) });
  return out;
}

function fileForRoute(route) {
  const r = route.replace(/^\//, '');
  for (const c of [r === '' ? 'index.html' : `${r}.html`, `${r}/index.html`]) if (c && fs.existsSync(rel(c))) return c;
  return null;
}

function words(html) {
  const body = (html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  return body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

function hubFor(html, route, pillarByRoute) {
  const m = html.match(/"@type":"BreadcrumbList","itemListElement":(\[[\s\S]*?\])\}/);
  if (m) {
    try {
      const items = JSON.parse(m[1]).map((i) => pathOf(i.item)).filter((p) => p !== route);
      const hub = [...items].reverse().find((p) => /^\/(topics|pillars)\/.+/.test(p) && fileForRoute(p));
      if (hub) return { hub, basis: 'breadcrumb' };
    } catch { /* fall through */ }
  }
  const pillar = pillarByRoute.get(route);
  if (pillar && fileForRoute(`/pillars/${pillar}`)) return { hub: `/pillars/${pillar}`, basis: 'admission_pillar' };
  return { hub: '/', basis: 'homepage_fallback' };
}

function main() {
  const srcs = sources();
  if (!srcs.length) { console.error('measured-targets: no Search Console source found; refusing to write an empty target set.'); process.exit(1); }

  // Targets: one per normalized query, all pages that carried it, best source first.
  const byQuery = new Map();
  let probeRows = 0;
  for (const s of srcs) for (const r of s.rows) {
    if (!r.query || !(Number(r.impressions) > 0)) continue;
    // Search-operator strings ("-site:reddit.com ...") are tool probes, not demand.
    if (/(^|\s)-?site:/i.test(r.query)) { probeRows++; continue; }
    const k = norm(r.query);
    const t = byQuery.get(k) || { query: r.query, impressions: 0, clicks: 0, best_position: null, pages: new Set(), sources: new Set() };
    t.sources.add(s.id);
    if (r.page) t.pages.add(pathOf(r.page));
    t.best_position = t.best_position == null ? r.position : Math.min(t.best_position, r.position);
    t[`impressions_${s.id}`] = (t[`impressions_${s.id}`] || 0) + Number(r.impressions);
    t.clicks += Number(r.clicks || 0);
    byQuery.set(k, t);
  }
  const targets = [...byQuery.values()].map((t) => {
    const imp = Math.max(...[...t.sources].map((id) => t[`impressions_${id}`] || 0));
    const out = { query: t.query, impressions: imp, clicks: t.clicks, best_position: Math.round(t.best_position * 10) / 10, pages: [...t.pages].sort(), sources: [...t.sources] };
    for (const id of t.sources) out[`impressions_${id}`] = t[`impressions_${id}`];
    return out;
  }).sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query));

  const measured = new Set(targets.map((t) => norm(t.query)));
  const dropped = [];
  for (const q of readJson('data/seo/priority_queries.json', [])) {
    if (!measured.has(norm(q.query))) dropped.push({ query: q.query, from: 'data/seo/priority_queries.json', reason: `no Search Console impression in any measured window; ${q.source || 'third-party'} volume ${q.trusted_volume_per_month ?? 'n/a'}/mo is an estimate, not a measurement` });
  }
  for (const r of readJson('data/demand/measured_demand.json', { records: [] }).records || []) {
    if (!measured.has(norm(r.query))) dropped.push({ query: r.query, from: 'data/demand/measured_demand.json', reason: `no Search Console impression in any measured window; ${r.source_type || 'third-party'} record is an estimate, not a measurement` });
  }

  // Pages with any measured impression (a 404 URL's impressions credit its live /programmatic/ twin).
  const impByPage = new Map();
  const credit = (p, n) => impByPage.set(p, (impByPage.get(p) || 0) + Number(n || 0));
  const deadWithTwin = new Map();
  for (const s of srcs) {
    for (const r of [...s.rows.filter((x) => x.page), ...(s.pages || [])]) {
      const p = pathOf(r.page);
      if (fileForRoute(p)) { credit(p, r.impressions); continue; }
      const twin = `/programmatic${p}`;
      if (fileForRoute(twin)) {
        credit(twin, r.impressions);
        const d = deadWithTwin.get(p) || { dead_url: SITE + p, live_twin: twin, impressions_measured: 0 };
        d.impressions_measured += Number(r.impressions || 0);
        deadWithTwin.set(p, d);
      }
    }
  }

  const sitemap = fs.readFileSync(rel('sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!urls.length) { console.error('measured-targets: sitemap.xml lists zero URLs'); process.exit(1); }
  const pillarByRoute = new Map((readJson('data/content/page_admission_registry.json', { admissions: [] }).admissions || []).map((a) => [pathOf(a.route), a.pillar]));
  const candidates = [];
  let zeroImpression = 0;
  for (const u of urls) {
    const route = pathOf(u);
    if (/\/$/.test(u) && route !== '/') continue; // directory index pages are hubs
    if ((impByPage.get(route) || 0) > 0) continue;
    zeroImpression++;
    if (/^\/(topics|pillars)(\/|$)/.test(route) || route === '/') continue; // hubs are fold targets, not candidates
    const f = fileForRoute(route);
    if (!f) continue;
    const html = fs.readFileSync(rel(f), 'utf8');
    const w = words(html);
    if (w >= THIN_WORDS) continue;
    const { hub, basis } = hubFor(html, route, pillarByRoute);
    candidates.push({ route, words: w, impressions_measured: 0, fold_into: hub, hub_basis: basis });
  }
  candidates.sort((a, b) => a.fold_into.localeCompare(b.fold_into) || a.route.localeCompare(b.route));
  const byHub = {};
  for (const c of candidates) byHub[c.fold_into] = (byHub[c.fold_into] || 0) + 1;

  const now = new Date().toISOString();
  fs.writeFileSync(rel('data/seo/measured_targets.json'), JSON.stringify({
    generated_at: now,
    rule: 'A target exists only where a Search Console row measured impressions for the query. Rebuilt by `npm run seo:measured-targets`; read by the publication freeze gate (scripts/lib/publication_freeze.js).',
    sources: srcs.map((s) => ({ id: s.id, window: s.window, rows: s.rows.length })),
    excluded_operator_probe_rows: probeRows,
    target_count: targets.length,
    targets,
    dropped_count: dropped.length,
    dropped,
  }, null, 2) + '\n');
  fs.writeFileSync(rel('data/seo/consolidation_candidates.json'), JSON.stringify({
    generated_at: now,
    rule: `Sitemap pages with zero measured Search Console impressions (all sources above) and fewer than ${THIN_WORDS} body words, each with the hub it would fold into (deepest /topics/ or /pillars/ breadcrumb ancestor, else its admission pillar). A list, not an action: no page is removed or redirected by this file.`,
    sitemap_urls: urls.length,
    zero_impression_urls: zeroImpression,
    candidate_count: candidates.length,
    candidates_by_hub: byHub,
    candidates,
    dead_urls_with_live_twin_note: 'URLs Google measured that now return 404 while the same page lives under /programmatic/. Their impressions are credited to the twin above. Recovering them needs a 301 per row; out of scope for the PR that wrote this list (no redirects).',
    dead_urls_with_live_twin_count: deadWithTwin.size,
    dead_urls_with_live_twin_impressions: [...deadWithTwin.values()].reduce((a, d) => a + d.impressions_measured, 0),
    dead_urls_with_live_twin: [...deadWithTwin.values()].sort((a, b) => b.impressions_measured - a.impressions_measured),
  }, null, 2) + '\n');
  console.log(`measured-targets: ${targets.length} target(s) from ${srcs.map((s) => s.id).join(', ')}; ${dropped.length} dropped; ${candidates.length} consolidation candidate(s) of ${zeroImpression} zero-impression sitemap URL(s); ${deadWithTwin.size} measured URL(s) 404 with a live twin.`);
}

main();
