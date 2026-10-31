#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * EVERY TITLE NAMES THIS SITE, AND EVERY TITLE FITS THE BAND.
 *
 * Search Readiness b1 wants "30-65 characters, unique, the query first, the site
 * name once"; b10 wants every title to name its own site and never a sibling's.
 * scripts/lib/title_brand.js decides what each title should be; this step writes
 * it onto the rendered pages.
 *
 * WHAT WENT WRONG. When the band tightened to 30-65 on 26 Oct 2026 this script
 * brought an over-long title inside it by DROPPING the brand suffix, because
 * dropping is lossless where cutting a name at a word is not. That was the right
 * instinct about truncation and the wrong conclusion about the brand: on 31 Oct
 * 2026, 532 of the 2,300 sitemap pages carried no site name at all, and b10 passed
 * only on the weeks its 12-page sample happened to miss them. The sampled page
 * /programmatic/community-management-services-how-to-compare-vendors read
 * "Community Management Services: How To Compare Vendors" - 53 characters, inside
 * the band, naming nobody. It now reads "Community Management: Comparing Vendors
 * | VirtualAgency OS", 57 characters, with the same meaning.
 *
 * RULE 0: fewer than MIN_PAGES pages parsed means the walk or the <title> parser
 * has stopped matching, and that exits non-zero.
 */
const fs = require('fs');
const path = require('path');
const { TITLE_MIN, TITLE_MAX } = require('./lib/page_meta.js');
const { ROOT, walk } = require('./lib/site_head.js');
const { BRAND, planTitles } = require('./lib/title_brand.js');

const MIN_PAGES = 1000;
const DRY = process.argv.includes('--dry-run');

const unesc = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pages = [];
for (const rel of walk(ROOT, ROOT, [])) {
  const abs = path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!tm) continue;
  pages.push({ rel, abs, html, tm, title: unesc(tm[1]).trim() });
}

const { changes, kept, tooLong, collisions } = planTitles(pages);
let written = 0;
for (const p of pages) {
  const next = changes.get(p.rel);
  if (!next) continue;
  if (!DRY) fs.writeFileSync(p.abs, p.html.replace(p.tm[0], `<title>${esc(next)}</title>`));
  written++;
}

console.log(`apply_title_suffix_band${DRY ? ' DRY-RUN' : ''}: ${pages.length} page(s) parsed, ${kept} already named this site inside ${TITLE_MIN}-${TITLE_MAX}, ${written} rewritten to carry "${BRAND.trim()}".`);
if (collisions.length) {
  console.log(`  refused, the new title is already another page's (${collisions.length}):`);
  for (const c of collisions.slice(0, 20)) console.log(`   - ${c.rel}: ${c.why}`);
  if (collisions.length > 20) console.log(`   - and ${collisions.length - 20} more`);
}
if (tooLong.length) {
  console.log(`  name too long to carry the brand, shorten at source (${tooLong.length}):`);
  for (const t of tooLong.slice(0, 30)) console.log(`   - ${t.rel}: ${t.why}`);
  if (tooLong.length > 30) console.log(`   - and ${tooLong.length - 30} more`);
}
if (pages.length < MIN_PAGES) {
  console.error(`apply_title_suffix_band FAILED: only ${pages.length} page(s) parsed (floor ${MIN_PAGES}).`);
  process.exit(1);
}
