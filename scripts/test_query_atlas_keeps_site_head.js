#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Contract test: the query atlas generator leaves every owned page it writes
 * with the site-head block applied, so a lane that runs it without
 * `npm run build` (query-intelligence.yml) cannot publish pages that fail
 * validate:social-meta.
 *
 * 2 Nov 2026 Search Repair and Retest went red: "social meta FAILED (74)",
 * atlas.html, query-atlas.html and 72 query-atlas/ pages with no site-head
 * block, written by query-intelligence after the release lane that used to
 * rebuild them was retired (#62).
 *
 * Runs the real generator on a scratch copy of its inputs and asserts each
 * owned page it writes has exactly one block and is a fixed point of
 * scripts/apply_site_head.js. Hard-fails when it checks no page.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { transform, START, END } = require('./apply_site_head.js');
const { ROOT, loadConfig, ownedPages } = require('./lib/site_head.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-site-head-'));
const copy = (rel) => { const src = path.join(ROOT, rel); if (fs.existsSync(src)) fs.cpSync(src, path.join(tmp, rel), { recursive: true }); };
for (const rel of ['data/seo', 'data/query_atlas/query_universe.json', 'data/release/frozen_output_registry.json', 'data/release/active_mutation_scope.json', 'query-atlas']) copy(rel);

const failures = [];
let checked = 0;
try {
  execFileSync(process.execPath, [path.join(__dirname, 'citation_intelligence/generate_query_atlas_pages.js')], { env: { ...process.env, QUERY_ATLAS_ROOT: tmp }, stdio: ['ignore', 'ignore', 'inherit'] });
  const universe = JSON.parse(fs.readFileSync(path.join(tmp, 'data/query_atlas/query_universe.json'), 'utf8'));
  const writes = ['atlas.html', 'query-atlas.html', ...new Set((universe.queries || []).map((q) => `query-atlas/${q.cluster}.html`))];
  const cfg = loadConfig(tmp);
  const owned = new Set(ownedPages(tmp, cfg));
  for (const rel of writes.filter((r) => owned.has(r))) {
    const html = fs.readFileSync(path.join(tmp, rel), 'utf8');
    checked++;
    const n = (re) => (html.match(new RegExp(re, 'g')) || []).length;
    if (n(START) !== 1 || n(END) !== 1) { failures.push(`${rel}: site-head block missing or duplicated`); continue; }
    if (transform(rel, html, cfg) !== html) failures.push(`${rel}: not a fixed point of apply_site_head.js`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (!checked) failures.push('zero owned atlas pages checked: the generator wrote nothing this test can see');
if (failures.length) { console.error(`query atlas/site-head contract FAILED (${failures.length}):\n- ` + failures.slice(0, 20).join('\n- ')); process.exit(1); }
console.log(`query atlas/site-head contract OK: ${checked} generated page(s) carry one site-head block and are fixed points of apply_site_head.js.`);
