#!/usr/bin/env node
'use strict';
// Enforce the blocks the external review agent keeps asking for.
//
// Across ~2,750 recommendations audited on two sibling sites, the agent asks for
// the same small set of things over and over. 27% of distinct defects were
// re-reported on later runs despite being marked released - one across 8
// separate run dates. Those are not new defects; they are the same page missing
// the same block, found again.
//
// Derived from the recommendations themselves (.clarity/content-pattern-spec.json):
//
//   1 checklist / numbered protocol      730 occurrences (36.4%)
//   2 comparison / decision / cost table 529 (26.4%)
//   3 direct-answer block                512 (25.5%)
//   4 decision framework                 392 (19.5%)
//   5 concrete numbers                   365 (18.2%)
//   6 named primary sources              288 (14.3%)
//   7 query present in a heading         261 (13.0%)
//   9 FAQ block                          136 (6.8%)
//  10 structured data                     70 (3.5%)
//
// Severity is deliberately split. The blocks that decide whether a page can be
// quoted at all are marked blocking; the rest report as gaps so they can be
// worked without stopping a release.
//
// ENFORCEMENT for this repo is REPORT, not BLOCK. The first run measured 144
// pages with no direct-answer block - legacy hand-authored root pages, the
// pillars hub set, the case-studies family, and the 82 generated query-atlas
// stubs. Writing an answer onto those pages would be fabricating content, so
// the backlog is reported rather than hidden by a weakened check. The validator
// is registered at STRONG_WARNING. Flip ENFORCEMENT to 'block' (and the registry
// entry to HARD_FAIL) once blocking_failures reaches zero - that is a decision
// to make when the backlog is cleared, not a default.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const EVIDENCE = path.join(ROOT, 'artifacts/validation/content-pattern-contract.json');
const ENFORCEMENT = 'report'; // 'block' | 'report'
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'data', 'artifacts', 'reports', 'staging', 'templates',
  'logs', 'coverage', 'dist', 'docs',
]);
// Not reader-facing content: the admin console is an operator surface and the
// legal/utility pages answer no search query.
const SKIP_FILES = new Set([
  'admin/index.html', '404.html', 'privacy.html', 'terms.html', 'disclaimer.html',
]);

// Hub and archive indexes are navigational, not query-answering: "Insights",
// "Pillars" and "Learn" are the correct h1 there. Content pages have no such
// excuse - a short topic-label h1 carries none of the phrasing a person typed,
// which is the agent's #7 recurring finding.
const NAV_INDEXES = new Set([
  'index.html', 'articles.html', 'glossary.html', 'atlas.html', 'query-atlas.html',
  'answers/index.html', 'insights/index.html', 'learn/index.html', 'pillars/index.html',
  'case-studies/index.html',
]);

const text = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// The three direct-answer markers this repo actually emits: the answers/ family
// renders <h2>Direct answer</h2>, the older programmatic pages <h2>Quick answer</h2>,
// and render_programmatic_page.js a <strong>Direct answer</strong> callout.
const DIRECT_ANSWER = /data-direct-answer=|class="[^"]*answer-box|<(?:h2|h3|strong)[^>]*>\s*(?:The\s+)?(?:Direct|Quick|Short)\s+answer\s*<\/(?:h2|h3|strong)>/i;
// The single conversion destination for this repo. virtualagency-os.com is the
// answer layer; westpeekproductions.com (and the sales address) is where a
// citation is supposed to land.
const CONVERSION = /westpeekproductions\.com|scooter@westpeek\.ventures/i;

const CHECKS = [
  { id: 'direct_answer', blocking: true,
    test: (h) => DIRECT_ANSWER.test(h),
    why: 'no direct-answer block - nothing here is quotable without surrounding context' },
  { id: 'query_in_heading', blocking: true,
    appliesTo: (rel) => !NAV_INDEXES.has(rel),
    test: (h) => { const m = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); return Boolean(m && text(m[1]).length > 10); },
    why: 'h1 missing or too short to carry the searcher phrasing' },
  { id: 'no_empty_table_cells', blocking: true,
    test: (h) => !/<t[dh][^>]*>\s*<\/t[dh]>/i.test(h),
    why: 'table ships empty cells - the agent calls these impossible to cite' },
  { id: 'conversion_path', blocking: true,
    test: (h) => CONVERSION.test(h),
    why: 'no conversion path - an answer-engine citation lands with nowhere to go' },
  { id: 'checklist', blocking: false,
    test: (h) => /<ol[\s>]|<ul[\s>]/i.test(h),
    why: 'no checklist or numbered protocol (agent request #1, 730 occurrences)' },
  { id: 'comparison_table', blocking: false,
    test: (h) => /<table[\s>]/i.test(h),
    why: 'no comparison or cost table (agent request #2, 529 occurrences)' },
  { id: 'concrete_numbers', blocking: false,
    test: (h) => /\$\s?\d|\d+\s?(?:days?|weeks?|months?|years?|hours?|minutes?)\b/i.test(text(h)),
    why: 'no concrete cost or timeline figures (agent request #5, 365 occurrences)' },
  { id: 'named_sources', blocking: false,
    test: (h) => /data-source|Primary sources|Sources?:/i.test(h)
      || /<a[^>]+href="https?:\/\/(?!(?:www\.)?(?:westpeekproductions|westpeek|virtualagency-os)\.)/i.test(h),
    why: 'no named primary source (agent request #6, 288 occurrences)' },
  { id: 'faq', blocking: false,
    test: (h) => /FAQPage|data-faq|class="[^"]*faq/i.test(h),
    why: 'no FAQ block or FAQPage schema (agent request #9)' },
  { id: 'structured_data', blocking: false,
    test: (h) => /application\/ld\+json/i.test(h),
    why: 'no JSON-LD structured data (agent request #10)' },
  // Added from the empirical spec (.clarity/content-pattern-spec.json v2.0), which
  // counts what the review agent actually asked for across 913 accepted
  // recommendations. These three were being missed entirely by the earlier list.
  { id: 'recommendation_summary', blocking: false,
    test: (h) => /data-bhpc-agent-block="recommendation_summary"|class="[^"]*recommendation-summary|<h[23][^>]*>\s*(?:What (?:we|this page) recommends?|Recommendation|Bottom line)/i.test(h),
    why: 'no recommendation summary - asked for on 913 of 913 agent recommendations, the single most requested block' },
  { id: 'definition_callout', blocking: false,
    test: (h) => /class="[^"]*citation-definition|data-bhpc-agent-block="definition_callout"|<(?:p|div)[^>]*>\s*<strong>[^<]{40,}<\/strong>/i.test(h),
    why: 'no definition callout (agent requested 196 times) - this is what an answer engine lifts for "what is X"' },
  { id: 'trust_block', blocking: false,
    test: (h) => /data-bhpc-agent-block="trust_block"|class="[^"]*(?:trust|author|byline)|rel="author"|itemprop="author"/i.test(h),
    why: 'no trust or authorship block (agent requested 215 times) - entity clarity is a citation factor' },

];

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(abs); continue; }
    if (!e.name.endsWith('.html')) continue;
    const rel = path.relative(ROOT, abs);
    if (SKIP_FILES.has(rel)) continue;
    pages.push(rel);
  }
})(ROOT);
pages.sort();

const blockingFailures = [];
const gaps = {};
for (const c of CHECKS) gaps[c.id] = [];

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const c of CHECKS) {
    if (typeof c.appliesTo === 'function' && !c.appliesTo(rel)) continue;
    if (c.test(html)) continue;
    if (c.blocking) blockingFailures.push({ path: rel, check: c.id, why: c.why });
    else gaps[c.id].push(rel);
  }
}

const summary = CHECKS.map((c) => {
  const missing = c.blocking
    ? blockingFailures.filter((f) => f.check === c.id).length
    : gaps[c.id].length;
  return {
    id: c.id,
    blocking: c.blocking,
    pages_missing: missing,
    coverage_pct: Number((100 * (1 - missing / Math.max(pages.length, 1))).toFixed(1)),
    why: c.why,
  };
});

fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify({
  schema_version: '1.0',
  validator: 'content-pattern-contract',
  spec: '.clarity/content-pattern-spec.json',
  generated_at: new Date().toISOString(),
  enforcement: ENFORCEMENT,
  pages_checked: pages.length,
  status: blockingFailures.length ? (ENFORCEMENT === 'block' ? 'FAIL' : 'REPORTED') : 'PASS',
  blocking_failures: blockingFailures.length,
  summary,
  worst_gaps: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, v.slice(0, 25)])),
  blocking_backlog: blockingFailures.slice(0, 200),
}, null, 2)}\n`);

console.log(`CONTENT PATTERN CONTRACT: ${pages.length} pages checked (enforcement: ${ENFORCEMENT})`);
for (const s of summary) {
  const tag = s.blocking ? 'BLOCKING' : 'gap     ';
  console.log(`  ${tag} ${s.id.padEnd(22)} coverage ${String(s.coverage_pct).padStart(5)}%  missing on ${s.pages_missing}`);
}
if (blockingFailures.length) {
  const log = ENFORCEMENT === 'block' ? console.error : console.warn;
  log(`\nCONTENT PATTERN CONTRACT: ${blockingFailures.length} blocking gap(s)`);
  for (const f of blockingFailures.slice(0, 15)) log(`  ${f.path} :: ${f.why}`);
  if (blockingFailures.length > 15) log(`  ...and ${blockingFailures.length - 15} more`);
  if (ENFORCEMENT === 'block') process.exit(1);
  console.warn('  reported, not blocking: STRONG_WARNING while the backlog above is worked.');
  console.warn(`  full backlog: ${path.relative(ROOT, EVIDENCE)}`);
  process.exit(0);
}
console.log('\nCONTENT PATTERN CONTRACT PASS');
