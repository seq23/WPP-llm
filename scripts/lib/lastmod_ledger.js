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
 *
 * Second root cause, v2 of the schema. Hashing the whole document put every
 * page's date at the mercy of sitewide boilerplate. On 2026-10-26 one commit
 * added a `logo` to the publisher Organization JSON-LD that every page carries.
 * That block is identical on all of them, so the edit was one template change -
 * but it rewrote 3,434 HTML files, changed 2,722 whole-document hashes, and
 * advanced every lastmod in the sitemap to the build date in a single build:
 *
 *   before: 2,451 at 2026-10-17, 261 at 2026-10-25, 4 at 2026-10-24, ... (5 dates)
 *   after:  2,722 of 2,722 at 2026-10-26
 *
 * Not one page's body, title or description changed. The ledger had been built
 * to stop exactly that claim and restated it through a different door, because
 * "did this file's bytes change" is not the question; "did this page's content
 * change" is. Re-seeding from git cannot repair it either: the boilerplate
 * commit is now the last commit to touch all 3,434 files, so every commit date
 * reads as the same day too.
 *
 * So the hash is taken over the page's OWN content - its title, meta
 * description, canonical and the contents of its <main> element - and not over
 * the chrome every page shares: the publisher JSON-LD, the analytics loader, the
 * injected og/author meta, the nav and the footer. <main> excludes nav and
 * footer on all 3,436 pages here, checked. A sitewide template or entity edit
 * now moves no dates, which is true; an edit to a page's own content moves that
 * page's date, which is also true. A page with no <main> to isolate falls back
 * to the whole document rather than hash an empty string, because an empty
 * basis would collide across every page and freeze all of their dates at once.
 *
 * The basis change makes v1 hashes incomparable, so SCHEMA was bumped to v2 (and to v3 when link-architecture regions left the basis, 26 Oct 2026), and a ledger
 * written under v1 is not read for hashes. The dates corrupted by that commit
 * were repaired in the same change from the last ledger revision written before
 * it - a recorded fact in git history, not a reconstruction.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SCHEMA = 'lastmod-ledger-v3';
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

/**
 * The part of a page that is the page, rather than the chrome every page shares.
 * Title, meta description and canonical identify it; <main> is its content. The
 * publisher JSON-LD, analytics loader, injected og/author meta, nav and footer
 * are deliberately absent: they are one template, and a change to them is one
 * change, not 2,722 of them.
 *
 * Returns the whole document when there is no <main> to isolate. That is the
 * honest fallback - we cannot tell content from chrome on such a page - and it
 * is never the empty string, which would hash identically for every page and
 * pin all of their dates together.
 */
function contentBasis(html) {
  const doc = String(html);
  const first = (re) => { const m = doc.match(re); return m ? m[0] : ''; };
  const title = first(/<title[^>]*>[\s\S]*?<\/title>/i);
  const description = first(/<meta[^>]+name=["']description["'][^>]*>/i);
  const canonical = first(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  // Greedy to the LAST </main>, so a page that nests one keeps all of its content.
  const main = doc.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  // v3: the link-architecture regions inside <main> (sibling, neighbour and
  // related lists written by scripts/build_link_architecture.js) are navigation
  // too. On 26 Oct 2026 retiring 424 duplicate variants reshuffled the sibling
  // ring on 2,720 pages whose own text did not change; under v2 every one of them
  // claimed fresh content.
  const content = main ? main[1].replace(/<!--link-arch:([a-z-]+)-->[\s\S]*?<!--\/link-arch:\1-->/g, '') : '';
  if (!content.trim()) return doc;
  return [title, description, canonical, content].join('\n');
}

function contentHash(payload) {
  return crypto.createHash('sha256')
    .update(contentBasis(payload).replace(BUILD_STAMP, '<<BUILD_TIMESTAMP>>'))
    .digest('hex');
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
  // Hashes written under a different content basis cannot be compared with the
  // current ones: every one would read as "changed" and advance to the build date,
  // which is the defect this module exists to remove. Dates are kept so a
  // recorded lastmod is never lost; only the hashes are dropped, which makes
  // each URL re-hash once and hold the date it already had.
  if (data.schema !== SCHEMA) {
    const kept = {};
    for (const [url, e] of Object.entries(data.entries)) {
      if (e && DATE.test(String(e.lastmod))) kept[url] = { hash: '', lastmod: e.lastmod };
    }
    data = { schema: SCHEMA, note: NOTE, seeded_on: data.seeded_on || null, entries: kept };
  }
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
    const recorded = prev && DATE.test(String(prev.lastmod)) ? prev.lastmod : '';
    if (recorded && prev.hash === page.hash) out[url] = recorded;
    // A recorded date whose hash was written under an older content basis (or
    // never written) says nothing about whether the page changed. Holding the
    // date and re-hashing once is the only answer that does not invent a
    // freshness claim; advancing to the build date here would re-stamp the whole
    // library on the first build after a schema bump.
    else if (recorded && !prev.hash) out[url] = recorded;
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
  SCHEMA, DEFAULT_PATH, buildDate, contentBasis, contentHash, hasFullHistory, lastCommitDate,
  load, resolve, resolveKnownUrls, rebuilt, save
};
