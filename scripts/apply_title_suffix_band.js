#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Brings an over-long <title> inside the band by dropping its brand suffix,
 * and nothing else.
 *
 * WHY ONLY THIS. When the band tightened to 30-65 on 26 Oct 2026 (Search
 * Readiness b1), 31 pages were over it. Most were over it because of the suffix,
 * not the page name: " | West Peek Productions" is 24 characters, " | West Peek
 * Productions Answer" is 31 and " | West Peek Community Authority" is 32, and
 * the directories disagreed about which to use. Dropping the suffix is lossless
 * - the page name survives whole - and it is what scripts/apply_page_meta_policy.js
 * already does for the programmatic guides, so the site ends up consistent.
 *
 * It deliberately does NOT truncate. scripts/lib/page_meta.js says a
 * hand-written title is "rewritten by a person, never cut at a word", and that
 * is right: cutting produced "How do small teams prevent scope | West Peek
 * Productions" and "Community Governance and | West Peek Community Authority".
 * A page whose name alone is still over the band is reported and left for a
 * person.
 *
 * RULE 0: fewer than MIN_PAGES pages parsed means the walk or the <title>
 * parser has stopped matching, and that exits non-zero.
 */
const fs = require('fs');
const path = require('path');
const { TITLE_MIN, TITLE_MAX } = require('./lib/page_meta.js');
const { ROOT, walk } = require('./lib/site_head.js');

const MIN_PAGES = 1000;
const DRY = process.argv.includes('--dry-run');
// " | Brand", " — Brand", " – Brand": the trailing brand clause only.
const SUFFIX_RE = /\s+[|–—]\s+[^|–—]+$/;

const unesc = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stats = { parsed: 0, suffix_dropped: 0 };
const forAPerson = [];

for (const rel of walk(ROOT, ROOT, [])) {
  const abs = path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!tm) continue;
  stats.parsed++;
  const title = unesc(tm[1]).trim();
  if (title.length <= TITLE_MAX) continue;

  const sfx = (title.match(SUFFIX_RE) || [''])[0];
  const name = sfx ? title.slice(0, -sfx.length).trim() : title;
  if (sfx && name.length >= TITLE_MIN && name.length <= TITLE_MAX) {
    if (!DRY) fs.writeFileSync(abs, html.replace(tm[0], `<title>${esc(name)}</title>`));
    stats.suffix_dropped++;
    continue;
  }
  forAPerson.push(`${rel}: "${title}" is ${title.length} chars${sfx ? ` and ${name.length} without its suffix` : ' with no brand suffix to drop'}`);
}

console.log(`apply_title_suffix_band${DRY ? ' DRY-RUN' : ''}: ${stats.parsed} page(s) parsed, ${stats.suffix_dropped} title(s) brought inside ${TITLE_MIN}-${TITLE_MAX} by dropping the brand suffix.`);
if (forAPerson.length) {
  console.log(`  needs a person to rewrite (${forAPerson.length}):`);
  for (const f of forAPerson) console.log(`   - ${f}`);
}
if (stats.parsed < MIN_PAGES) {
  console.error(`apply_title_suffix_band FAILED: only ${stats.parsed} page(s) parsed (floor ${MIN_PAGES}).`);
  process.exit(1);
}
