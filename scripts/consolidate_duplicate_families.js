#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Consolidates /programmatic/ duplicate families onto the one variant Google
 * indexed.
 *
 * Why: URL Inspection (index_coverage.json, collected 25 Oct 2026) reported 454
 * /programmatic/ URLs as "Duplicate, Google chose different canonical than
 * user" with Google's canonical set to the homepage, in 90 families named by
 * the first three slug words (agency-rfp-questions-* had 18 duplicates and 19
 * indexed). Google had already decided these variants are one page; leaving
 * them up keeps 454 URLs Google will not index competing for crawl with the
 * siblings it does.
 *
 * Rule, per family:
 *   - keeper = the family member Google indexed ("Submitted and indexed") with
 *     the most measured impressions (search_analytics_28d.json and
 *     data/signals/gsc_query_signals.json; the larger of the two per page, so
 *     one impression is never counted twice), then the shortest slug, then the
 *     most recent crawl.
 *   - a family with no indexed member falls back to the page's admission
 *     cluster, then to its two-word slug prefix. No indexed member there either
 *     means the duplicate is left alone and listed under `unresolved`.
 *   - every other duplicate's distinct answer (its H1 question and the first
 *     paragraph of "What this page recommends") is merged into the keeper,
 *     skipping any answer whose text the keeper already carries.
 *   - the duplicate's HTML is removed; its admission record becomes
 *     `consolidated` with `redirect_to`; update_redirects_clean_to_html.js emits
 *     the 301 from this ledger; the freeze registry records it under `retired`.
 *   - the release plan pauses every family in this ledger
 *     (scripts/lib/consolidated_families.js), so the release lane can neither
 *     recreate a retired URL nor rewrite the keeper underneath the merge.
 *
 * Pages on the thin ledger (data/seo/consolidation_candidates.json) are not
 * touched, as keeper or as duplicate: that ledger is re-read on 2 Nov 2026,
 * once URL Inspection has covered the whole sitemap.
 *
 * Frozen pages change only through the documented thaw: --apply writes every
 * keeper into data/release/active_mutation_scope.json, then
 * `npm run authority:scale:freeze && npm run authority:scale:clear-scope`
 * refreezes, after `node scripts/build_link_architecture.js --write-scope` has
 * dropped the retired variants from every hub and sibling list (that run's scope
 * is unioned with the keepers by re-running --apply, which is idempotent).
 *
 * Usage:
 *   node scripts/consolidate_duplicate_families.js --plan    # write the ledger only
 *   node scripts/consolidate_duplicate_families.js --apply   # apply the committed ledger
 *   node scripts/consolidate_duplicate_families.js --relink  # re-point body links (build step)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOST = 'https://virtualagency-os.com';
const LEDGER = 'data/seo/duplicate_family_consolidation.json';
const SCOPE = 'data/release/active_mutation_scope.json';
const ADMISSIONS = 'data/content/page_admission_registry.json';
const DUP_STATE = 'Duplicate, Google chose different canonical than user';
const START = '<!--consolidated:answers-->';
const END = '<!--/consolidated:answers-->';

const readJson = (rel, fallback) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf8')) : fallback;
};
const writeJson = (rel, data) => fs.writeFileSync(path.join(ROOT, rel), `${JSON.stringify(data, null, 2)}\n`);
const routeOf = (url) => url.replace(HOST, '').replace(/\/+$/, '') || '/';
const slugOf = (route) => route.split('/').pop();
const prefix = (route, n) => slugOf(route).split('-').slice(0, n).join('-');
const fileOf = (route) => `${route.replace(/^\//, '')}.html`;
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function shingles(s, n = 5) {
  const w = s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(' '));
  return out;
}

// The variant's own answer: its H1 question and the direct answer under
// "What this page recommends" (the first paragraph of the page body otherwise).
function answerOf(html) {
  const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<!--link-arch:([a-z-]+)-->[\s\S]*?<!--\/link-arch:\1-->/g, '');
  const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const rec = body.match(/<h2[^>]*>\s*What this page recommends\s*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/)
    || body.match(/<main[\s\S]*?<h2[^>]*>[\s\S]*?<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/);
  if (!h1 || !rec) return null;
  return { question: text(h1[1]), answer: text(rec[1]) };
}

function plan() {
  const coverage = readJson('data/search_intelligence/index_coverage.json', { urls: {} }).urls;
  const admissions = new Map(readJson(ADMISSIONS, { admissions: [] }).admissions.map((a) => [a.route, a]));
  const thin = new Set((JSON.stringify(readJson('data/seo/consolidation_candidates.json', {}))
    .match(/\/programmatic\/[a-z0-9-]+/g) || []));
  // Demand-family primaries (data/seo/demand_family_rules.json, and the pages
  // data/seo/demand_pages.json strengthens) are the repo's chosen main guide for
  // a measured query family. They stay up even when Google has folded them, so
  // their family's variants merge around them rather than retire them.
  const primaries = new Set([
    ...(readJson('data/seo/demand_family_rules.json', { families: [] }).families || []).map((f) => f.primary_route).filter(Boolean),
    ...(JSON.stringify(readJson('data/seo/demand_pages.json', {})).match(/\/programmatic\/[a-z0-9-]+/g) || []),
  ]);
  // Answers already extracted are carried over, so a re-plan after the variant
  // pages are gone loses nothing.
  const prior = new Map();
  for (const f of readJson(LEDGER, { families: [] }).families || []) for (const m of f.merged || []) if (m.answer) prior.set(m.route, m);

  const fromAnalytics = new Map();
  for (const r of readJson('data/search_intelligence/search_analytics_28d.json', { rows: [] }).rows || []) {
    const k = routeOf(r.page); fromAnalytics.set(k, (fromAnalytics.get(k) || 0) + (r.impressions || 0));
  }
  const fromSignals = new Map();
  for (const r of readJson('data/signals/gsc_query_signals.json', { records: [] }).records || []) {
    const k = routeOf(r.target_route || ''); fromSignals.set(k, (fromSignals.get(k) || 0) + (r.impressions || 0));
  }
  const impressions = (r) => Math.max(fromAnalytics.get(r) || 0, fromSignals.get(r) || 0);

  const onDisk = (r) => fs.existsSync(path.join(ROOT, fileOf(r)));
  const indexed = Object.entries(coverage)
    .filter(([u, v]) => u.includes('/programmatic/') && v.coverageState === 'Submitted and indexed')
    .map(([u, v]) => ({ route: routeOf(u), crawl: v.lastCrawlTime || '' }))
    .filter((p) => !thin.has(p.route) && onDisk(p.route));
  const dups = Object.entries(coverage)
    .filter(([u, v]) => u.includes('/programmatic/') && v.coverageState === DUP_STATE && v.googleCanonical === `${HOST}/`)
    .map(([u]) => routeOf(u)).sort();

  // Ties on impressions go to the most general variant (shortest slug), which is
  // the one a merged family reads naturally under, then to the latest crawl.
  const best = (members) => members.slice().sort((a, b) => (impressions(b.route) - impressions(a.route))
    || slugOf(a.route).length - slugOf(b.route).length || b.crawl.localeCompare(a.crawl)
    || a.route.localeCompare(b.route))[0];
  const inFamily = (key) => (p) => slugOf(p.route) === key || slugOf(p.route).startsWith(`${key}-`);

  const families = new Map();
  const excluded = [];
  const excludedPrimaries = [];
  const unresolved = [];
  for (const route of dups) {
    if (thin.has(route)) { excluded.push(route); continue; }
    if (primaries.has(route)) { excludedPrimaries.push(route); continue; }
    if (!onDisk(route)) { unresolved.push({ route, reason: 'no rendered page on disk' }); continue; }
    const brief = prefix(route, 3);
    const cluster = admissions.get(route)?.cluster;
    const candidates = [
      { key: brief, basis: 'first three slug words' },
      cluster && cluster !== 'unclustered' && { key: cluster, basis: 'admission cluster' },
      { key: prefix(route, 2), basis: 'first two slug words' },
    ].filter(Boolean);
    let chosen = null;
    for (const c of candidates) {
      const members = indexed.filter(inFamily(c.key));
      if (members.length) { chosen = { ...c, keeper: best(members).route }; break; }
    }
    if (!chosen) { unresolved.push({ route, reason: 'no indexed page in its family, cluster or two-word prefix' }); continue; }
    if (!families.has(chosen.keeper)) {
      families.set(chosen.keeper, { family: brief, basis: chosen.basis, pause_prefix: chosen.key, keeper: chosen.keeper, keeper_impressions: impressions(chosen.keeper), merged: [] });
    }
    const fam = families.get(chosen.keeper);
    if (chosen.key.length < fam.pause_prefix.length) fam.pause_prefix = chosen.key;
    const was = prior.get(route);
    fam.merged.push({ route, impressions: impressions(route), ...(was ? { question: was.question, answer: was.answer } : {}) });
  }

  const list = [...families.values()].sort((a, b) => a.keeper.localeCompare(b.keeper));
  const ledger = {
    schema_version: '1.0',
    measured_from: {
      index_coverage: 'data/search_intelligence/index_coverage.json',
      index_coverage_generated_at: readJson('data/search_intelligence/index_coverage.json', {}).generated_at || null,
      impressions: ['data/search_intelligence/search_analytics_28d.json', 'data/signals/gsc_query_signals.json'],
    },
    rule: `Every /programmatic/ URL whose coverageState is "${DUP_STATE}" with googleCanonical ${HOST}/ is 301'd to the indexed member of its family with the most measured impressions; its distinct answer is merged into that page. Thin-ledger pages are left for the 2 Nov 2026 re-read.`,
    measurement: { duplicates_at_plan: dups.length, target: 'By 22 Nov 2026: duplicates (all states) under 150 and indexed share among inspected >= 70%.' },
    duplicate_families_by_brief_key: new Set(dups.map((r) => prefix(r, 3))).size,
    keepers: list.length,
    consolidated_count: list.reduce((n, f) => n + f.merged.length, 0),
    families: list,
    excluded_thin_ledger: excluded,
    excluded_demand_primaries: excludedPrimaries,
    unresolved,
  };
  writeJson(LEDGER, ledger);
  console.log(JSON.stringify({ command: 'plan', duplicates: dups.length, brief_families: ledger.duplicate_families_by_brief_key, keepers: list.length, consolidated: ledger.consolidated_count, excluded_thin_ledger: excluded.length, excluded_demand_primaries: excludedPrimaries.length, unresolved: unresolved.length }, null, 2));
}

function mergedBlock(keeperHtml, answers) {
  // Compared against the keeper's own body only: link-architecture regions
  // quote sibling descriptions and change whenever the family does, which would
  // make the merge depend on run order.
  const own = keeperHtml.replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<!--link-arch:([a-z-]+)-->[\s\S]*?<!--\/link-arch:\1-->/g, '');
  const seen = shingles(text(own));
  const kept = [];
  for (const a of answers) {
    const s = shingles(a.answer);
    if (!s.size) continue;
    let overlap = 0;
    for (const x of s) if (seen.has(x)) overlap += 1;
    if (overlap / s.size >= 0.5) continue;
    for (const x of s) seen.add(x);
    kept.push(a);
  }
  if (!kept.length) return { html: '', count: 0 };
  const esc = (s) => s.replace(/&(?!(?:[a-z]+|#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const items = kept.map((a) => `<h3>${esc(a.question)}</h3>\n<p>${esc(a.answer)}</p>`).join('\n');
  return { html: `${START}\n<section class="consolidated-answers">\n<h2>More questions this guide answers</h2>\n${items}\n</section>\n${END}\n`, count: kept.length };
}

function apply() {
  const ledger = readJson(LEDGER, null);
  if (!ledger || !Array.isArray(ledger.families) || !ledger.families.length) {
    console.error(`${LEDGER} is missing or has no families; run --plan first.`);
    process.exit(1);
  }
  const reg = readJson(ADMISSIONS, null);
  const scope = new Set((readJson(SCOPE, { routes: [] }).routes || []));
  let injected = 0; let answers = 0; let removed = 0; let marked = 0;
  for (const fam of ledger.families) {
    const keeperAbs = path.join(ROOT, fileOf(fam.keeper));
    let html = fs.readFileSync(keeperAbs, 'utf8')
      .replace(new RegExp(`${START}[\\s\\S]*?${END}\\n?`), '');
    // Each variant's answer is cached in the ledger, so a re-run after the
    // variant pages are gone rebuilds the same block.
    for (const m of fam.merged) {
      const abs = path.join(ROOT, fileOf(m.route));
      if (!fs.existsSync(abs)) continue;
      const a = answerOf(fs.readFileSync(abs, 'utf8'));
      m.question = a ? a.question : null;
      m.answer = a ? a.answer : null;
    }
    const fresh = fam.merged.filter((m) => m.question && m.answer);
    const block = mergedBlock(html, fresh);
    if (block.count) {
      const anchor = ['<!--link-arch:related-->', '</article>', '</main>'].find((a) => html.includes(a));
      if (!anchor) throw new Error(`${fam.keeper}: no anchor to place merged answers`);
      html = html.replace(anchor, `${block.html}${anchor}`);
      injected += 1; answers += block.count;
    }
    fam.merged_answers = block.count;
    fs.writeFileSync(keeperAbs, html);
    scope.add(fam.keeper);
    for (const m of fam.merged) {
      const abs = path.join(ROOT, fileOf(m.route));
      if (fs.existsSync(abs)) { fs.rmSync(abs); removed += 1; }
      // A route can carry more than one admission row; every one is retired.
      for (const rec of reg.admissions.filter((x) => x.route === m.route && x.status !== 'consolidated')) {
        rec.status = 'consolidated';
        rec.redirect_to = fam.keeper;
        rec.consolidated_at = '2026-10-26';
        rec.consolidated_reason = 'Google chose the homepage as canonical; merged into the indexed family page. See data/seo/duplicate_family_consolidation.json.';
        marked += 1;
      }
    }
  }
  // Legacy 404 rules that landed on a retired variant are re-pointed at its
  // keeper in their own data file, so _redirects never chains 301 -> 301 and
  // validate_redirect_targets.js keeps one source per rule.
  const retiredTo = new Map(ledger.families.flatMap((f) => f.merged.map((m) => [m.route, f.keeper])));
  const legacyRel = 'data/redirects/legacy_404_redirects.json';
  const legacy = readJson(legacyRel, null);
  let repointed = 0;
  if (legacy) {
    for (const r of legacy.rules || []) {
      if (!retiredTo.has(r.to)) continue;
      r.to = retiredTo.get(r.to);
      r.why = 'Legacy flat slug. Its /programmatic/ page was merged on 26 Oct 2026 into the indexed page of its duplicate family (data/seo/duplicate_family_consolidation.json), so it lands there directly.';
      repointed += 1;
    }
    writeJson(legacyRel, legacy);
  }
  writeJson(LEDGER, ledger);
  writeJson(ADMISSIONS, reg);
  writeJson(SCOPE, { schema_version: '1.0', generated_at: new Date().toISOString(), source: 'scripts/consolidate_duplicate_families.js', reason: 'Duplicate-family consolidation: keepers absorb merged answers.', routes: [...scope].sort() });
  console.log(JSON.stringify({ command: 'apply', keepers: ledger.families.length, keepers_with_merged_answers: injected, merged_answers: answers, variant_pages_removed: removed, admissions_marked_consolidated: marked, legacy_rules_repointed: repointed, mutation_scope_routes: scope.size }, null, 2));
}

// Body links written when a page was generated still name the retired
// variant. Each is re-pointed at the keeper, so no internal link costs a crawler
// a 301 hop (validate_no_redirecting_internal_links.js) or names a page that no
// longer exists (validate_internal_links.js). Runs in `npm run build` after the
// link architecture; with --write-scope it also thaws the frozen pages it
// changed, for a deliberate refreeze.
function relink() {
  const { isPublishedPath } = require('./assemble_pages_output.js');
  const rules = require('./lib/consolidated_families.js').redirectRules();
  if (!rules.length) { console.log(JSON.stringify({ command: 'relink', rules: 0, pages_changed: 0 }, null, 2)); return; }
  const to = new Map(rules.map((r) => [r.from, r.to]));
  const SKIP = new Set(['.pages-output', 'node_modules', '.git', '.build', 'logs', 'artifacts', 'data', 'scripts', 'docs', 'reports', 'tests']);
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      if (dir === ROOT && !isPublishedPath(name)) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.html')) files.push(full);
    }
  };
  walk(ROOT);
  const re = /href="(?:https:\/\/(?:www\.)?virtualagency-os\.com)?(\/programmatic\/[a-z0-9-]+)(?:\.html)?\/?(#[^"]*)?"/g;
  const changed = [];
  for (const abs of files) {
    const html = fs.readFileSync(abs, 'utf8');
    const next = html.replace(re, (m, route, frag) => (to.has(route) ? `href="${to.get(route)}${frag || ''}"` : m));
    if (next !== html) { fs.writeFileSync(abs, next); changed.push(path.relative(ROOT, abs)); }
  }
  if (process.argv.includes('--write-scope') && changed.length) {
    const scope = new Set(readJson(SCOPE, { routes: [] }).routes || []);
    for (const rel of changed) scope.add(rel === 'index.html' ? '/' : `/${rel.replace(/\/index\.html$/, '').replace(/\.html$/, '')}`);
    writeJson(SCOPE, { schema_version: '1.0', generated_at: new Date().toISOString(), source: 'scripts/consolidate_duplicate_families.js', reason: 'Duplicate-family consolidation: keepers absorb merged answers; links re-pointed at keepers.', routes: [...scope].sort() });
  }
  console.log(JSON.stringify({ command: 'relink', rules: rules.length, pages_scanned: files.length, pages_changed: changed.length }, null, 2));
}

const cmd = ['apply', 'plan', 'relink'].find((c) => process.argv.includes(`--${c}`));
if (!cmd) { console.error('Usage: --plan | --apply | --relink [--write-scope]'); process.exit(2); }
({ plan, apply, relink })[cmd]();
