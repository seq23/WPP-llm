#!/usr/bin/env node
/**
 * Behaviour of scripts/lib/sitemap_floor.js, the page floor every walker shares
 * (owner ruling 3 Nov 2026: the floor follows the sitemap, never a fixed count).
 * Proves both ways: a complete fixture passes, and each broken shape fails.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sitemapFloorProblems } = require('./lib/sitemap_floor.js');

function site(locs, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-floor-'));
  if (locs) fs.writeFileSync(path.join(root, 'sitemap.xml'), `<urlset>${locs.map((l) => `<url><loc>https://example.com${l}</loc></url>`).join('')}</urlset>`);
  for (const f of files) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), '<html></html>'); }
  return root;
}
const FILES = ['index.html', 'about.html', 'topics/index.html', 'programmatic/a.html'];
const LOCS = ['/', '/about', '/topics/', '/programmatic/a'];

const good = site(LOCS, FILES);
assert.deepEqual(sitemapFloorProblems(good, FILES), [], 'a complete site passes');
assert.deepEqual(sitemapFloorProblems(good, FILES.map((f) => path.join(good, f))), [], 'absolute paths count as examined');
assert.deepEqual(sitemapFloorProblems(good, ['programmatic/a.html'], 'x', { under: '/programmatic/' }), [], 'under limits the floor');
// Three pages are healthy: no fixed minimum.
assert.deepEqual(sitemapFloorProblems(site(['/', '/about'], ['index.html', 'about.html']), ['index.html', 'about.html']), []);

const BROKEN = [
  ['no sitemap', () => sitemapFloorProblems(site(null, FILES), FILES)],
  ['empty sitemap', () => sitemapFloorProblems(site([], FILES), FILES)],
  ['listed page not built', () => sitemapFloorProblems(site([...LOCS, '/gone'], FILES), FILES)],
  ['listed page not examined', () => sitemapFloorProblems(good, FILES.slice(1))],
  ['walk examined nothing', () => sitemapFloorProblems(good, [])],
  ['nothing listed under the prefix', () => sitemapFloorProblems(good, FILES, 'x', { under: '/insights/' })],
];
const missed = BROKEN.filter(([, f]) => f().length === 0).map(([n]) => n);
if (missed.length) { console.error(`NAMED STOP [SELF_TEST_BLIND] sitemap floor did not catch: ${missed.join(', ')}`); process.exit(1); }
console.log(`sitemap floor OK — complete sites pass, ${BROKEN.length} broken shapes caught`);
