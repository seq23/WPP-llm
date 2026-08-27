#!/usr/bin/env node
/**
 * Fails the build on the three ways a page fan-out goes wrong:
 *
 *   1. a page in the sitemap that nothing will render (a crawler is told to
 *      fetch a URL that 404s);
 *   2. a page on disk that the sitemap does not know about (built and then
 *      hidden, which is the same waste pointed the other way);
 *   3. a page created after this gate went in that has no demand record.
 *
 * Check 3 is deliberately scoped to new pages. 3,052 programmatic pages already
 * exist and predate any demand gate; failing the build on all of them would
 * make this validator something you switch off rather than something that
 * holds. They are reported as a retirement candidate list instead, and the
 * decision to retire is the owner's. What cannot happen from here is the count
 * growing.
 *
 * The parity check imports nothing of its own: it reads the sitemap the build
 * actually shipped and the files that are actually on disk. There is no second
 * definition of "renderable" for it to drift away from.
 */
const fs = require('fs');
const path = require('path');
const demandGate = require('../lib/demand_gate.js');

const ROOT = path.resolve(__dirname, '..', '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const BASELINE = path.join(ROOT, 'data/demand/pre_gate_page_baseline.json');

const errors = [];
const notes = [];

function routesInSitemap() {
  if (!fs.existsSync(SITEMAP)) { errors.push('sitemap.xml is missing'); return []; }
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    try { return new URL(m[1]).pathname; } catch { return m[1]; }
  });
}

function fileForRoute(route) {
  const rel = String(route).replace(/^\//, '').replace(/\/$/, '');
  if (!rel) return 'index.html';
  for (const candidate of [rel, `${rel}.html`, path.join(rel, 'index.html')]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

// --- 1. every sitemap URL renders -------------------------------------------
const routes = routesInSitemap();
const unrenderable = routes.filter((r) => !fileForRoute(r));
if (unrenderable.length) {
  errors.push(
    `${unrenderable.length} sitemap URL(s) have no file to render, e.g. ` +
    unrenderable.slice(0, 5).join(', ')
  );
}

// --- 2. every programmatic page on disk is in the sitemap -------------------
const sitemapSet = new Set(routes.map((r) => r.replace(/\/$/, '')));
const programmaticDir = path.join(ROOT, 'programmatic');
let onDisk = [];
if (fs.existsSync(programmaticDir)) {
  onDisk = fs.readdirSync(programmaticDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => `/programmatic/${f.replace(/\.html$/, '')}`);
}
const orphaned = onDisk.filter((r) => !sitemapSet.has(r));
if (orphaned.length) {
  errors.push(
    `${orphaned.length} programmatic page(s) exist on disk but are in no sitemap, e.g. ` +
    orphaned.slice(0, 5).join(', ')
  );
}

// --- 3. no page created after the gate lacks a demand record ----------------
// The baseline records which routes existed when the gate was installed. It is
// written once, by --seed-baseline, and read forever after. A route absent from
// it is new, and new means gated.
if (!fs.existsSync(BASELINE)) {
  notes.push(`no pre-gate baseline at ${path.relative(ROOT, BASELINE)}; run this validator once with --seed-baseline to establish it`);
} else {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const known = new Set(baseline.routes || []);
  const registry = (() => {
    const p = path.join(ROOT, 'data/content/page_admission_registry.json');
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8')).admissions || [];
  })();
  const queryForRoute = new Map(registry.map((a) => [String(a.route).replace(/\/$/, ''), a.query]));

  const ungated = [];
  for (const route of onDisk) {
    if (known.has(route)) continue;
    const query = queryForRoute.get(route);
    if (!query || !demandGate.hasDemand(query)) {
      ungated.push(`${route}${query ? ` (query: "${query}")` : ' (no registry entry)'}`);
    }
  }
  if (ungated.length) {
    errors.push(
      `${ungated.length} page(s) created after the demand gate have no demand record:\n  ` +
      ungated.slice(0, 20).join('\n  ')
    );
  }

  // Reporting, not a failure: how much of the pre-gate corpus is demand-backed.
  const backed = [...known].filter((r) => {
    const q = queryForRoute.get(r);
    return q && demandGate.hasDemand(q);
  });
  notes.push(
    `pre-gate corpus: ${backed.length}/${known.size} routes are demand-backed ` +
    `(${((backed.length / Math.max(1, known.size)) * 100).toFixed(1)}%). ` +
    `The remainder are retirement candidates, not build failures.`
  );
}

if (process.argv.includes('--seed-baseline')) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({
    note: 'Routes that existed when the demand gate was installed. Pages here predate the gate and are exempt from it; anything not here must carry a demand record. Do not add routes to this file to get past the gate.',
    sealed_at: new Date().toISOString().slice(0, 10),
    route_count: onDisk.length,
    routes: onDisk.sort(),
  }, null, 2) + '\n');
  console.log(`Sealed pre-gate baseline: ${onDisk.length} routes.`);
  process.exit(0);
}

for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  console.error('validate:demand-backed-pages FAILED');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`validate:demand-backed-pages OK (${routes.length} sitemap URLs, ${onDisk.length} programmatic pages, ${demandGate.allRecords().length} demand records)`);
