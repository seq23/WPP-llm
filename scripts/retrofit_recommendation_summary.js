#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Derive a recommendation_summary block on already-published source pages.
 *
 * recommendation_summary is the single most-requested block in the agent data:
 * .clarity/content-pattern-spec.json records it as asked for on 913 of 913
 * accepted recommendations, across every run.
 *
 * The first pass of this script bought coverage and lost the point. It put a
 * block on 3,009 of 3,190 pages, but those 2,951 blocks contained 172 distinct
 * texts - a distinctness ratio of 0.06 - and the single worst string sat on 952
 * pages verbatim. A sentence that appears on 952 pages is not a summary of any
 * of them; at that scale it is a duplicate-content signal, not an asset.
 *
 * So this script now measures what it produces:
 *
 *   1. Derivation happens in scripts/lib/recommendation_summary.js, which the
 *      page generators call too. It refuses any candidate that is not tied to
 *      the page's own subject, and emits nothing rather than filler.
 *   2. Whatever survives derivation still has to be UNIQUE across the library.
 *      Two pages carrying the same block is the same failure in miniature, so
 *      every colliding block is withdrawn and reported. What ships is a set of
 *      blocks no two of which are the same text.
 *   3. Pages that end with no block are printed with the reason. That list is
 *      the honest output of this script, not a gap to be papered over.
 *
 * This walks SOURCE pages only. .pages-output/ is deploy output assembled by
 * scripts/assemble_pages_output.js and is regenerated, never hand-edited.
 *
 * Frozen routes: accepted output is protected by
 * scripts/authority_scale/frozen_outputs.mjs, so a mutation to an accepted page
 * must run inside the repo's transaction - prepare a scope, apply, re-freeze.
 * Running this with --apply outside that scope leaves drift the next build
 * reverts.
 *
 * Usage: node scripts/retrofit_recommendation_summary.js [--apply] [--write-scope] [--root DIR] [subdirs...]
 *        --write-scope opens the freeze transaction for exactly the accepted
 *        routes this run mutates, by writing data/release/active_mutation_scope.json.
 *        Run it, apply, rebuild, then `npm run authority:scale:freeze` and
 *        `npm run authority:scale:clear-scope` to close the transaction.
 * Env:   RS_PANEL_CLASS overrides the wrapper class (default: the page's own
 *        card/callout convention).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  applyRecommendationSummary,
  stripRecommendationSummary,
  recommendationSummaryText,
} = require('./lib/recommendation_summary.js');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const WRITE_SCOPE = argv.includes('--write-scope');
const rootIdx = argv.indexOf('--root');
const ROOT = rootIdx >= 0 ? path.resolve(argv[rootIdx + 1]) : path.resolve(__dirname, '..');
const dirs = argv.filter((a, i) => !a.startsWith('--') && (rootIdx < 0 || i !== rootIdx + 1));

// data/, reports/ and content/ are INPUTS - agent evidence, validator evidence,
// and the markdown the insights build reads. A retrofit that wrote into them
// once corrupted raw agent evidence, so they stay refused here permanently.
// content/ holds no .html today; it is listed so that stops being the reason.
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|\.pages-output|artifacts|coverage|_site|build|\.build|data|reports|content|logs|docs|releases)(\/|$)/;
// Operator and utility surfaces answer no search query and recommend nothing.
const SKIP_FILES = new Set(['admin/index.html', '404.html', 'privacy.html', 'terms.html', 'disclaimer.html']);

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.name.startsWith('.') || SKIP_DIR.test(`/${path.relative(ROOT, full)}`)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const targets = (dirs.length ? dirs : ['.']).flatMap((d) => walk(path.resolve(ROOT, d)))
  .filter((f) => !SKIP_FILES.has(path.relative(ROOT, f)))
  .sort();

const COLLIDED = 'the only recommendation this page could derive is one another page derives too';
const links = (html) => (String(html).match(/<a\s[^>]*href/gi) || []).length;

// Pass 1: derive.
const derived = [];
const byText = new Map();
for (const file of targets) {
  const rel = path.relative(ROOT, file);
  const before = fs.readFileSync(file, 'utf8');
  const res = applyRecommendationSummary(before, { panelClass: process.env.RS_PANEL_CLASS });
  const text = recommendationSummaryText(res.html);
  const row = { rel, file, before, after: res.html, strategy: res.strategy, reason: res.reason, text };
  derived.push(row);
  if (text) byText.set(text, (byText.get(text) || 0) + 1);
}

// Pass 2: a block two pages share is not a summary of either. Withdraw both.
let collisions = 0;
for (const row of derived) {
  if (!row.text || byText.get(row.text) === 1) continue;
  row.after = stripRecommendationSummary(row.after);
  row.text = null;
  row.strategy = 'withdrawn';
  row.reason = COLLIDED;
  collisions += 1;
}

// Pass 3: write, and refuse to ship a page that lost a link on the way through.
const byStrategy = new Map();
const withoutBlock = [];
const mutated = [];
const linkLoss = [];
for (const row of derived) {
  byStrategy.set(row.strategy, (byStrategy.get(row.strategy) || 0) + 1);
  if (!row.text) withoutBlock.push(row);
  if (row.after === row.before) continue;
  if (links(row.after) < links(row.before)) {
    linkLoss.push(`${row.rel} (${links(row.before)} -> ${links(row.after)})`);
    continue;
  }
  mutated.push(row.rel);
  if (APPLY) fs.writeFileSync(row.file, row.after);
}

// Accepted output is frozen. Mutating it outside a declared scope is drift that
// the next build silently reverts, so name the exact routes up front and let
// the repo's own freeze tooling close the transaction afterwards.
if (WRITE_SCOPE) {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, contract.frozen_registry), 'utf8'));
  const routeByFile = new Map((registry.pages || []).map((p) => [p.rendered_file, p.route]));
  // A transaction can span more than one pass - derive, rebuild, re-derive - so
  // the scope accumulates rather than replacing what an earlier pass declared.
  // Dropping a route another pass already mutated would turn it into unscoped
  // drift and fail the freeze.
  const scopeFile = path.join(ROOT, contract.active_mutation_scope);
  const open = fs.existsSync(scopeFile) ? (JSON.parse(fs.readFileSync(scopeFile, 'utf8')).routes || []) : [];
  const routes = [...new Set(open.concat(mutated.map((rel) => routeByFile.get(rel)).filter(Boolean)))].sort();
  fs.writeFileSync(scopeFile, `${JSON.stringify({
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    source: 'scripts/retrofit_recommendation_summary.js',
    reason: 'recommendation_summary re-derivation (.clarity/content-pattern-spec.json)',
    routes,
  }, null, 2)}\n`);
  console.log(`freeze transaction opened for ${routes.length} accepted route(s) in ${contract.active_mutation_scope}`);
}

const blocks = derived.filter((r) => r.text);
const distinct = new Set(blocks.map((r) => r.text)).size;
console.log(`recommendation_summary: ${targets.length} source pages scanned (${APPLY ? 'APPLIED' : 'dry run'})`);
for (const key of ['hoist_lead', 'fold_fit', 'fold_steps', 'withdrawn', 'skip']) {
  if (byStrategy.get(key)) console.log(`  ${key.padEnd(11)} ${byStrategy.get(key)}`);
}
console.log(`  changed     ${mutated.length}`);
console.log(`  blocks      ${blocks.length} (${(blocks.length / targets.length * 100).toFixed(1)}% of pages)`);
console.log(`  distinct    ${distinct} texts -> distinctness ratio ${(distinct / (blocks.length || 1)).toFixed(4)}`);
console.log(`  collisions  ${collisions} block(s) withdrawn for being identical to another page's`);

if (linkLoss.length) {
  console.error(`\nREFUSED: ${linkLoss.length} page(s) would have lost a link and were left unchanged:`);
  for (const l of linkLoss.slice(0, 20)) console.error(`  ${l}`);
}

if (withoutBlock.length) {
  const groups = new Map();
  for (const r of withoutBlock) groups.set(r.reason, (groups.get(r.reason) || []).concat(r.rel));
  console.log(`\n${withoutBlock.length} page(s) ship no recommendation_summary. Nothing on them recommends anything`);
  console.log('specific to them, and a block repeated from a neighbour would be worse than none:');
  for (const [reason, files] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${files.length}x ${reason}`);
    for (const f of files.slice(0, 12)) console.log(`      ${f}`);
    if (files.length > 12) console.log(`      ... and ${files.length - 12} more`);
  }
}

if (linkLoss.length) process.exit(1);
