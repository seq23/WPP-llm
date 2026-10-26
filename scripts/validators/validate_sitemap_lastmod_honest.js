#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * <lastmod> must be a claim about content, not about the clock.
 *
 * This exists because the claim was false twice, in two different ways, and the
 * second way got past the fix for the first.
 *
 * First, update_sitemap_all_html.js took one `new Date()` and wrote it as the
 * <lastmod> of every URL. scripts/lib/lastmod_ledger.js replaced that with a
 * per-URL content hash, so only a changed page moved.
 *
 * Then, on 2026-10-26, a single commit added a `logo` to the publisher
 * Organization JSON-LD that every page carries. That is one template change, but
 * it rewrote 3,434 HTML files, and because the ledger hashed the WHOLE document
 * it read as 2,722 changed pages. The sitemap went from five honest dates
 * (2,451 at 2026-10-17, 261 at 2026-10-25, ...) to 2,722 of 2,722 at the build
 * date, in one build, with not one page's body, title or description changed.
 * The live sitemap served exactly that. The ledger existed to stop that claim and
 * restated it through a different door.
 *
 * So this validator pins the properties that failure violated, rather than
 * trusting the mechanism to keep working:
 *
 *   1. The sitemap is not a uniform build stamp. If 90% or more of its URLs
 *      (20 or more) share one lastmod dated within the last two days, that is a
 *      build date wearing a content date's clothes. This is the Search Readiness
 *      checklist's own check (item a6), so the rule and the code agree.
 *   2. Sitewide chrome does not move dates. A change to the publisher JSON-LD,
 *      the nav or the footer must leave the content hash alone - asserted by
 *      making those changes and comparing hashes, not by reading the source.
 *   3. A page's own content does move its date. A change inside <main>, or to
 *      the title or meta description, must change the hash. Without this, rule 2
 *      is satisfiable by hashing a constant.
 *   4. A page with no <main> hashes its whole document, never the empty string.
 *      An empty basis would hash identically for every page and pin the entire
 *      library's dates together - rule 2 passing for the worst possible reason.
 *   5. The ledger is v2 and every recorded lastmod is a real date.
 *
 * Rule 0: a sitemap with no dated URLs fails here rather than passing vacuously.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const L = require('../lib/lastmod_ledger.js');

const UNIFORM_SHARE = 0.9;
const MIN_URLS = 20;
const FRESH_DAYS = 2;

const errors = [];
const sitemapPath = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  console.error('sitemap-lastmod-honest: sitemap.xml does not exist; the dates this gate reads are its whole input set.');
  process.exit(1);
}
const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1].trim());

// Rule 0: no stage may exit 0 having done nothing.
if (lastmods.length === 0) {
  console.error('sitemap-lastmod-honest: sitemap.xml carries zero <lastmod> entries; there is nothing to check.');
  process.exit(1);
}

// 1. Not a uniform build stamp.
const counts = new Map();
for (const d of lastmods) counts.set(d, (counts.get(d) || 0) + 1);
const today = L.buildDate();
const daysBefore = (date) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
if (lastmods.length >= MIN_URLS) {
  for (const [date, n] of counts) {
    const share = n / lastmods.length;
    const age = daysBefore(date);
    if (share >= UNIFORM_SHARE && Number.isFinite(age) && age <= FRESH_DAYS) {
      errors.push(
        `${n} of ${lastmods.length} sitemap URLs (${(share * 100).toFixed(1)}%) carry lastmod ${date}, ` +
        `${age} day(s) old: that is the build date, not a content date. ` +
        'A sitewide template or entity change must not advance every page.'
      );
    }
  }
}
console.log(`sitemap-lastmod-honest: ${lastmods.length} URLs, ${counts.size} distinct lastmod date(s), ` +
  `largest share ${(Math.max(...counts.values()) / lastmods.length * 100).toFixed(1)}%.`);

// A real page to mutate. Any sitemap page with a <main> will do.
const samplePath = ['index.html', 'about.html', 'ai-helps-breaks.html']
  .map((p) => path.join(ROOT, p)).find((p) => fs.existsSync(p) && /<main\b/i.test(fs.readFileSync(p, 'utf8')));
if (!samplePath) {
  errors.push('no sample page with a <main> element found; the hash-basis rules below could not be checked.');
} else {
  const page = fs.readFileSync(samplePath, 'utf8');
  const base = L.contentHash(page);
  const rel = path.relative(ROOT, samplePath);

  // 2. Sitewide chrome must not move the hash.
  const chrome = [
    ['publisher Organization JSON-LD',
      (s) => s.replace(/"@type":"Organization"/, '"@type":"Organization","logo":{"@type":"ImageObject","url":"https://example.invalid/l.png"}')],
    ['footer', (s) => s.replace(/<footer/i, '<footer data-validator-probe="1"')],
    ['nav', (s) => s.replace(/<nav/i, '<nav data-validator-probe="1"')],
  ];
  for (const [what, mutate] of chrome) {
    const mutated = mutate(page);
    if (mutated === page) { errors.push(`could not alter the ${what} of ${rel}; rule 2 is unproven.`); continue; }
    if (L.contentHash(mutated) !== base) {
      errors.push(`changing the ${what} of ${rel} changed its content hash. Sitewide chrome is one change, ` +
        'not one per page; hashing it advances every lastmod in the sitemap at once.');
    }
  }

  // 3. The page's own content must move the hash.
  const own = [
    ['<main> body', (s) => s.replace(/(<main\b[^>]*>)/i, '$1<p>validator probe</p>')],
    ['<title>', (s) => s.replace(/<title[^>]*>/i, '<title>validator probe ')],
    ['meta description', (s) => s.replace(/(<meta[^>]+name=["']description["'][^>]+content=["'])/i, '$1validator probe ')],
  ];
  for (const [what, mutate] of own) {
    const mutated = mutate(page);
    if (mutated === page) { errors.push(`could not alter the ${what} of ${rel}; rule 3 is unproven.`); continue; }
    if (L.contentHash(mutated) === base) {
      errors.push(`changing the ${what} of ${rel} left its content hash unchanged. A real content edit must ` +
        'advance that page\'s lastmod, or the date stops meaning anything at all.');
    }
  }

  // 4. No <main> falls back to the whole document, never an empty basis.
  const noMain = page.replace(/<main\b/gi, '<section data-was-main').replace(/<\/main>/gi, '</section>');
  const basis = L.contentBasis(noMain);
  if (!basis.trim()) errors.push(`a page with no <main> produced an empty content basis; every such page would hash alike.`);
  if (basis !== noMain) errors.push('a page with no <main> did not fall back to the whole document.');
}

// 5. The ledger is v2 with real dates.
const ledger = L.load();
if (ledger.schema !== L.SCHEMA) errors.push(`ledger schema is ${ledger.schema}, expected ${L.SCHEMA}.`);
const entries = Object.entries(ledger.entries || {});
if (entries.length === 0) errors.push('lastmod ledger has zero entries.');
const badDates = entries.filter(([, e]) => !/^\d{4}-\d{2}-\d{2}$/.test(String(e && e.lastmod))).map(([u]) => u);
if (badDates.length) errors.push(`${badDates.length} ledger entr(ies) carry no valid lastmod, e.g. ${badDates.slice(0, 3).join(', ')}`);

if (errors.length) {
  console.error('sitemap-lastmod-honest FAILED:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`sitemap-lastmod-honest OK (${entries.length} ledger entries, schema ${ledger.schema}; chrome-blind and content-sensitive, both proven by mutation).`);
