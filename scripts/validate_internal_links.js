#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.build', 'logs', 'artifacts']);
function walk(dir, out=[]) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}
function candidatePaths(from, href) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return [];
  const base = clean.startsWith('/') ? path.join(ROOT, clean) : path.resolve(path.dirname(from), clean);
  const c = [base];
  if (!path.extname(base)) {
    c.push(base + '.html');
    c.push(path.join(base, 'index.html'));
  }
  if (base.endsWith('/')) c.push(path.join(base, 'index.html'));
  return c;
}
function existsForHref(from, href) {
  if (!href || /^(https?:|mailto:|tel:|#|javascript:|\/\/)/i.test(href)) return true;
  return candidatePaths(from, href).some(p => fs.existsSync(p));
}
const bad = [];
const files = walk(ROOT);
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /href=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    if (!existsForHref(file, m[1])) bad.push(`${path.relative(ROOT, file)} -> ${m[1]}`);
  }
}
if (bad.length) {
  console.error(`Broken internal links (${bad.length}):`);
  for (const item of bad.slice(0, 80)) console.error(`- ${item}`);
  process.exit(1);
}
console.log(`Internal link validation OK: ${files.length} HTML files`);
