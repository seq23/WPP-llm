#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Every owned page (scripts/lib/site_head.js ownedPages) carries exactly one
 * site-head block: og:type by page kind, og:site_name, og:image 1200x630 with
 * width/height/alt, twitter:card summary_large_image with title/description/
 * image, and the icon/apple-touch-icon/manifest links; no duplicate copies of
 * those tags outside it; no `ld+json">undefined`; and scripts/apply_site_head.js
 * is a no-op on its own output (a non-idempotent build step rewrites pages on
 * every run and hides real changes in the diff).
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadConfig, ownedPages, pageKind } = require('../lib/site_head.js');
const { transform, START, END } = require('../apply_site_head.js');

const MIN_PAGES = 50;
const errors = [];
let cfg;
try { cfg = loadConfig(); } catch (e) { console.error(`social meta FAILED: ${e.message}`); process.exit(1); }
const pages = ownedPages(ROOT, cfg);
if (pages.length < MIN_PAGES) { console.error(`social meta FAILED: ${pages.length} owned page(s); expected at least ${MIN_PAGES}. The page walk is not reaching the site.`); process.exit(1); }
const img = cfg.site_url.replace(/\/$/, '') + cfg.og_image.path;
const count = (h, re) => (h.match(re) || []).length;
const content = (h, attr, key) => ((h.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`)) || [])[1] || '');

for (const rel of pages) {
  const h = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!/<\/head>/i.test(h)) continue;
  const e = (m) => errors.push(`${rel}: ${m}`);
  if (count(h, new RegExp(START, 'g')) !== 1 || count(h, new RegExp(END, 'g')) !== 1) { e('site-head block missing or duplicated'); continue; }
  const want = pageKind(rel, cfg);
  if (count(h, /property="og:type"/g) !== 1) e('og:type must appear exactly once');
  else if (content(h, 'property', 'og:type') !== want) e(`og:type is "${content(h, 'property', 'og:type')}", page kind is "${want}"`);
  if (content(h, 'property', 'og:image') !== img) e('og:image is not the site social card');
  if (content(h, 'property', 'og:image:width') !== String(cfg.og_image.width) || content(h, 'property', 'og:image:height') !== String(cfg.og_image.height)) e('og:image width/height missing or wrong');
  if (!content(h, 'property', 'og:image:alt')) e('og:image:alt missing');
  if (content(h, 'property', 'og:site_name') !== cfg.site_name) e('og:site_name missing or wrong');
  if (count(h, /name="twitter:card"/g) !== 1 || content(h, 'name', 'twitter:card') !== 'summary_large_image') e('twitter:card must be summary_large_image, once');
  for (const k of ['twitter:title', 'twitter:description']) if (!content(h, 'name', k)) e(`${k} empty`);
  if (content(h, 'name', 'twitter:image') !== img) e('twitter:image is not the site social card');
  if (count(h, /<meta\s+property="og:title"/g) !== 1) e('og:title must appear exactly once');
  for (const [re, what] of [[/<link rel="icon" href="\/favicon\.ico"/g, 'icon link'], [/<link rel="apple-touch-icon"/g, 'apple-touch-icon link'], [/<link rel="manifest"/g, 'manifest link']]) if (count(h, re) !== 1) e(`${what} must appear exactly once`);
  if (/ld\+json">undefined</.test(h)) e('carries <script type="application/ld+json">undefined</script>');
  if (transform(rel, h, cfg) !== h) e('apply_site_head.js would change this page again (step is not idempotent here)');
}
if (errors.length) { console.error(`social meta FAILED (${errors.length}):\n- ` + errors.slice(0, 40).join('\n- ')); process.exit(1); }
console.log(`social meta OK: ${pages.length} owned page(s) carry og/twitter/icon tags once, by page kind; build step idempotent.`);
