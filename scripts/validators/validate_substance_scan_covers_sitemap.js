#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Every sitemapped route in a declared governed section (data/content/
 * governed_page_sections.json) must have a substance row from the quality
 * scan, and every thin row must name a repair owner. Before 2 Nov 2026 the
 * substance gate was a flat `readdirSync('programmatic/')`: 74 of 160
 * still-thin sitemap pages lived in /answers/, /insights/, /learn/ and
 * /case-studies/ and had no row anywhere, so they were invisible to the thin
 * gate and to the repair queue, not merely unrepaired.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, readJson, cleanRoute, analyzeCorpus } = require('../citation_intelligence/content_quality.js');

const sections = readJson('data/content/governed_page_sections.json', { sections: [] }).sections || [];
if (!sections.length) {
  console.error('validate-substance-scan-covers-sitemap: data/content/governed_page_sections.json declares zero sections; the substance gate would scan nothing.');
  process.exit(1);
}
const prefixes = sections.map((s) => s.prefix);

// A section silently dropped from this file does not show up as a "missing
// row" below - the sitemap-matching loop only ever checks routes that fall
// under a prefix THIS file still declares, so removing a prefix removes its
// own coverage check along with it. Pin the five sections the 2 Nov 2026
// thin-ledger re-read put in scope directly, so dropping one is caught here
// regardless of what the sitemap-matching loop can see.
const EXPECTED_PREFIXES = ['/programmatic/', '/answers/', '/insights/', '/learn/', '/case-studies/'];
const droppedSections = EXPECTED_PREFIXES.filter((p) => !prefixes.includes(p));
if (droppedSections.length) {
  console.error(`validate-substance-scan-covers-sitemap: data/content/governed_page_sections.json is missing declared section(s): ${droppedSections.join(', ')}.`);
  process.exit(1);
}

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) {
  console.error('validate-substance-scan-covers-sitemap: sitemap.xml lists zero URLs.');
  process.exit(1);
}

const quality = analyzeCorpus();
const rowByRoute = new Map(quality.pages.map((p) => [p.route, p]));

const missing = [];
const noOwner = [];
let governedCount = 0;
for (const u of urls) {
  const route = cleanRoute(u);
  if (!prefixes.some((p) => route.startsWith(p))) continue;
  governedCount += 1;
  const row = rowByRoute.get(route);
  if (!row) { missing.push(route); continue; }
  if (!row.repair_owner) noOwner.push(route);
}

if (!governedCount) {
  console.error('validate-substance-scan-covers-sitemap: zero sitemap URLs fell under a declared governed section; sitemap.xml and governed_page_sections.json have drifted apart.');
  process.exit(1);
}
if (missing.length) {
  console.error(`validate-substance-scan-covers-sitemap: ${missing.length} sitemapped governed route(s) have no substance row: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', ...' : ''}`);
  process.exit(1);
}
if (noOwner.length) {
  console.error(`validate-substance-scan-covers-sitemap: ${noOwner.length} route(s) have a substance row with no declared repair owner: ${noOwner.slice(0, 10).join(', ')}${noOwner.length > 10 ? ', ...' : ''}`);
  process.exit(1);
}

console.log(`validate-substance-scan-covers-sitemap OK: ${governedCount} sitemapped governed route(s) across ${prefixes.length} section(s), every one has a substance row and a declared repair owner.`);
