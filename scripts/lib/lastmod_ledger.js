'use strict';
/**
 * Per-URL lastmod ledger: a freshness date that tracks content, not the clock.
 *
 * Root cause it replaces. scripts/update_sitemap_all_html.js took
 * `new Date().toISOString().slice(0,10)` once and wrote it as the <lastmod> of
 * every URL in the file (line 29, emitted at line 35), and
 * scripts/build_insights.js:352 did the same for the sitemap it writes earlier
 * in the build. Every build therefore moved all 3,240 URLs to the build day, and
 * scripts/cadence_gate.js reported:
 *
 *   uniform_lastmod: 3240 of 3240 pages share a lastmod inside 7 days
 *
 * Why it matters. <lastmod> is a claim to a crawler about when a page changed,
 * and recency is the strongest single correlate of whether an answer engine
 * cites a page - pages not refreshed within about 13 weeks markedly lose
 * citations. A date that advances for every page on every build carries no
 * information about which page changed, and it is false for the 3,239 that did
 * not. It also hides decay: with 3,041 pages held byte-frozen by the accepted
 * output guard, a page can be provably unchanged for months while its sitemap
 * entry keeps claiming it was refreshed this morning. That is the largest
 * library in the portfolio making the loudest false freshness claim.
 *
 * How this fixes it. The ledger stores {url: {hash, lastmod}} in
 * data/cadence/lastmod_ledger.json, beside the known_urls.json the cadence gate
 * already keeps, and follows that file's conventions rather than adding a
 * parallel system. A URL whose content hash is unchanged keeps the date it
 * already had; only changed or previously unseen content advances.
 *
 * Seeding. A URL the ledger has never recorded is seeded from its last commit
 * date - a recorded fact about when that file's content changed, not a guess -
 * but only when the clone actually has the history to answer the question. A
 * shallow checkout reports the tip commit for every file, which is the same
 * date bump in a different costume, so `git rev-parse --is-shallow-repository`
 * gates it and the build date is used instead. Nothing here reconstructs or
 * estimates a date.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SCHEMA = 'lastmod-ledger-v1';
const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_PATH = path.join(ROOT, 'data', 'cadence', 'lastmod_ledger.json');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// A build timestamp is not content. Normalising it keeps an otherwise unchanged
// page from looking changed if a generator ever stamps one in.
const BUILD_STAMP = /\d{4}-\d{2}-\d{2}T[\d:.]+Z/g;

const NOTE =
  'Per-URL content hash and the date that content last changed. lastmod only advances ' +
  'for a URL whose hash changed; see scripts/lib/lastmod_ledger.js. A URL the ledger has ' +
  'not seen before is seeded from its last commit date when the clone has full history, ' +
  'and from the build date otherwise. No dates are reconstructed or estimated.';

function buildDate() {
  const override = String(process.env.BUILD_DATE || '').trim();
  if (DATE.test(override)) return override;
  return new Date().toISOString().slice(0, 10);
}

function contentHash(payload) {
  return crypto.createHash('sha256').update(String(payload).replace(BUILD_STAMP, '<<BUILD_TIMESTAMP>>')).digest('hex');
}

/**
 * True only when this clone can answer "when did this file last change". A
 * shallow clone answers "at the tip" for every file, which is exactly the
 * defect this module exists to remove, so it must never be trusted for dates.
 */
function hasFullHistory() {
  try {
    return execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim() === 'false';
  } catch {
    return false;
  }
}

function lastCommitDate(rel) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return DATE.test(out) ? out : '';
  } catch {
    return '';
  }
}

function load(ledgerPath = DEFAULT_PATH) {
  if (!fs.existsSync(ledgerPath)) return { schema: SCHEMA, note: NOTE, seeded_on: null, entries: {} };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch {
    // A corrupt ledger must not silently degrade to "everything changed today".
    throw new Error(`lastmod ledger is not valid JSON: ${ledgerPath}`);
  }
  if (!data.entries || typeof data.entries !== 'object') data.entries = {};
  return data;
}

/** Map {url: {hash, file}} to {url: lastmod}. Pure: reads, never writes. */
function resolve(pages, ledger, today, opts = {}) {
  const day = today || buildDate();
  const entries = (ledger && ledger.entries) || {};
  const trustGit = opts.trustGit === undefined ? hasFullHistory() : opts.trustGit;
  const out = {};
  for (const [url, page] of Object.entries(pages)) {
    const prev = entries[url];
    if (prev && prev.hash === page.hash && DATE.test(String(prev.lastmod))) out[url] = prev.lastmod;
    else if (!prev && trustGit && page.file) out[url] = lastCommitDate(page.file) || day;
    else out[url] = day;
  }
  return out;
}

/**
 * Dates for URLs whose backing file this caller cannot identify. Known URLs keep
 * their recorded date; unknown ones get the build date. Used by the insights
 * sitemap pass, which works from URLs rather than files and is overwritten later
 * in the build by the hash-based pass that owns the ledger.
 */
function resolveKnownUrls(urls, ledger, today) {
  const day = today || buildDate();
  const entries = (ledger && ledger.entries) || {};
  const out = {};
  for (const url of urls) {
    const prev = entries[url];
    out[url] = prev && DATE.test(String(prev.lastmod)) ? prev.lastmod : day;
  }
  return out;
}

/** The ledger to persist. `prune` drops URLs the run did not see. */
function rebuilt(pages, ledger, today, opts = {}) {
  const day = today || buildDate();
  const resolved = resolve(pages, ledger, day, opts);
  const entries = opts.prune ? {} : Object.assign({}, (ledger && ledger.entries) || {});
  for (const [url, page] of Object.entries(pages)) {
    entries[url] = { hash: page.hash, lastmod: resolved[url] };
  }
  const sorted = {};
  for (const url of Object.keys(entries).sort()) sorted[url] = entries[url];
  return { schema: SCHEMA, note: NOTE, seeded_on: (ledger && ledger.seeded_on) || day, entries: sorted };
}

function save(ledger, ledgerPath = DEFAULT_PATH) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const tmp = `${ledgerPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, ledgerPath);
}

module.exports = {
  SCHEMA, DEFAULT_PATH, buildDate, contentHash, hasFullHistory, lastCommitDate,
  load, resolve, resolveKnownUrls, rebuilt, save
};
