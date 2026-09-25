#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: an indexable page (every URL in sitemap.xml) whose <title> is outside
 * TITLE_MIN-TITLE_MAX (30-70; Bing Site Scan flags "Title too long" above 70), whose meta description is outside DESC_MIN-DESC_MAX, or whose
 * title or description is shared with another indexable page.
 *
 * Why: Bing Webmaster rules 113 (duplicate titles), 117 (duplicate descriptions)
 * and 118 (description too short or long) fired on the sibling sites for exactly
 * this. The 25 Sep 2026 crawl of virtualagency-os.com found 12 duplicate-title
 * groups, 58 duplicate-description groups ("Calm, operator-grade steps for ..."
 * on five insights at a time), 121 descriptions under 110 characters and 1,901
 * over 160. The band lives in scripts/lib/page_meta.js, which the generators
 * also write to, so the gate and the writers read one definition.
 *
 * Lengths are measured on the decoded text (&amp; is one character), which is
 * what a search engine displays and counts.
 *
 * RULE 0: fewer than MIN_URLS sitemap URLs, or any sitemap URL with no file
 * behind it, is a failure: the gate would otherwise pass having read nothing.
 */
const fs = require('fs');
const path = require('path');
const { TITLE_MIN, TITLE_MAX, DESC_MIN, DESC_MAX } = require('../lib/page_meta.js');

const ROOT = path.resolve(__dirname, '../..');
const MIN_URLS = 1000;

const decode = (s) => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

function fileFor(urlPath) {
  const p = urlPath.replace(/^\//, '');
  const candidates = p === '' ? ['index.html'] : [`${p.replace(/\/$/, '')}.html`, path.join(p, 'index.html'), p];
  return candidates.find((c) => fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile()) || null;
}

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1] || '/');

if (urls.length < MIN_URLS) {
  console.error(`PAGE META VALIDATION READ ONLY ${urls.length} SITEMAP URLS (floor ${MIN_URLS}). A gate that reads nothing cannot fail; run it after the sitemap is built.`);
  process.exit(1);
}

const problems = [];
const byTitle = new Map();
const byDesc = new Map();
let checked = 0;

for (const u of urls) {
  const file = fileFor(u);
  if (!file) { problems.push(`${u}: in sitemap.xml but no file in the build`); continue; }
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  const descM = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const title = titleM ? decode(titleM[1]).replace(/\s+/g, ' ').trim() : '';
  const desc = descM ? decode(descM[1]).replace(/\s+/g, ' ').trim() : '';
  checked += 1;
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) problems.push(`${u}: title is ${title.length} characters (band ${TITLE_MIN}-${TITLE_MAX}): "${title}"`);
  if (desc.length < DESC_MIN || desc.length > DESC_MAX) problems.push(`${u}: meta description is ${desc.length} characters (band ${DESC_MIN}-${DESC_MAX}): "${desc.slice(0, 90)}${desc.length > 90 ? '...' : ''}"`);
  if (title) { if (!byTitle.has(title)) byTitle.set(title, []); byTitle.get(title).push(u); }
  if (desc) { if (!byDesc.has(desc)) byDesc.set(desc, []); byDesc.get(desc).push(u); }
}

for (const [t, us] of byTitle) if (us.length > 1) problems.push(`duplicate title on ${us.length} pages "${t}": ${us.slice(0, 4).join(', ')}`);
for (const [d, us] of byDesc) if (us.length > 1) problems.push(`duplicate meta description on ${us.length} pages "${d.slice(0, 80)}...": ${us.slice(0, 4).join(', ')}`);

if (problems.length) {
  console.error(`Page meta policy violations (${problems.length}) across ${checked} sitemap pages. Fix the generator that writes the page, not the page:`);
  for (const p of (process.env.PAGE_META_ALL ? problems : problems.slice(0, 80))) console.error(`- ${p}`);
  if (problems.length > 80) console.error(`... and ${problems.length - 80} more`);
  process.exit(1);
}

console.log(`Page meta OK: ${checked} sitemap pages, every title ${TITLE_MIN}-${TITLE_MAX} characters, every description ${DESC_MIN}-${DESC_MAX}, no title or description shared.`);
