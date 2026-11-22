#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * The duplicate consolidation retires a page only on a fresh Google verdict
 * (scripts/consolidate_duplicate_families.js, 22 Nov 2026), and its validator
 * catches the ways that can break. Every case runs the real scripts as child
 * processes against a fixture tree (CONSOLIDATE_ROOT), never the repo's data.
 *
 *   data loss  a duplicate crawled before its content changed is not retired:
 *              it lands in `unresolved` with both dates, its HTML and sitemap
 *              entry survive, and a retirement already made is carried forward.
 *              Replays the 21 live duplicates parked on 22 Nov 2026 (18 of them
 *              the old rule would have retired), with their recorded dates.
 *   bad input  lastCrawlTime missing, empty, not a date or an impossible date:
 *              never retired.
 *   outage     coverage file missing, not JSON or `{}`: named stop
 *              COVERAGE_EMPTY, non-zero exit, ledger byte-identical.
 *   positive   a duplicate crawled after its content changed still retires, so
 *              the gate is not a permanent no-op.
 *   validator  each named stop fires on its fixture, and passes on a clean one.
 */
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOST = 'https://virtualagency-os.com';
const DUP = 'Duplicate, Google chose different canonical than user';
const SCRIPT = path.join(__dirname, 'consolidate_duplicate_families.js');
const VALIDATOR = path.join(__dirname, 'validators', 'validate_duplicate_consolidation.js');
const LEDGER = 'data/seo/duplicate_family_consolidation.json';
const COVERAGE = 'data/search_intelligence/index_coverage.json';

// The 21 live duplicates parked on 22 Nov 2026 (the 18 the old rule would
// have 301'd among them), with the crawl and content dates recorded that day.
const PARKED_22_NOV = [
  ["broadcast-style-virtual-events", "2026-07-23", "2026-11-03"],
  ["event-marketing-strategy-deliverables", "2026-07-23", "2026-11-03"],
  ["event-marketing-strategy-for-enterprise-teams", "2026-07-23", "2026-11-03"],
  ["event-run-of-show-comparison", "2026-09-06", "2026-11-03"],
  ["event-run-of-show-for-marketing-teams", "2026-07-24", "2026-11-03"],
  ["event-run-of-show-template", "2026-09-09", "2026-11-03"],
  ["event-run-of-show-timeline", "2026-07-23", "2026-11-03"],
  ["event-run-of-show-workflow", "2026-07-23", "2026-11-03"],
  ["executive-broadcast-production-common-failure-points", "2026-09-09", "2026-11-03"],
  ["host-virtual-events", "2026-07-26", "2026-11-03"],
  ["online-conference-platforms", "2026-08-02", "2026-11-03"],
  ["virtual-event-production-companies", "2026-07-23", "2026-10-26"],
  ["virtual-event-production-for-biotech", "2026-07-23", "2026-11-03"],
  ["virtual-event-production-for-government", "2026-07-23", "2026-11-03"],
  ["virtual-event-production-producer-roles", "2026-09-09", "2026-11-03"],
  ["virtual-event-production-production-team", "2026-07-23", "2026-11-03"],
  ["virtual-event-production-rfp-questions", "2026-07-23", "2026-11-03"],
  ["virtual-event-production-services", "2026-07-23", "2026-11-03"],
  ["virtual-event-production-technical-rehearsal", "2026-07-23", "2026-11-03"],
  ["virtual-event-services", "2026-07-23", "2026-11-03"],
  ["virtual-event-trends-2026", "2026-07-23", "2026-11-03"],

].map(([slug, crawl, content]) => ({ route: `/programmatic/${slug}`, crawl: `${crawl}T09:00:00Z`, content }));
const KEEPERS = ['/programmatic/event-run-of-show-guide', '/programmatic/virtual-event-production', '/programmatic/event-marketing-strategy', '/programmatic/virtual-event-planning'];

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const page = (route, dateModified) => `<!doctype html><html><head><title>${route}</title>
<script type="application/ld+json">{"@type":"WebPage","dateModified":"${dateModified}"}</script></head>
<body><main><h1>What is ${route.split('/').pop()}?</h1><h2>What this page recommends</h2><p>A distinct answer for ${route}.</p></main></body></html>`;

function fixture({ dups, extraCoverage = {}, ledger, coverage, generatedAt = new Date().toISOString(), alternates = 0, lastmod = {} }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-verdict-'));
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`); };
  const urls = {};
  const entries = {};
  for (const k of KEEPERS) {
    urls[`${HOST}${k}`] = { coverageState: 'Submitted and indexed', lastCrawlTime: '2026-11-15T10:00:00Z', googleCanonical: `${HOST}${k}` };
    entries[`${HOST}${k}`] = { hash: 'k', lastmod: '2026-11-03' };
    w(`${k.slice(1)}.html`, page(k, '2026-11-03'));
  }
  for (const d of dups) {
    const v = { coverageState: DUP, googleCanonical: `${HOST}/` };
    if (d.crawl !== undefined) v.lastCrawlTime = d.crawl;
    urls[`${HOST}${d.route}`] = v;
    if (d.content) entries[`${HOST}${d.route}`] = { hash: 'd', lastmod: d.content };
    w(`${d.route.slice(1)}.html`, page(d.route, d.dateModified || d.content || '2026-11-03'));
  }
  Object.assign(urls, extraCoverage);
  Object.assign(entries, lastmod);
  const priority = {};
  for (let i = 0; i < alternates; i += 1) priority[`${HOST}/old-${i}`] = { coverageState: 'Alternate page with proper canonical tag' };
  if (coverage !== undefined) w(COVERAGE, coverage);
  else w(COVERAGE, { generated_at: generatedAt, urls, priority_urls: priority });
  w('data/cadence/lastmod_ledger.json', { schema: 'lastmod-ledger-v3', entries });
  w('data/content/page_admission_registry.json', { admissions: [] });
  w('data/release/active_mutation_scope.json', { routes: [] });
  w(LEDGER, ledger || {
    families: [{ family: 'event-run-of', basis: 'first three slug words', pause_prefix: 'event-run-of', keeper: KEEPERS[0], keeper_impressions: 3,
      merged: [{ route: '/programmatic/event-run-of-show-retired-long-ago', impressions: 0, question: 'Q?', answer: 'A.' }] }],
    unresolved: [],
  });
  const locs = [...KEEPERS, ...dups.map((d) => d.route)].map((r) => `<url><loc>${HOST}${r}</loc></url>`).join('');
  w('sitemap.xml', `<?xml version="1.0"?><urlset>${locs}</urlset>`);
  return root;
}

const run = (script, root, args = []) => spawnSync(process.execPath, [script, ...args], { env: { ...process.env, CONSOLIDATE_ROOT: root }, encoding: 'utf8' });
const ledgerOf = (root) => JSON.parse(fs.readFileSync(path.join(root, LEDGER), 'utf8'));
const merged = (l) => new Set((l.families || []).flatMap((f) => f.merged.map((m) => m.route)));

// --- data loss: the 21 parked on 22 Nov, all crawled Jul-Sep, rewritten 26 Oct - 3 Nov.
{
  const dups = PARKED_22_NOV;
  ok(dups.length === 21, 'fixture: the 22 Nov list is incomplete');
  const root = fixture({ dups });
  const r = run(SCRIPT, root, ['--plan']);
  ok(r.status === 0, `plan exited ${r.status}: ${r.stderr}`);
  const l = ledgerOf(root);
  const m = merged(l);
  for (const d of dups) {
    ok(!m.has(d.route), `data loss: ${d.route} retired on a stale verdict`);
    const u = l.unresolved.find((x) => x.route === d.route);
    ok(u && u.reason === 'verdict predates the current content', `data loss: ${d.route} not listed unresolved with the stale reason`);
    ok(u.last_crawl === d.crawl.slice(0, 10) && u.content_changed === d.content, `data loss: ${d.route} unresolved without both dates`);
    ok(fs.existsSync(path.join(root, `${d.route.slice(1)}.html`)), `data loss: ${d.route} HTML removed`);
    ok(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').includes(`${HOST}${d.route}<`), `data loss: ${d.route} left the sitemap`);
  }
  ok(m.has('/programmatic/event-run-of-show-retired-long-ago'), 'data loss: a retirement already made was dropped on re-plan (its 301 would vanish)');
  ok(l.consolidated_count === 1, `data loss: consolidated_count ${l.consolidated_count}, expected the 1 carried retirement`);
  // --apply on that ledger removes nothing that is live.
  const a = run(SCRIPT, root, ['--apply']);
  ok(a.status === 0, `apply exited ${a.status}: ${a.stderr}`);
  for (const d of dups) ok(fs.existsSync(path.join(root, `${d.route.slice(1)}.html`)), `data loss: --apply removed ${d.route}`);
  fs.rmSync(root, { recursive: true, force: true });
}

// --- bad input: crawl dates that are not evidence.
{
  const bad = [
    { route: '/programmatic/event-run-of-show-missing' },
    { route: '/programmatic/event-run-of-show-empty', crawl: '' },
    { route: '/programmatic/event-run-of-show-words', crawl: 'yesterday' },
    { route: '/programmatic/event-run-of-show-dayonly', crawl: '2026-11-20' },
    { route: '/programmatic/event-run-of-show-impossible', crawl: '2026-13-45T00:00:00Z' },
    { route: '/programmatic/event-run-of-show-nocontent', crawl: '2026-11-20T00:00:00Z', dateModified: 'unknown' },
  ].map((d) => ({ ...d, content: d.route.endsWith('nocontent') ? null : '2026-11-03' }));
  const root = fixture({ dups: bad });
  const r = run(SCRIPT, root, ['--plan']);
  ok(r.status === 0, `plan exited ${r.status}: ${r.stderr}`);
  const l = ledgerOf(root);
  const m = merged(l);
  for (const d of bad) {
    ok(!m.has(d.route), `bad input: ${d.route} retired on unreadable evidence`);
    ok(l.unresolved.some((x) => x.route === d.route), `bad input: ${d.route} not listed unresolved`);
  }
  fs.rmSync(root, { recursive: true, force: true });
}

// --- outage: no evidence at all.
for (const [name, coverage] of [['missing', null], ['not JSON', '{not json'], ['empty object', {}], ['no urls', { generated_at: '2026-11-21T00:00:00Z', urls: {} }]]) {
  const root = fixture({ dups: [{ route: '/programmatic/event-run-of-show-x', crawl: '2026-11-20T00:00:00Z', content: '2026-11-03' }], coverage: coverage === null ? undefined : coverage });
  if (coverage === null) fs.rmSync(path.join(root, COVERAGE));
  const before = fs.readFileSync(path.join(root, LEDGER), 'utf8');
  const r = run(SCRIPT, root, ['--plan']);
  ok(r.status !== 0, `outage (${name}): plan exited 0`);
  ok(/COVERAGE_EMPTY/.test(r.stderr), `outage (${name}): no named stop in stderr: ${r.stderr}`);
  ok(fs.readFileSync(path.join(root, LEDGER), 'utf8') === before, `outage (${name}): ledger rewritten`);
  ok(fs.existsSync(path.join(root, 'programmatic/event-run-of-show-x.html')), `outage (${name}): page removed`);
  const v = run(VALIDATOR, root);
  ok(v.status !== 0 && /COVERAGE_EMPTY/.test(v.stderr), `outage (${name}): validator did not stop COVERAGE_EMPTY`);
  fs.rmSync(root, { recursive: true, force: true });
}

// --- positive: fresh evidence still retires (the gate can fire).
{
  const dups = [
    { route: '/programmatic/event-run-of-show-fresh', crawl: '2026-11-10T09:00:00Z', content: '2026-11-03' },
    { route: '/programmatic/event-run-of-show-sameday', crawl: '2026-11-03T23:00:00Z', content: '2026-11-03' },
    { route: '/programmatic/event-run-of-show-schemadate', crawl: '2026-11-10T09:00:00Z', dateModified: '2026-11-01' },
  ];
  const root = fixture({ dups });
  const r = run(SCRIPT, root, ['--plan']);
  ok(r.status === 0, `plan exited ${r.status}: ${r.stderr}`);
  const l = ledgerOf(root);
  const m = merged(l);
  for (const d of dups) ok(m.has(d.route), `positive: ${d.route} has a fresh verdict and was not retired (the gate never fires)`);
  ok(m.has('/programmatic/event-run-of-show-retired-long-ago'), 'positive: carried retirement lost');
  fs.rmSync(root, { recursive: true, force: true });
}

// --- validator named stops.
{
  const stale = { route: '/programmatic/event-run-of-show-stale', crawl: '2026-07-23T00:00:00Z', content: '2026-11-03' };
  const fam = (route) => ({ families: [{ family: 'event-run-of', keeper: KEEPERS[0], pause_prefix: 'event-run-of', merged: [{ route }] }], consolidated_count: 1, unresolved: [] });

  let root = fixture({ dups: [stale] });
  let v = run(VALIDATOR, root);
  ok(v.status === 0, `validator: clean fixture failed: ${v.stderr}`);
  const status = JSON.parse(fs.readFileSync(path.join(root, 'data/seo/duplicate_consolidation_status.json'), 'utf8'));
  ok(status.duplicates.duplicate_state === 1 && status.awaiting_recrawl === 1 && status.indexed_share.sitemap_set.inspected === 5, 'validator: status row mis-measured');
  fs.rmSync(root, { recursive: true, force: true });

  root = fixture({ dups: [stale], ledger: fam(stale.route) });
  v = run(VALIDATOR, root);
  ok(v.status !== 0 && /CONSOLIDATION_WOULD_RETIRE_FRESH_PAGE/.test(v.stderr), `validator: a planned 301 of a live page on a stale verdict passed: ${v.stderr}`);
  fs.rmSync(root, { recursive: true, force: true });

  const fresh = { route: '/programmatic/event-run-of-show-fresh', crawl: '2026-11-10T00:00:00Z', content: '2026-11-03' };
  root = fixture({ dups: [fresh], ledger: fam(fresh.route) });
  v = run(VALIDATOR, root);
  ok(v.status === 0, `validator: a planned 301 on a fresh verdict was refused: ${v.stderr}`);
  fs.rmSync(root, { recursive: true, force: true });

  root = fixture({ dups: [stale], generatedAt: new Date(Date.now() - 19 * 86400000).toISOString() });
  v = run(VALIDATOR, root);
  ok(v.status !== 0 && /COVERAGE_STALE/.test(v.stderr), `validator: 19-day-old coverage passed: ${v.stderr}`);
  fs.rmSync(root, { recursive: true, force: true });

  root = fixture({ dups: [stale], alternates: 188 });
  v = run(VALIDATOR, root);
  ok(v.status !== 0 && /DUPLICATES_OVER_CEILING/.test(v.stderr), `validator: 189 duplicates passed: ${v.stderr}`);
  fs.rmSync(root, { recursive: true, force: true });

  root = fixture({ dups: [stale], alternates: 160 });
  v = run(VALIDATOR, root);
  ok(v.status === 0 && /note: 161 duplicates/.test(v.stdout), `validator: 161 duplicates (inside the margin) did not pass with a note: ${v.stdout}${v.stderr}`);
  fs.rmSync(root, { recursive: true, force: true });
}

if (checks < 100) { console.error(`test:consolidation-fresh-verdict FAILED: only ${checks} checks ran (floor 100)`); process.exit(1); }
console.log(`test:consolidation-fresh-verdict OK: ${checks} checks (data loss, bad input, outage, positive, validator stops)`);
