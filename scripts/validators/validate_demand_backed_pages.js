#!/usr/bin/env node
/**
 * Fails the build on the ways a page fan-out goes wrong:
 *
 *   1. a page in the sitemap that nothing will render (a crawler is told to
 *      fetch a URL that 404s);
 *   2. a page on disk that the sitemap does not know about and that nothing
 *      sanctions hiding (built and then hidden, which is the same waste
 *      pointed the other way);
 *   2a. a page hidden with noindex that the noindex policy does not sanction;
 *   2b. a page the noindex policy withholds that nonetheless ships indexable
 *      (a regenerated page silently returning to the index);
 *   3. a page created after this gate went in that has no demand record.
 *
 * 2a and 2b are the halves of check 2 that could not be expressed before there
 * was a policy to check against. Deliberately withholding a page from the index
 * on measured evidence and accidentally orphaning one look identical in a
 * sitemap diff; they are told apart by scripts/lib/noindex_policy.js, which has
 * to agree in both directions or the build fails.
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
const noindexPolicy = require('../lib/noindex_policy.js');

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
// ...unless it is deliberately noindex, in which case listing it WOULD be the
// error (validate_sitemap_coverage.js fails on a noindex page that appears in
// the sitemap, and Search Console reports it against the whole file).
//
// The exemption is not a hole. "Absent from the sitemap" is excused only when
// the page is noindex on disk AND scripts/lib/noindex_policy.js independently
// says it should be, and the two checks below make that agreement mandatory in
// both directions. An accidentally hidden page - the waste this check was
// written to catch - still fails, because nothing sanctions it. What the check
// could not previously distinguish was hidden-by-accident from
// withheld-on-measured-evidence; now it can, and it additionally catches a
// sanctioned page that quietly comes back indexed, which it never caught before.
const sitemapSet = new Set(routes.map((r) => r.replace(/\/$/, '')));
const programmaticDir = path.join(ROOT, 'programmatic');
let onDisk = [];
if (fs.existsSync(programmaticDir)) {
  onDisk = fs.readdirSync(programmaticDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => `/programmatic/${f.replace(/\.html$/, '')}`);
}

const ROBOTS_RE = /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i;
const robotsOf = (route) => {
  const file = path.join(ROOT, `${route.replace(/^\//, '')}.html`);
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(ROBOTS_RE);
  return m ? m[1] : null;
};
const noindexOnDisk = (route) => /noindex/i.test(robotsOf(route) || '');

const orphaned = onDisk.filter((r) => !sitemapSet.has(r) && !noindexOnDisk(r));
if (orphaned.length) {
  errors.push(
    `${orphaned.length} programmatic page(s) exist on disk, are in no sitemap, and are not sanctioned noindex, e.g. ` +
    orphaned.slice(0, 5).join(', ')
  );
}

// 2a. Anything noindex on disk must be sanctioned by the policy. This is the
//     original "built and then hidden" rule, now enforceable rather than
//     approximated: a page hidden for no recorded reason fails here.
const unsanctionedNoindex = onDisk.filter((r) => noindexOnDisk(r) && !noindexPolicy.isNoindex(r));
if (unsanctionedNoindex.length) {
  errors.push(
    `${unsanctionedNoindex.length} programmatic page(s) are noindex on disk but nothing sanctions hiding them ` +
    `(they are not in the audience-permutation class, or they carry demand or impressions), e.g. ` +
    unsanctionedNoindex.slice(0, 5).join(', ')
  );
}

// 2b. ...and the reverse: anything the policy withholds must actually be
//     withheld. Catches a regenerated page silently returning to the index.
const shouldBeNoindex = onDisk.filter((r) => noindexPolicy.isNoindex(r) && !noindexOnDisk(r));
if (shouldBeNoindex.length) {
  errors.push(
    `${shouldBeNoindex.length} programmatic page(s) have neither demand nor impressions and are in the ` +
    `audience-permutation class, but ship indexable. Run node scripts/apply_noindex_policy.js. e.g. ` +
    shouldBeNoindex.slice(0, 5).join(', ')
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

  // Reporting, not a failure: how much of the pre-gate corpus carries evidence.
  //
  // This note used to read "39/3102 routes are demand-backed (1.3%). The
  // remainder are retirement candidates." Both sentences were wrong, and the
  // second one was dangerous.
  //
  // The 1.3% was a JOIN ARTIFACT. It matched a page's registered query STRING
  // against the atlas, but the Search Console evidence in
  // data/signals/gsc_query_signals.json is keyed by `target_route` - and those
  // routes arrive in two shapes ("/programmatic/<slug>" and a root-level
  // "/<slug>"), so a string join finds almost nothing. Joined on route, 352 of
  // 3,102 routes carry impressions (11.3%), and 363 (11.7%) carry demand or
  // impressions. That is nine times more surviving evidence than the old line
  // claimed, over an order of magnitude away from "1.3%".
  //
  // Calling the remainder "retirement candidates" is what turned that error
  // into a hazard: data/demand/recommended_retirement_list.json was generated
  // from it and names 3,013 routes, 324 of which have live impressions. It must
  // not be executed. Nothing in this repo retires a page on this number.
  const backed = [...known].filter((r) => {
    const q = queryForRoute.get(r);
    return q && demandGate.hasDemand(q);
  });
  const withEvidence = [...known].filter((r) => noindexPolicy.isProtected(r));
  const pct = (n) => ((n / Math.max(1, known.size)) * 100).toFixed(1);
  notes.push(
    `pre-gate corpus: ${withEvidence.length}/${known.size} routes (${pct(withEvidence.length)}%) carry ` +
    `measured demand or Search Console impressions, joined on route. ` +
    `Query-string demand records alone match ${backed.length} (${pct(backed.length)}%) - that narrower ` +
    `number is a join artifact, not a measurement of the corpus. No route is retired on either figure.`
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
