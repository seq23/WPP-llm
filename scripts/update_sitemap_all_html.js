#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DOMAIN = 'https://virtualagency-os.com';
const SKIP = new Set(['.git', 'node_modules', '.build', 'logs', 'artifacts']);
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
const pages = walk(ROOT).sort();
const now = new Date().toISOString().slice(0,10);
const xml = ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
for (const rel of pages) {
  const loc = DOMAIN + (cleanPath(rel) === '/' ? '/' : cleanPath(rel));
  xml.push('  <url>');
  xml.push(`    <loc>${loc}</loc>`);
  xml.push(`    <lastmod>${now}</lastmod>`);
  xml.push('  </url>');
}
xml.push('</urlset>','');
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml.join('\n'));
console.log(`Updated sitemap with ${pages.length} clean canonical URLs.`);
