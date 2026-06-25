#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SITE_BASE = 'https://virtualagency-os.com';
const SKIP = new Set(['.git','node_modules','.build','releases']);
function walk(dir, out=[]) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(path.relative(ROOT, full).replace(/\\/g,'/'));
  }
  return out;
}
function locFor(rel) {
  if (rel === 'index.html') return `${SITE_BASE}/`;
  return `${SITE_BASE}/${rel}`;
}
const lastmod = new Date().toISOString().slice(0,10);
const html = walk(ROOT).sort();
const body = html.map(rel => `  <url>\n    <loc>${locFor(rel)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join('\n');
fs.writeFileSync(path.join(ROOT,'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
console.log(`Updated sitemap with ${html.length} HTML files.`);
