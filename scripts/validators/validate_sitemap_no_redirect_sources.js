#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: a sitemap.xml URL that _redirects answers with a redirect.
 *
 * Why: on Pages a _redirects rule wins over a static file, so a sitemap entry
 * that is also a redirect source tells Google "index this" about a URL that
 * answers 301. On 26 Oct 2026, 430 /programmatic/ duplicate variants became 301
 * sources (data/seo/duplicate_family_consolidation.json); update_sitemap_all_html.js
 * already filters redirect sources, and this gate keeps that a checked fact
 * rather than a property of one script.
 *
 * RULE 0: a sitemap with fewer than MIN_URLS entries, or a _redirects with no
 * 301 rules, means nothing was examined, and fails.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, parseRedirects } = require('../lib/pages_routing.js');

const MIN_URLS = 100;
const sitemap = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(sitemap)) { console.error('sitemap.xml is missing'); process.exit(1); }
const urls = [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
const rules = parseRedirects(ROOT).filter((r) => [301, 302, 307, 308].includes(r.status));
if (urls.length < MIN_URLS || !rules.length) {
  console.error(`sitemap-no-redirect-sources: examined ${urls.length} sitemap URL(s) and ${rules.length} redirect rule(s); refusing to pass on an empty scan.`);
  process.exit(1);
}
const norm = (p) => (p === '/' ? '/' : p.replace(/\/+$/, ''));
const sources = new Map(rules.map((r) => [norm(r.from), r]));
const bad = [];
for (const u of urls) {
  let p;
  try { p = norm(new URL(u).pathname); } catch { bad.push(`${u}: not a URL`); continue; }
  const r = sources.get(p) || sources.get(`${p}.html`);
  if (r) bad.push(`${u} is a ${r.status} source in _redirects (line ${r.line}) -> ${r.to}`);
}
if (bad.length) {
  console.error(`sitemap-no-redirect-sources: ${bad.length} sitemap URL(s) answer with a redirect:`);
  for (const b of bad.slice(0, 50)) console.error(`- ${b}`);
  process.exit(1);
}
console.log(`sitemap-no-redirect-sources: ${urls.length} sitemap URLs, ${rules.length} redirect rules, none overlap.`);
