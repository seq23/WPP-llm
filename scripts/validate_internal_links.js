#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, __dirname.endsWith('validation') ? '../..' : '..');
const SKIP = new Set(['node_modules', '.git']);
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
function existsForHref(from, href) {
  if (!href || /^(https?:|mailto:|tel:|#|javascript:|\/\/)/i.test(href)) return true;
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return true;
  let target = clean.startsWith('/') ? path.join(ROOT, clean) : path.resolve(path.dirname(from), clean);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  return fs.existsSync(target);
}
const bad = [];
for (const file of walk(ROOT)) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /href=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    if (!existsForHref(file, m[1])) bad.push(`${path.relative(ROOT, file)} -> ${m[1]}`);
  }
}
if (bad.length) {
  console.error(`Broken internal links (${bad.length}):`);
  for (const item of bad.slice(0, 50)) console.error(`- ${item}`);
  process.exit(1);
}
console.log(`Internal link validation OK: ${walk(ROOT).length} HTML files`);
