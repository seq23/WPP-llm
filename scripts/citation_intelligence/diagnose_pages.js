#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Page diagnosis stage.
 *
 * Connects observation evidence (GSC + manual query surface observations) and
 * static technical-SEO defects into one evidence-backed diagnostic ledger:
 * data/opportunities/page_diagnostics.json.
 *
 * Two diagnosis families:
 *  - "evidence": own-domain surfacing / competitor comparison from real observation
 *    ledgers. Truthful UNPROVEN/insufficient_evidence when no live evidence exists
 *    yet (this is expected until GSC credentials or manual logs are populated).
 *  - "technical": static, deterministic defects on already-admitted pages that do
 *    not require external evidence (duplicate title, missing/short/long meta
 *    description, missing canonical). These are real findings today.
 *
 * Never mark a page "needs_repair" from evidence absence. Absence is
 * insufficient_evidence, not a negative signal.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fallback; }
}
function cleanRoute(route) {
  const r = String(route || '/').replace(/^https?:\/\/[^/]+/, '').replace(/\.html$/, '').replace(/\/index$/, '/');
  return r.startsWith('/') ? r : '/' + r;
}
function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.pages-output', 'node_modules', '.build', 'logs', 'artifacts', 'admin'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}

function technicalFindings() {
  const files = walkHtml(ROOT);
  const findings = [];
  const byTitle = new Map();
  const pages = files.map((f) => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    const route = cleanRoute('/' + f.replace(/\.html$/, '').replace(/\/index$/, ''));
    if (title) { if (!byTitle.has(title)) byTitle.set(title, []); byTitle.get(title).push({ file: f, route }); }
    return { file: f, route, title, desc, canonical, html };
  });

  for (const p of pages) {
    if (p.desc === undefined) {
      findings.push({ route: p.route, file: p.file, repair_type: 'missing_meta_description', classification: 'AUTO', confidence: 1, evidence_source: 'static_html_scan', detail: 'No meta description tag present.' });
    } else if (p.desc.length < 70 || p.desc.length > 175) {
      findings.push({ route: p.route, file: p.file, repair_type: 'meta_description_length', classification: 'AUTO', confidence: 0.85, evidence_source: 'static_html_scan', detail: `Meta description is ${p.desc.length} chars (target ~70-175).` });
    }
    if (!p.canonical) {
      findings.push({ route: p.route, file: p.file, repair_type: 'missing_canonical', classification: 'AUTO', confidence: 1, evidence_source: 'static_html_scan', detail: 'No canonical link tag present.' });
    }
  }
  for (const [title, entries] of byTitle.entries()) {
    if (entries.length > 1) {
      for (const e of entries) {
        findings.push({ route: e.route, file: e.file, repair_type: 'duplicate_title', classification: 'AUTO_WATCH', confidence: 0.8, evidence_source: 'static_html_scan', detail: `Title "${title}" is shared by ${entries.length} routes: ${entries.map((x) => x.route).join(', ')}.`, duplicate_group: entries.map((x) => x.route) });
      }
    }
  }
  return findings;
}

function evidenceFindings() {
  const gsc = readJson('data/signals/gsc_query_signals.json', { records: [] });
  const manual = readJson('data/signals/query_surface_observations.json', { records: [] });
  const priority = readJson('data/seo/priority_queries.json', []);
  const benchmark = readJson('data/seo/benchmark_query_panel.json', { queries: [] });

  const targets = new Map();
  for (const q of priority) if (q.target_page) targets.set(q.query, { query: q.query, target_page: q.target_page, source: 'priority_queries' });
  for (const q of benchmark.queries || []) if (q.target_page && !targets.has(q.query)) targets.set(q.query, { query: q.query, target_page: q.target_page, source: 'benchmark_query_panel', query_id: q.id });

  const findings = [];
  for (const [, t] of targets) {
    const gscRows = (gsc.records || []).filter((r) => r.query === t.query || r.page === t.target_page);
    const manualRows = (manual.records || []).filter((r) => r.query === t.query || r.target_page === t.target_page);
    if (!gscRows.length && !manualRows.length) {
      findings.push({ route: t.target_page, query: t.query, repair_type: 'insufficient_evidence', classification: 'REVIEW', confidence: 0, evidence_source: 'none', detail: 'No GSC record and no manual observation exists yet for this priority query. UNPROVEN, not a negative result.' });
      continue;
    }
    const anySurfaced = manualRows.some((r) => r.own_url_surfaced === true) || gscRows.some((r) => (r.clicks || 0) > 0 || (r.impressions || 0) > 0);
    const competitorDomains = [...new Set(manualRows.flatMap((r) => (r.competitors_observed || []).map((c) => c.domain)))];
    if (!anySurfaced && (gscRows.length || manualRows.length)) {
      findings.push({ route: t.target_page, query: t.query, repair_type: 'free_win_candidate_own_page_not_surfacing', classification: 'REVIEW', confidence: 0.5, evidence_source: gscRows.length ? 'gsc' : 'manual', detail: 'Observed evidence exists but shows no own-domain surfacing for this query yet.', competitors_observed: competitorDomains });
    } else if (anySurfaced) {
      findings.push({ route: t.target_page, query: t.query, repair_type: 'healthy_observed_surfacing', classification: 'NONE', confidence: 0.6, evidence_source: gscRows.length ? 'gsc' : 'manual', detail: 'Own-domain surfacing observed for this query.', competitors_observed: competitorDomains });
    }
  }
  return findings;
}

function main() {
  const technical = technicalFindings();
  const evidence = evidenceFindings();
  const now = new Date().toISOString();
  const diagnostics = [
    ...technical.map((f, i) => ({ id: `diag_tech_${i}_${Buffer.from(f.route + f.repair_type).toString('hex').slice(0, 10)}`, diagnosis_type: 'technical', state: 'DIAGNOSED', created_at: now, ...f })),
    ...evidence.map((f, i) => ({ id: `diag_evi_${i}_${Buffer.from((f.route || '') + f.repair_type).toString('hex').slice(0, 10)}`, diagnosis_type: 'evidence', state: 'DIAGNOSED', created_at: now, ...f }))
  ];
  const out = {
    schema_version: '1.0',
    generated_at: now,
    counts: {
      total: diagnostics.length,
      auto: diagnostics.filter((d) => d.classification === 'AUTO').length,
      auto_watch: diagnostics.filter((d) => d.classification === 'AUTO_WATCH').length,
      review: diagnostics.filter((d) => d.classification === 'REVIEW').length,
      insufficient_evidence: diagnostics.filter((d) => d.repair_type === 'insufficient_evidence').length
    },
    diagnostics
  };
  fs.mkdirSync(path.join(ROOT, 'data/opportunities'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data/opportunities/page_diagnostics.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`Diagnosed ${diagnostics.length} findings (${out.counts.auto} AUTO, ${out.counts.auto_watch} AUTO_WATCH, ${out.counts.review} REVIEW, ${out.counts.insufficient_evidence} insufficient_evidence).`);
}

main();
