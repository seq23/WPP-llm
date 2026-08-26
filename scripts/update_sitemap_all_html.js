#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DOMAIN = 'https://virtualagency-os.com';
const SKIP = new Set(['.git', '.pages-output', 'node_modules', '.build', 'logs', 'artifacts']);
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}
function cleanPath(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel.replace(/\.html$/, '');
}
// Never submit a noindex page. /admin/ and the 404 surface are deliberately
// excluded from indexing, and listing them here is an error Search Console
// reports against the whole sitemap.
const isNoindex = (rel) => /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i
  .test(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const pages = walk(ROOT).filter((rel) => !isNoindex(rel)).sort();

// <lastmod> is a claim to a crawler about when the page changed, so it is
// derived from the page's own content, not from the build clock. This used to
// be a single `new Date()` written onto every URL, which moved all 3,240 pages
// on every build: a crawler learned nothing about which page changed, the claim
// was false for the 3,239 that did not, and it masked real decay - 3,041 of
// these pages are held byte-frozen by the accepted output guard and can be
// provably unchanged for months while the sitemap says otherwise. Freshness is
// the strongest single correlate of being cited by an answer engine, so this is
// the one signal worth keeping honest.
const ledgerLib = require('./lib/lastmod_ledger');
const today = ledgerLib.buildDate();
const ledger = ledgerLib.load();
const entries = {};
for (const rel of pages) {
  const clean = cleanPath(rel);
  entries[DOMAIN + (clean === '/' ? '/' : clean)] = {
    hash: ledgerLib.contentHash(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
    file: rel
  };
}
const lastmods = ledgerLib.resolve(entries, ledger, today);
ledgerLib.save(ledgerLib.rebuilt(entries, ledger, today, { prune: true }));
// Count what actually moved, not what happens to carry today's date: on the day
// the ledger is seeded those are the same number, and reporting the second as
// the first would overstate how much changed on any build run on a date that
// already appears in the ledger.
const before = ledger.entries || {};
const advanced = Object.keys(entries).filter((url) => {
  const prev = before[url];
  return !prev || prev.hash !== entries[url].hash;
}).length;

const xml = ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
for (const loc of Object.keys(entries)) {
  xml.push('  <url>');
  xml.push(`    <loc>${loc}</loc>`);
  xml.push(`    <lastmod>${lastmods[loc]}</lastmod>`);
  xml.push('  </url>');
}
xml.push('</urlset>','');
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml.join('\n'));
console.log(
  `Updated sitemap with ${pages.length} clean canonical URLs; ` +
  `${advanced} lastmod advanced to ${today} (new or changed content), ` +
  `${pages.length - advanced} held their existing date.`
);
