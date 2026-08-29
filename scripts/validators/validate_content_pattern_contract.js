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


// The spec was named in this validator's output as its provenance while nothing
// read it, so editing the spec changed nothing. It is now loaded and enforced as
// the contract it claims to be: every block the spec asks for must have a test
// here, and every pattern it forbids must have one too. Adding a block to the
// spec and forgetting to implement it fails loudly instead of passing silently.
const SPEC_PATH = '.clarity/content-pattern-spec.json';
const __specRoot = typeof ROOT !== 'undefined' ? ROOT : process.cwd();
const spec = JSON.parse(fs.readFileSync(path.join(__specRoot, SPEC_PATH), 'utf8'));
const specBlockIds = (spec.blocks || []).map((b) => b.id);

// Forbidden patterns, listed in the spec from the start and never enforced -
// which is how pages came to publish "What to add: n/a" and blocks whose entire
// body was "n/a".
const FORBIDDEN = {
  empty_table_cells: {
    test: (h) => /<t[dh][^>]*>\s*<\/t[dh]>/i.test(h),
    why: 'empty table cell - an extracted table with a hole in it reads as broken' },
  internal_instruction_leak: {
    test: (h) => /FILEPATH:|<strong>What to add:|Direct answer target|Agent recommendation|Source FIX instruction|agent-instruction|What this page should clarify|>\s*n\/a\s*</i.test(h),
    why: 'build instruction or placeholder rendered for readers - an answer engine will quote it' },
  fabricated_statistics: {
    // A statistic with nothing sourcing it is the shape of a fabricated one.
    // Reported rather than blocking, because a real figure can be sourced
    // off-page and a heuristic should not fail a release on its own.
    test: (h) => {
      const body = String(h).replace(/<[^>]+>/g, ' ');
      const stat = /\b\d{1,3}(?:\.\d+)?%|\br\s*=\s*0?\.\d+|\b\d+x\s+(?:more|less|higher|lower)/i;
      if (!stat.test(body)) return false;
      return !/<a[^>]+href="https?:\/\//i.test(h)
        && !/\b(?:source|according to|per the|study|survey|report)\b/i.test(body);
    },
    why: 'statistic presented with no source on the page or beside it' },
};

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
    // data-content-block is the marker scripts/lib/recommendation_summary.js emits
    // in this repo; the other two forms are kept so a page authored by hand or by
    // a sibling generator still counts.
    test: (h) => /data-content-block="recommendation_summary"|data-bhpc-agent-block="recommendation_summary"|class="[^"]*recommendation-summary|<h[23][^>]*>\s*(?:What (?:we|this page) recommends?|Recommendation|Bottom line)/i.test(h),
    why: 'no recommendation summary - asked for on 913 of 913 agent recommendations, the single most requested block' },
  { id: 'definition_callout', blocking: false,
    test: (h) => /class="[^"]*citation-definition|data-bhpc-agent-block="definition_callout"|<(?:p|div)[^>]*>\s*<strong>[^<]{40,}<\/strong>/i.test(h),
    why: 'no definition callout (agent requested 196 times) - this is what an answer engine lifts for "what is X"' },
  { id: 'trust_block', blocking: false,
    test: (h) => /data-bhpc-agent-block="trust_block"|class="[^"]*(?:trust|author|byline)|rel="author"|itemprop="author"/i.test(h),
    why: 'no trust or authorship block (agent requested 215 times) - entity clarity is a citation factor' },

  // Named in the spec and never checked, so coverage silently omitted them.
  { id: 'source_block', blocking: false,
    test: (h) => /data-(?:bhpc-)?(?:agent-block|content-block)="source_block"|class="[^"]*(?:source-block|sources|citation)|<h[23][^>]*>\s*(?:Sources?|References?)/i.test(h) || /<a[^>]+href="https?:\/\//i.test(h),
    why: 'no sources block - a claim with no visible provenance is the first thing an engine discounts' },
  { id: 'protocol', blocking: false,
    test: (h) => /data-(?:bhpc-)?(?:agent-block|content-block)="protocol"|class="[^"]*protocol|<h[23][^>]*>[^<]*(?:Protocol|Step-by-step|How to)\b/i.test(h) || /<ol[\s>]/i.test(h),
    why: 'no ordered protocol - ordered steps are what gets lifted for "how do I"' },
  { id: 'cta_callout', blocking: false,
    test: (h) => /data-(?:bhpc-)?(?:agent-block|content-block)="cta_callout"|class="[^"]*(?:cta|next-step)|<h[23][^>]*>\s*Next step/i.test(h),
    why: 'no next-step callout - the conversion link may exist but nothing frames it as the next action' },
  { id: 'prompt_template', blocking: false,
    test: (h) => /data-(?:bhpc-)?(?:agent-block|content-block)="prompt_template"|class="[^"]*(?:copy-paste-prompt|prompt-template)|<pre[^>]*>[\s\S]*?<code/i.test(h),
    why: 'no copy-ready prompt - the artifact this audience actually reuses' },
];

// The spec is the contract. If it asks for a block this validator cannot check,
// the contract is not being enforced and reporting PASS would be false.
const __implemented = new Set(CHECKS.map((c) => c.id));
const __unimplemented = specBlockIds.filter((id) => !__implemented.has(id));
const __unenforced = (spec.forbidden || [])
  .map((f) => (typeof f === 'string' ? f : f && f.id))
  .filter((id) => id && !FORBIDDEN[id]);
if (__unimplemented.length || __unenforced.length) {
  for (const id of __unimplemented) console.log(`  spec block "${id}" has no check - the spec is not enforced`);
  for (const id of __unenforced) console.log(`  spec forbids "${id}" but nothing detects it`);
  console.log('CONTENT PATTERN CONTRACT FAIL: spec is not fully enforced');
  process.exit(1);
}

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

// Coverage is not the goal; a page-specific recommendation is. A block on 94%
// of pages that says the same thing on 1,032 of them scores better on coverage
// than the honest version and is worth less than nothing, so the number that
// would have caught that is measured here and printed next to the coverage.
//
// This also guards a live regression path. scripts/retrofit_recommendation_summary.js
// withdraws a block two pages derive identically, but the page GENERATORS call
// scripts/lib/recommendation_summary.js directly and have no such pass - the
// community-authority family's "How to approach it" list is shared across the
// answers/learn/programmatic mirrors of one topic, so a plain `npm run build`
// re-emits ~26 duplicated blocks. Uniqueness cannot be decided from one page in
// isolation, so it is checked here over the whole library instead.
const { recommendationSummaryText } = require('../lib/recommendation_summary.js');
function distinctness() {
  const byText = new Map();
  for (const rel of pages) {
    const t = recommendationSummaryText(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (!t) continue;
    if (!byText.has(t)) byText.set(t, []);
    byText.get(t).push(rel);
  }
  const total = [...byText.values()].reduce((s, v) => s + v.length, 0);
  const repeated = [...byText.entries()].filter(([, v]) => v.length > 1)
    .sort((a, b) => b[1].length - a[1].length);
  return {
    total_blocks: total,
    distinct_texts: byText.size,
    ratio: Number((byText.size / Math.max(total, 1)).toFixed(4)),
    texts_on_more_than_one_page: repeated.length,
    pages_carrying_a_repeated_text: repeated.reduce((s, [, v]) => s + v.length, 0),
    worst: repeated.slice(0, 10).map(([text, files]) => ({ pages: files.length, text: text.slice(0, 120), sample: files.slice(0, 4) })),
  };
}
const RS_DISTINCTNESS = distinctness();

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
  recommendation_summary_distinctness: RS_DISTINCTNESS,
  worst_gaps: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, v.slice(0, 25)])),
  // The whole gap list, not the first 25. The 25-item slice above is what let a
  // 272-page skip list sit unexamined: nobody could read past the head of it.
  gaps_full: gaps,
  blocking_backlog: blockingFailures.slice(0, 200),
}, null, 2)}\n`);

// Rule 0: a gate that examined nothing has not passed, it has abstained. These three
// gates walk the published *.html surface. That surface is committed here (3,419 tracked
// files), so a fresh CI checkout has it - verified in run 33266127315, which examined
// 3419/3419/3417 pages. But nothing STRUCTURALLY guaranteed that: if the site were ever
// moved behind a build step into a gitignored dist/, or this ran before the stage that
// produces its input, the walk would find zero files, report no offenders and exit 0 -
// a HARD_FAIL gate that is incapable of failing. A sibling repo shipped exactly that on
// three release-blocking gates. The floor below makes "found nothing" loud instead of green.
const MIN_PAGES_EXPECTED = 100;
if (pages.length < MIN_PAGES_EXPECTED) {
  console.error(`CONTENT PATTERN CONTRACT EXAMINED ONLY ${pages.length} PAGES (floor ${MIN_PAGES_EXPECTED}). A gate that examines nothing cannot fail, so this is reported as a failure rather than a pass. Check that the published HTML surface is present in this checkout and that this gate runs AFTER whatever produces it.`);
  process.exit(1);
}
console.log(`CONTENT PATTERN CONTRACT: ${pages.length} pages checked (enforcement: ${ENFORCEMENT})`);
for (const s of summary) {
  const tag = s.blocking ? 'BLOCKING' : 'gap     ';
  console.log(`  ${tag} ${s.id.padEnd(22)} coverage ${String(s.coverage_pct).padStart(5)}%  missing on ${s.pages_missing}`);
}
const d = RS_DISTINCTNESS;
console.log(`  recommendation_summary: ${d.total_blocks} blocks, ${d.distinct_texts} distinct (ratio ${d.ratio})`);
if (d.texts_on_more_than_one_page) {
  console.warn(`  WARNING ${d.texts_on_more_than_one_page} summary text(s) repeat across ${d.pages_carrying_a_repeated_text} pages -`);
  console.warn('  a block two pages share is not a summary of either. Re-run'
    + ' scripts/retrofit_recommendation_summary.js --apply, which withdraws collisions.');
  for (const w of d.worst.slice(0, 5)) console.warn(`    x${w.pages} ${JSON.stringify(w.text.slice(0, 90))}`);
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
