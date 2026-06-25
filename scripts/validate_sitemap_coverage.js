#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(SITEMAP)) { console.error('Missing sitemap.xml'); process.exit(1); }
const SKIP = new Set(['node_modules','.git','.build','logs','artifacts']);
function walk(dir, out=[]) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(path.relative(ROOT, full).replace(/\\/g,'/'));
  }
  return out;
}
function cleanPath(rel){ if(rel==='index.html') return '/'; if(rel.endsWith('/index.html')) return '/' + rel.slice(0,-'index.html'.length); return '/' + rel.replace(/\.html$/,''); }
function fileForUrlPath(u){
  if (!u || u === '/') return 'index.html';
  const p = u.replace(/^\//,'').replace(/\/$/,'');
  if (p.endsWith('.html')) return p;
  if (fs.existsSync(path.join(ROOT, p + '.html'))) return p + '.html';
  return p + '/index.html';
}
const html = walk(ROOT);
const expected = new Set(html.map(cleanPath));
const xml = fs.readFileSync(SITEMAP, 'utf8');
const urls = [...xml.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map(m => m[1] || '/');
const got = new Set(urls);
const missing = [...expected].filter(u => !got.has(u));
const broken = urls.filter(u => !fs.existsSync(path.join(ROOT, fileForUrlPath(u))));
const htmlUrls = urls.filter(u => u.endsWith('.html'));
if (missing.length || broken.length || htmlUrls.length) {
  if (missing.length) console.error('Canonical clean URLs missing from sitemap:', missing.slice(0, 50));
  if (broken.length) console.error('Sitemap URLs missing files:', broken.slice(0, 50));
  if (htmlUrls.length) console.error('Sitemap still contains .html URLs:', htmlUrls.slice(0, 50));
  process.exit(1);
}
console.log(`Sitemap coverage OK: ${html.length} HTML files as clean canonical URLs`);
