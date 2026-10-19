#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: a URL Search Console measured that this build answers with a 404.
 *
 *   - every rule in data/redirects/measured_404_redirects.json is in _redirects
 *     exactly, as a 301, and lands on a published page in one hop;
 *   - every page in the 90-day query x page file (data/signals/gsc_query_signals.json),
 *     the rolling 28-day file and the dead-URL list in
 *     data/seo/consolidation_candidates.json resolves to a page, or to a 301 whose
 *     target is a page; never to nothing;
 *   - every URL Google chose as canonical (data/search_intelligence/index_coverage.json)
 *     resolves to a page or a 301 to one;
 *   - no redirect source is listed in sitemap.xml;
 *   - no /x and /programmatic/x pair is listed in sitemap.xml unless one is the
 *     other's canonical.
 *
 * Why: on 11 Oct 2026, 149 measured URLs (5,366 of ~7,474 90-day impressions,
 * including the investor-relations page Google still showed) returned 404 while
 * the same page lived under /programmatic/.
 *
 * Resolution is modelled from the build output by scripts/lib/pages_routing.js.
 * The live counterpart is scripts/live_check_measured_redirects.js.
 *
 * RULE 0: zero rules or zero measured pages is a failure, not a pass.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, parseRedirects, resolvePath } = require('../lib/pages_routing.js');

const readJson = (p, d) => { const f = path.join(ROOT, p); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; };
const pathOf = (u) => { try { return new URL(u, 'https://virtualagency-os.com').pathname; } catch { return null; } };

const rules = parseRedirects(ROOT);
const measured = readJson('data/redirects/measured_404_redirects.json', { rules: [] }).rules || [];
const problems = [];
if (!rules.length) { console.error('MEASURED URL VALIDATION: _redirects has no rules.'); process.exit(1); }
if (!measured.length) { console.error('MEASURED URL VALIDATION: data/redirects/measured_404_redirects.json has no rules.'); process.exit(1); }

const byFrom = new Map(rules.map((r) => [r.from, r]));
for (const m of measured) {
  const r = byFrom.get(m.from);
  if (!r) { problems.push(`${m.from} -> ${m.to} is in measured_404_redirects.json but not in _redirects`); continue; }
  if (r.to !== m.to || r.status !== 301) problems.push(`${m.from}: _redirects says ${r.to} ${r.status}, data says ${m.to} 301`);
  const t = resolvePath(m.to, { root: ROOT, rules });
  if (t.kind !== 'page') problems.push(`${m.from} -> ${m.to}: target is ${t.kind}${t.to ? ` to ${t.to}` : ''}, not a page`);
}

const pages = new Set();
for (const r of readJson('data/signals/gsc_query_signals.json', { records: [] }).records || []) if (r.signal_type === 'gsc_query_performance') pages.add(pathOf(r.target_route));
for (const r of readJson('data/search_intelligence/search_analytics_28d.json', { rows: [] }).rows || []) pages.add(pathOf(r.page));
for (const d of readJson('data/seo/consolidation_candidates.json', {}).dead_urls_with_live_twin || []) pages.add(pathOf(d.dead_url));
// A URL Google chose as canonical for one of our pages must land on a page too,
// or the duplicate cluster has nowhere to consolidate (16 Oct 2026: 46 such
// root-level slugs answered 404 while their /programmatic/ twin self-canonicalised).
let googleCanonicals = 0;
for (const v of Object.values(readJson('data/search_intelligence/index_coverage.json', { urls: {} }).urls || {})) {
  if (v && v.googleCanonical) { pages.add(pathOf(v.googleCanonical)); googleCanonicals += 1; }
}
if (!googleCanonicals) { console.error('MEASURED URL VALIDATION: index_coverage.json carries zero Google-chosen canonicals; refusing to pass over nothing.'); process.exit(1); }
pages.delete(null);
if (!pages.size) { console.error('MEASURED URL VALIDATION: zero measured pages found; refusing to pass over nothing.'); process.exit(1); }

let redirected = 0;
for (const p of pages) {
  const r = resolvePath(p, { root: ROOT, rules });
  if (r.kind === 'page') continue;
  if (r.kind === 'missing') { problems.push(`${p} was measured by Search Console and this build answers it with a 404`); continue; }
  const t = resolvePath(r.to.split(/[?#]/)[0], { root: ROOT, rules });
  if (t.kind !== 'page') problems.push(`${p} -> ${r.to} (${r.status}) does not land on a page (${t.kind})`);
  else redirected += 1;
}

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => pathOf(m[1])));
for (const r of rules) if ([301, 302, 307, 308].includes(r.status) && listed.has(r.from)) problems.push(`${r.from} redirects but is listed in sitemap.xml`);

// Slug twins: /x and /programmatic/x both in the sitemap is one page competing
// with itself unless one names the other as canonical. Google folded such twins
// on 16 Oct 2026 (URL Inspection: "Duplicate, Google chose different canonical").
const canonicalOf = (route) => {
  const rel = route === '/' ? 'index.html' : `${route.replace(/^\//, '').replace(/\/$/, '')}.html`;
  const alt = `${route.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
  const f = [rel, alt].map((x) => path.join(ROOT, x)).find((x) => fs.existsSync(x));
  if (!f) return null;
  const m = fs.readFileSync(f, 'utf8').match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  return m ? pathOf(m[1]) : null;
};
let twinPairs = 0;
for (const p of listed) {
  if (!p || !p.startsWith('/programmatic/')) continue;
  const root = p.slice('/programmatic'.length);
  if (!listed.has(root)) continue;
  twinPairs += 1;
  if (canonicalOf(p) !== root && canonicalOf(root) !== p) problems.push(`${p} and ${root} are both in sitemap.xml with no 301 or canonical between them`);
}

// Every workflow that collects fresh Search Console measurements must rebuild
// the measured-404 redirects from them before anything validates. 17-18 Oct
// 2026: search-repair-retest.yml refreshed index_coverage.json, four newly
// inspected root-level Google canonicals had no 301 yet, and the lane went red.
const wfDir = path.join(ROOT, '.github', 'workflows');
let collectors = 0;
for (const f of fs.readdirSync(wfDir).filter((x) => /\.ya?ml$/.test(x))) {
  const lines = fs.readFileSync(path.join(wfDir, f), 'utf8').split('\n');
  const at = (re) => lines.findIndex((l) => !/^\s*#/.test(l) && re.test(l));
  const collect = at(/npm run search:intelligence\b/);
  if (collect < 0) continue;
  collectors += 1;
  const refresh = lines.findIndex((l, i) => i > collect && !/^\s*#/.test(l) && /npm run redirects:measured:refresh\b/.test(l));
  if (refresh < 0) { problems.push(`${f} collects Search Console data but never runs redirects:measured:refresh after it`); continue; }
  const firstCheck = lines.findIndex((l, i) => i > collect && !/^\s*#/.test(l) && /npm run (repairs:apply|validate:|release:push-gate|build)\b/.test(l));
  if (firstCheck >= 0 && firstCheck < refresh) problems.push(`${f} validates (line ${firstCheck + 1}) before redirects:measured:refresh (line ${refresh + 1})`);
}
if (!collectors) { console.error('MEASURED URL VALIDATION: no workflow runs npm run search:intelligence; refusing to pass over nothing.'); process.exit(1); }

if (problems.length) {
  console.error(`Measured URL violations (${problems.length}):`);
  for (const p of problems.slice(0, 40)) console.error(`- ${p}`);
  process.exit(1);
}
console.log(`Measured URLs OK: ${measured.length} measured-404 rules land on a page in one hop; ${pages.size} measured pages (incl. ${googleCanonicals} Google-chosen canonicals) resolve (${redirected} via 301, none 404); no redirect source in sitemap.xml; ${twinPairs} slug-twin pair(s) in sitemap, each joined by a canonical; ${collectors} Search Console collector workflow(s) rebuild measured redirects before validating.`);
