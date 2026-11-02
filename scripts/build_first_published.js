#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Writes data/seo/first_published.json: the first commit date of every
 * published HTML page, read from git history. scripts/lib/page_finish.js shows
 * it as the visible "Published" date when the admission registry has none.
 * A recorded fact, never an estimate: a shallow clone cannot answer, so this
 * refuses to run on one rather than write the tip date for every page.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data/seo/first_published.json');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
  console.error('NAMED_STOP: SHALLOW_CLONE - first-published dates need full history; fetch with --unshallow');
  process.exit(1);
}
const routes = {};
let cur = null;
for (const line of git(['log', '--diff-filter=A', '--name-only', '--format=@@%as', '--', '*.html']).split('\n')) {
  const l = line.trim();
  if (!l) continue;
  if (l.startsWith('@@')) { cur = l.slice(2); continue; }
  if (!l.endsWith('.html')) continue;
  let r = `/${l.slice(0, -5)}`;
  if (r === '/index') r = '/';
  else if (r.endsWith('/index')) r = r.slice(0, -6);
  if (!routes[r] || cur < routes[r]) routes[r] = cur;
}
const n = Object.keys(routes).length;
if (n < 100) { console.error(`first_published: only ${n} routes found; refusing to write`); process.exit(1); }
fs.writeFileSync(OUT, `${JSON.stringify({ _comment: 'First commit date of each published page, from git history. Shown as the Published date by scripts/lib/page_finish.js when the admission registry has none. Regenerate: npm run seo:first-published.', routes: Object.fromEntries(Object.entries(routes).sort()) }, null, 1)}\n`);
console.log(`first_published: ${n} routes`);
