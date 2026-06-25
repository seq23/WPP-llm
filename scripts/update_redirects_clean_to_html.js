#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
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
const lines = ['# Canonical policy: .html pages are canonical; clean URL variants redirect to .html.'];
// manual alias redirects preserved across build
lines.push('/virtual-event-production-for-nonprofit /virtual-event-production-for-nonprofits.html 301');
lines.push('/virtual-event-production-for-nonprofit.html /virtual-event-production-for-nonprofits.html 301');
for (const rel of walk(ROOT).sort()) {
  if (rel === 'index.html' || rel.endsWith('/index.html')) continue;
  const clean = '/' + rel.replace(/\.html$/, '');
  const target = '/' + rel;
  lines.push(`${clean} ${target} 301`);
}
fs.writeFileSync(path.join(ROOT, '_redirects'), lines.join('\n') + '\n');
console.log(`Updated _redirects with ${lines.length-1} clean-to-html redirects.`);
