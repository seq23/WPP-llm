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
  .map((p) => p.page.replace(HOST, '').replace(/\/+$/, '') || '/');
if (selfTest) {
  const m = new Set(measured);
  const drop = ledger.redirects.find((r) => m.has(r.from));
  rules = rules.filter((r) => r.from !== drop.from);
}

const errors = [];
if (measured.length < 100) errors.push(`only ${measured.length} measured URLs to check (floor 100)`);
const deployed = (rel) => isPublishedPath(rel) && fs.existsSync(path.join(ROOT, rel));
for (const p of new Set(measured)) {
  let r = resolvePath(p, { root: ROOT, rules });
  if (r.kind === 'redirect' && r.status === 308) r = resolvePath(r.to.replace(/\/+$/, '') || '/', { root: ROOT, rules });
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
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const r of ledger.redirects) {
  const rel = `${r.from.replace(/^\//, '')}.html`;
  if (deployed(rel)) errors.push(`${r.from} is consolidated but still deployed`);
  if (sitemap.includes(`<loc>${HOST}${r.from}</loc>`)) errors.push(`${r.from} is consolidated but in sitemap.xml`);
}
for (const k of ledger.kept) if (!deployed(`${k.route.replace(/^\//, '')}.html`)) errors.push(`kept ${k.route} is not deployed`);
if (ledger.kept.length < 50 || ledger.redirects.length < 100) errors.push(`ledger looks empty: ${ledger.kept.length} kept, ${ledger.redirects.length} redirects`);
if (errors.length) { console.error(`test:prune FAILED (${errors.length}):\n  ${errors.slice(0, 15).join('\n  ')}`); process.exit(1); }
console.log(`test:prune OK: ${new Set(measured).size} measured URLs answer a page or one 301; ${ledger.redirects.length} consolidated pages out of the deploy and sitemap; ${ledger.kept.length} kept pages deployed`);
