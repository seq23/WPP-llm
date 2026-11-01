#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Records the pages the shared search loop published (sitemap URLs under
 * /questions/) in the cadence ledger as source search_loop, so the cadence
 * gate's weekly cap keeps governing everything else while the loop paces its
 * own pages (owner ruling 1 Nov 2026: publish straight away). Run by
 * .github/scripts/search_loop_post_build.sh after `npm run build` has put the
 * new pages in the sitemap.
 */
const fs = require('fs');
const path = require('path');
const cap = require('./weekly_cap.js');

const ROOT = process.cwd();
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter(cap.isSearchLoopUrl);
if (!urls.length) {
  console.log('search-loop cadence: the sitemap lists no /questions/ page yet; nothing to record');
  process.exit(0);
}
const res = cap.recordSearchLoopPublication(ROOT, urls);
console.log(`search-loop cadence: ${urls.length} /questions/ URL(s) in the sitemap, ${res.recorded} newly recorded as ${cap.SOURCE_SEARCH_LOOP}`);
