#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * The Search Console truth file and the lane that keeps it.
 *
 * data/search_intelligence/gsc_truth.json carries the rolling 28-day window on
 * the query AND page dimensions asked for separately, plus a query_history and
 * page_history that are additive. It exists because both collectors in this repo
 * only ever asked for ['query', 'page'], and Search Console withholds the query
 * on low-volume rows: a page can carry impressions for a quarter and have no
 * query x page row anywhere. On 26 Oct 2026 that hid 42 root URLs Google had
 * measured in 90 days which answered 404 while their /programmatic/ twin was
 * live, so scripts/build_measured_404_redirects.js could not forward them.
 *
 * This gate proves the file is shaped right, that its summary counts do not lie
 * about its own arrays, and - the part that actually stops the regression - that
 * the file is still WIRED: a scheduled workflow still runs the collector that
 * writes it and still commits the result, and the redirect builder still reads
 * it. A data file nothing refreshes and nothing reads is a wish.
 *
 * Freshness is deliberately NOT asserted here. The collector needs a credential
 * that lives in Actions, and a missing credential prints a named stop; failing
 * CI on a stale timestamp would turn main red for a cause no commit can fix.
 * The Search Readiness check (item e4) measures freshness from git history,
 * which is the right place for it.
 *
 * RULE 0: an empty history, or counts that disagree with the arrays, exits 1.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TRUTH_REL = 'data/search_intelligence/gsc_truth.json';
const COLLECTOR_REL = 'distribution_scripts/gsc_search_intelligence.py';
const CONSUMER_REL = 'scripts/build_measured_404_redirects.js';
const WF_DIR = path.join(ROOT, '.github', 'workflows');

const problems = [];
const fail = (m) => problems.push(m);
const abs = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(abs(p), 'utf8');
const exists = (p) => fs.existsSync(abs(p));

if (!exists(TRUTH_REL)) {
  console.error(`gsc-truth FAILED: ${TRUTH_REL} is missing. Run \`npm run search:intelligence\` with GSC credentials, or restore the committed file.`);
  process.exit(1);
}

let truth;
try { truth = JSON.parse(read(TRUTH_REL)); } catch (e) { console.error(`gsc-truth FAILED: ${TRUTH_REL} does not parse: ${e.message}`); process.exit(1); }

// ------------------------------------------------------------------ shape
for (const k of ['generated_at', 'site', 'window', 'counts', 'queries', 'pages', 'query_history', 'page_history']) {
  if (truth[k] === undefined) fail(`${TRUTH_REL} has no ${k}`);
}
const win = truth.window || {};
if (Number(win.days) !== 28) fail(`window.days is ${win.days}; the committed window is the rolling 28 days`);
for (const k of ['start_date', 'end_date']) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(win[k] || ''))) fail(`window.${k} is not a date (${win[k]})`);
}

const arrays = {
  queries: truth.queries, pages: truth.pages,
  query_history: truth.query_history, page_history: truth.page_history,
};
for (const [name, v] of Object.entries(arrays)) if (!Array.isArray(v)) fail(`${name} is not an array`);

// RULE 0: a history that remembers nothing cannot keep a target from vanishing.
const ph = Array.isArray(truth.page_history) ? truth.page_history : [];
const qh = Array.isArray(truth.query_history) ? truth.query_history : [];
if (!ph.length) fail('page_history is empty; a gate that remembers nothing cannot stop a measured URL from losing its redirect');
if (!qh.length) fail('query_history is empty');

// The summary must not lie about the arrays underneath it.
const counts = truth.counts || {};
for (const [k, arr] of [['queries_28d', truth.queries], ['pages_28d', truth.pages],
  ['query_history', qh], ['page_history', ph]]) {
  if (Array.isArray(arr) && counts[k] !== undefined && Number(counts[k]) !== arr.length) {
    fail(`counts.${k} says ${counts[k]} but the array holds ${arr.length}`);
  }
}

// Every history row needs the key it is indexed by and its provenance.
for (const [name, rows, key] of [['page_history', ph, 'page'], ['query_history', qh, 'query']]) {
  const noKey = rows.filter((r) => !r || typeof r[key] !== 'string' || !r[key].trim()).length;
  if (noKey) fail(`${name}: ${noKey} row(s) with no ${key}`);
  const noSeen = rows.filter((r) => r && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.first_seen || ''))).length;
  if (noSeen) fail(`${name}: ${noSeen} row(s) with no first_seen date; the history cannot be additive without one`);
  const noSrc = rows.filter((r) => r && !(Array.isArray(r.sources) && r.sources.length)).length;
  if (noSrc) fail(`${name}: ${noSrc} row(s) with no sources; provenance is what makes a seeded row honest`);
}

// ------------------------------------------------------------------ wiring
if (!exists(COLLECTOR_REL)) fail(`${COLLECTOR_REL} is missing; nothing writes ${TRUTH_REL}`);
else {
  const src = read(COLLECTOR_REL);
  if (!src.includes('gsc_truth.json')) fail(`${COLLECTOR_REL} no longer writes gsc_truth.json`);
  if (!/'page'/.test(src)) fail(`${COLLECTOR_REL} no longer asks for the page dimension on its own, which is the whole reason this file exists`);
  if (!/page_history/.test(src) || !/additive/.test(src)) fail(`${COLLECTOR_REL} no longer carries the additive page history forward`);
}

if (!exists(CONSUMER_REL)) fail(`${CONSUMER_REL} is missing; nothing reads ${TRUTH_REL}`);
else if (!read(CONSUMER_REL).includes('gsc_truth.json')) {
  fail(`${CONSUMER_REL} no longer reads gsc_truth.json; the measured pages would stop reaching the redirect builder`);
}

// A scheduled workflow must still run the collector and still commit what it wrote.
const wfs = fs.existsSync(WF_DIR) ? fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)) : [];
const lane = wfs.map((f) => ({ f, text: fs.readFileSync(path.join(WF_DIR, f), 'utf8') }))
  .filter((w) => /^\s*-\s*cron:/m.test(w.text))
  .filter((w) => /search:intelligence|gsc_search_intelligence/.test(w.text));
if (!lane.length) {
  fail('no scheduled workflow runs the Search Console collector; gsc_truth.json would go stale and the Search Readiness freshness check (e4) would fail with nothing in the repo to fix');
} else if (!lane.some((w) => /commit_and_push_if_changed|git\s+commit/.test(w.text))) {
  fail(`${lane.map((w) => w.f).join(', ')} runs the collector on a schedule but commits nothing, so the refreshed file never reaches the default branch`);
}

if (problems.length) {
  console.error(`gsc-truth FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`gsc-truth OK: ${TRUTH_REL} window ${win.start_date}..${win.end_date}; ${truth.queries.length} quer(y/ies) and ${truth.pages.length} page(s) in window; history ${qh.length} quer(y/ies), ${ph.length} page(s); collected by ${lane.map((w) => w.f).join(', ')} on a schedule and read by ${CONSUMER_REL}.`);
