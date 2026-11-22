#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * The duplicate-consolidation check-in, measured by code instead of prose.
 *
 * Reads data/search_intelligence/index_coverage.json (URL Inspection: the
 * sitemap set under `urls`, the redirected/legacy set under `priority_urls`)
 * and writes the measured row to data/seo/duplicate_consolidation_status.json:
 * duplicates by state, indexed share against its 70% floor, and how many
 * duplicate verdicts are waiting on a re-crawl of the current content.
 *
 * Named stops (each exits 1):
 *   COVERAGE_EMPTY       zero inspected URLs, or the file is missing/unreadable.
 *   COVERAGE_STALE       coverage generated more than 18 days ago (14-day target
 *                        plus the 25% margin): the query-intelligence job stopped.
 *   DUPLICATES_OVER_CEILING  duplicates in all duplicate states (Google chose a
 *                        different canonical + alternate page with proper
 *                        canonical) above 188 (150 ceiling plus 25%). Between 150
 *                        and 188 it passes with a logged note.
 *   CONSOLIDATION_WOULD_RETIRE_FRESH_PAGE  the consolidation ledger lists as
 *                        merged a route whose page is still on disk and in the
 *                        sitemap but whose duplicate verdict is not fresh
 *                        (crawled before its content last changed, or undated):
 *                        --apply would 301 a live page on stale evidence.
 *
 * Indexed share is recorded and reported, never hard-failed: indexing is
 * Google's decision over weeks, and a red gate on it would reward shrinking the
 * sitemap instead of improving pages.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { HOST, COVERAGE, STATUS, DUP_STATE, loadCoverage, verdictFreshness } = require('../consolidate_duplicate_families.js');

const ROOT = process.env.CONSOLIDATE_ROOT ? path.resolve(process.env.CONSOLIDATE_ROOT) : path.resolve(__dirname, '../..');
const LEDGER = 'data/seo/duplicate_family_consolidation.json';
const ALT_STATE = 'Alternate page with proper canonical tag';
const INDEXED = 'Submitted and indexed';
const CEILING = 150;
const HARD_CEILING = Math.round(CEILING * 1.25); // 188
const FLOOR = 0.7;
const STALE_DAYS = 18; // 14-day target + 25%

const stops = [];
const notes = [];
const stop = (tag, why) => stops.push(`${tag}: ${why}`);
const readJson = (rel, fallback) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf8')) : fallback;
};
const routeOf = (url) => url.replace(HOST, '').replace(/\/+$/, '') || '/';
const share = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : 0);

let doc;
try { doc = loadCoverage(ROOT); } catch (e) {
  if (!e.stop) throw e;
  console.error(`validate:duplicate-consolidation FAIL\n- ${e.message}`);
  process.exit(1);
}

const sitemapSet = doc.urls;
const all = { ...(doc.priority_urls || {}), ...sitemapSet };
const count = (set, state) => Object.values(set).filter((v) => v && v.coverageState === state).length;

const generated = Date.parse(doc.generated_at || '');
const ageDays = Number.isNaN(generated) ? null : Math.floor((Date.now() - generated) / 86400000);
if (ageDays === null) stop('COVERAGE_STALE', `${COVERAGE} has no readable generated_at`);
else if (ageDays > STALE_DAYS) stop('COVERAGE_STALE', `${COVERAGE} is ${ageDays} days old (target 14, hard limit ${STALE_DAYS})`);

const dupState = count(all, DUP_STATE);
const altState = count(all, ALT_STATE);
const allStates = dupState + altState;
if (allStates > HARD_CEILING) stop('DUPLICATES_OVER_CEILING', `${allStates} duplicates in all duplicate states (ceiling ${CEILING}, hard limit ${HARD_CEILING})`);
else if (allStates > CEILING) notes.push(`${allStates} duplicates is over the ${CEILING} ceiling but inside the ${HARD_CEILING} margin`);

// Duplicate verdicts Google formed on content that has since changed.
const lastmod = readJson('data/cadence/lastmod_ledger.json', { entries: {} });
let awaitingRecrawl = 0;
for (const [u, v] of Object.entries(all)) {
  if (!v || v.coverageState !== DUP_STATE) continue;
  if (!verdictFreshness(routeOf(u), v, { root: ROOT, lastmod }).fresh) awaitingRecrawl += 1;
}

// The ledger may never plan to retire a live page on a stale verdict.
const sitemapXml = fs.existsSync(path.join(ROOT, 'sitemap.xml')) ? fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8') : '';
const inSitemap = new Set((sitemapXml.match(/<loc>([^<]+)<\/loc>/g) || []).map((l) => routeOf(l.slice(5, -6).trim())));
const ledger = readJson(LEDGER, { families: [] });
for (const f of ledger.families || []) {
  for (const m of f.merged || []) {
    const onDisk = fs.existsSync(path.join(ROOT, `${m.route.replace(/^\//, '')}.html`));
    if (!onDisk || !inSitemap.has(m.route)) continue;
    const age = verdictFreshness(m.route, all[`${HOST}${m.route}`] || all[`${HOST}${m.route}/`], { root: ROOT, lastmod });
    if (!age.fresh) stop('CONSOLIDATION_WOULD_RETIRE_FRESH_PAGE', `${m.route} is planned to 301 into ${f.keeper} but is live and its verdict is not fresh (${age.reason}; crawled ${age.last_crawl || 'never'}, content ${age.content_changed || 'undated'})`);
  }
}

const sitemapIndexed = count(sitemapSet, INDEXED);
const allIndexed = count(all, INDEXED);
const row = {
  schema_version: '1.0',
  measured_from: COVERAGE,
  coverage_generated_at: doc.generated_at || null,
  duplicates: {
    duplicate_state: dupState,
    alternate_canonical_state: altState,
    all_states: allStates,
    ceiling: CEILING,
    hard_fail_above: HARD_CEILING,
    met: allStates < CEILING,
  },
  indexed_share: {
    sitemap_set: { indexed: sitemapIndexed, inspected: Object.keys(sitemapSet).length, share: share(sitemapIndexed, Object.keys(sitemapSet).length) },
    all_inspected: { indexed: allIndexed, inspected: Object.keys(all).length, share: share(allIndexed, Object.keys(all).length) },
    floor: FLOOR,
    met: share(sitemapIndexed, Object.keys(sitemapSet).length) >= FLOOR,
    enforced: false,
    why_not_enforced: 'Indexing is Google\'s decision over weeks; a red gate here would reward shrinking the sitemap.',
  },
  awaiting_recrawl: awaitingRecrawl,
  consolidation: { retired: ledger.consolidated_count || 0, unresolved: (ledger.unresolved || []).length },
};

if (stops.length) {
  console.error(`validate:duplicate-consolidation FAIL\n${stops.map((s) => `- ${s}`).join('\n')}`);
  process.exit(1);
}
// Deterministic (dated by the coverage, not the clock): rewritten only when a
// measured number changes.
const out = `${JSON.stringify(row, null, 2)}\n`;
const statusAbs = path.join(ROOT, STATUS);
if (!fs.existsSync(statusAbs) || fs.readFileSync(statusAbs, 'utf8') !== out) fs.writeFileSync(statusAbs, out);
for (const n of notes) console.log(`note: ${n}`);
console.log(`validate:duplicate-consolidation OK: duplicates ${allStates} all states (${dupState} duplicate, ${altState} alternate; ceiling ${CEILING}); indexed ${sitemapIndexed}/${row.indexed_share.sitemap_set.inspected} sitemap URLs = ${(row.indexed_share.sitemap_set.share * 100).toFixed(1)}% (floor 70%, reported); ${awaitingRecrawl} duplicate verdicts await a re-crawl; coverage ${ageDays} days old.`);
