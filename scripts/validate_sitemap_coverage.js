#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, __dirname.endsWith('validation') ? '../..' : '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(SITEMAP)) { console.error('Missing sitemap.xml'); process.exit(1); }
function walk(dir, out=[]) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules','.git'].includes(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(path.relative(ROOT, full).replace(/\\/g,'/'));
  }
  return out;
}
const html = walk(ROOT);
const xml = fs.readFileSync(SITEMAP, 'utf8');
const urls = [...xml.matchAll(/<loc>https?:\/\/[^/]+\/([^<]*)<\/loc>/g)].map(m => m[1] || '');
const urlSet = new Set(urls.map(u => u === '' ? 'index.html' : u.replace(/\/$/, '/index.html')));
const missing = html.filter(h => !urlSet.has(h));
const broken = urls.filter(u => {
  const rel = u === '' ? 'index.html' : u.replace(/\/$/, '/index.html');
  return !fs.existsSync(path.join(ROOT, rel));
});
if (missing.length || broken.length) {
  if (missing.length) console.error('HTML files missing from sitemap:', missing.slice(0, 50));
  if (broken.length) console.error('Sitemap URLs missing files:', broken.slice(0, 50));
  process.exit(1);
}
console.log(`Sitemap coverage OK: ${html.length} HTML files`);
