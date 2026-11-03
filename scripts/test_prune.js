#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * The consolidation of 2 Nov 2026 (data/seo/prune_ledger.json) behaves:
 *   1. every URL Search Console ever showed (page_impressions_lifetime.json)
 *      answers a page or a single 301 to a page - never a 404 (checklist a8,
 *      the 25-26 Aug 2026 cliff guard);
 *   2. no consolidated page is deployed (Pages would serve the file and skip
 *      its 301) and none is in sitemap.xml;
 *   3. every kept page is deployed.
 * Negative proof: --self-test drops one redirect from the routing rules and
 * must see check 1 fail.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const prune = require('./lib/prune.js');
const { ROOT, parseRedirects, resolvePath } = require('./lib/pages_routing.js');
const { isPublishedPath } = require('./assemble_pages_output.js');

const HOST = 'https://virtualagency-os.com';
const selfTest = process.argv.includes('--self-test');
let rules = parseRedirects(ROOT);
const ledger = prune.load().ledger;
const measured = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data/search_intelligence/page_impressions_lifetime.json'), 'utf8')).pages || [])
  .map((p) => new URL(p.page).pathname);
if (selfTest) {
  const m = new Set(measured);
  const drop = ledger.redirects.find((r) => m.has(r.from));
  rules = rules.filter((r) => r.from !== drop.from);
}

const errors = [];
if (measured.length < 100) errors.push(`only ${measured.length} measured URLs to check (floor 100)`);
const deployed = (rel) => isPublishedPath(rel) && fs.existsSync(path.join(ROOT, rel));
// A measured /x.html must be answered literally: Pages strips .html only for a
// deployed file, so a rule for /x does not cover a missing /x.html.
if (!selfTest) {
  const literal = new Set(parseRedirects(ROOT, { withMap: false }).map((r) => r.from));
  for (const p of new Set(measured)) {
    if (!p.endsWith('.html')) continue;
    if (!literal.has(p) && !deployed(p.replace(/^\//, ''))) errors.push(`${p} has no literal _redirects rule and no deployed file (Pages answers 404)`);
  }
}
for (const p of new Set(measured)) {
  const r = resolvePath(p, { root: ROOT, rules });
  if (r.kind === 'redirect' && r.status !== 301) errors.push(`${p} answers ${r.status}, expected 301`);
  if (r.kind === 'redirect') {
    const t = resolvePath(r.to.split('?')[0], { root: ROOT, rules });
    if (t.kind !== 'page') errors.push(`${p} -> ${r.to} does not land on a page`);
  } else if (r.kind !== 'page') errors.push(`${p} answers ${r.kind}`);
}
if (selfTest) {
  if (!errors.length) { console.error('test:prune self-test FAILED: a dropped redirect went unnoticed'); process.exit(1); }
  console.log(`test:prune self-test OK: a dropped redirect is caught (${errors[0]})`);
  process.exit(0);
}
const assert = require('assert/strict');
for (const route of ['/answers/ai-marketing-agency', '/programmatic/ai-consultant-vs-automation-agency', '/query-atlas/new-ai-marketing-tool', '/answers/new-agency-platform']) {
  assert.equal(isPublishedPath(route.slice(1) + '.html'), false, `off-topic deploy admission: ${route}`);
  assert.equal(prune.isPruned(route), true, `off-topic generator admission: ${route}`);
}
for (const k of ledger.kept) assert.equal(prune.isOnTopic(k.route), true, `off-topic keeper: ${k.route}`);
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const r of ledger.redirects) {
  const rel = `${r.from.replace(/^\//, '')}.html`;
  if (llms.includes(`${HOST}${r.from}\n`) || llms.includes(`${HOST}${r.from}.html`)) errors.push(`${r.from} is consolidated but in llms.txt`);
  if (deployed(rel)) errors.push(`${r.from} is consolidated but still deployed`);
  if (sitemap.includes(`<loc>${HOST}${r.from}</loc>`)) errors.push(`${r.from} is consolidated but in sitemap.xml`);
}
// Static rules stay within the Pages budget; the actual middleware covers the full map.
const compressed = parseRedirects(ROOT, { withMap: false });
// Pages counts every rule after the first dynamic one (a splat or placeholder)
// as dynamic and drops all past 100 (deploy log, 2 Nov 2026); 404 is not a
// valid status. So: no splat, no placeholder, no 404, at most 2,000 rules.
if (compressed.some((r) => /\*|:/.test(r.from))) errors.push('_redirects holds a dynamic rule; Pages would count every later rule as dynamic');
if (compressed.some((r) => r.status === 404)) errors.push('_redirects holds a 404 line; Pages rejects it');
if (compressed.length > 2000) errors.push(`_redirects has ${compressed.length} rules; Pages allows 2,000 static`);
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/redirects/consolidation_map.json'), 'utf8'));
const vm = require('vm');
const source = fs.readFileSync(path.join(ROOT, 'functions/_middleware.js'), 'utf8')
  .replace(/^import redirects[^;]+;/m, '')
  .replace('export function onRequest', 'function onRequest');
function mapProblems(redirects) {
  const handler = vm.runInNewContext(source + '\nonRequest', { redirects, URL, Response });
  const problems = [];
  if (!Object.keys(redirects).length) problems.push('empty redirect map');
  for (const { from } of ledger.redirects) {
    if (!redirects[from]) problems.push(`retired ${from} has no map entry`);
  }
  for (const [from, to] of Object.entries(redirects)) {
    const target = resolvePath(to.split('?')[0], { root: ROOT, rules: compressed });
    if (redirects[prune.norm(to)] || target.kind !== 'page' || prune.isPruned(to)) problems.push(`${from} -> ${to} is not a kept 200 target`);
    for (const alias of [from, from + '/', from + '.html', from + '.html/']) {
      for (const method of ['GET', 'HEAD']) {
        const response = handler({ request: new Request(HOST + alias + '?source=test', { method }), next: () => null });
        const expected = new URL(to, HOST);
        if (!expected.search) expected.search = '?source=test';
        if (!response || response.status !== 301 || response.headers.get('Location') !== expected.href) problems.push(`${method} ${alias} did not answer one 301 to ${expected.href}`);
      }
    }
  }
  return problems;
}
errors.push(...mapProblems(map));
// Prove this same behaviour check catches missing coverage, chains and loops.
const [first, second] = ledger.redirects.slice(0, 2).map((r) => r.from);
for (const broken of [Object.fromEntries(Object.entries(map).filter(([f]) => f !== first)), { ...map, [first]: second }, { ...map, [first]: first }]) {
  assert.ok(mapProblems(broken).length, 'negative proof: corrupt redirect map went unnoticed');
}
for (const k of ledger.kept) {
  const r = resolvePath(k.route, { root: ROOT, rules: compressed });
  if (r.kind !== 'page') errors.push(`kept ${k.route} is answered by ${r.kind} ${r.to || ''}`);
}
for (const k of ledger.kept) if (!deployed(`${k.route.replace(/^\//, '')}.html`)) errors.push(`kept ${k.route} is not deployed`);
if (ledger.kept.length < 50 || ledger.redirects.length < 100) errors.push(`ledger looks empty: ${ledger.kept.length} kept, ${ledger.redirects.length} redirects`);
if (errors.length) { console.error(`test:prune FAILED (${errors.length}):\n  ${errors.slice(0, 15).join('\n  ')}`); process.exit(1); }
console.log(`test:prune OK: ${new Set(measured).size} measured URLs answer a page or one 301; ${ledger.redirects.length} consolidated pages out of the deploy and sitemap; ${ledger.kept.length} kept pages deployed`);
