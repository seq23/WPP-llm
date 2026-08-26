#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Retrofit a recommendation_summary block onto already-published source pages.
 *
 * recommendation_summary is the single most-requested block in the agent data:
 * .clarity/content-pattern-spec.json records it as asked for on 913 of 913
 * accepted recommendations, across every run. Before this script, coverage in
 * this repo was 0 of 3,190 pages.
 *
 * The extraction and the fold rules live in scripts/lib/recommendation_summary.js,
 * which the page generators call too. One implementation, so a retrofitted page
 * and a freshly generated page cannot drift apart.
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
const { applyRecommendationSummary } = require('./lib/recommendation_summary.js');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const WRITE_SCOPE = argv.includes('--write-scope');
const rootIdx = argv.indexOf('--root');
const ROOT = rootIdx >= 0 ? path.resolve(argv[rootIdx + 1]) : path.resolve(__dirname, '..');
const dirs = argv.filter((a, i) => !a.startsWith('--') && (rootIdx < 0 || i !== rootIdx + 1));

const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|\.pages-output|artifacts|coverage|_site|build|\.build|data|reports|logs|docs|releases)(\/|$)/;
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

const byStrategy = new Map();
const skipped = [];
const mutated = [];
for (const file of targets) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');
  const res = applyRecommendationSummary(html, { panelClass: process.env.RS_PANEL_CLASS });
  byStrategy.set(res.strategy, (byStrategy.get(res.strategy) || 0) + 1);
  if (!res.changed) {
    if (res.strategy === 'skip') skipped.push({ rel, reason: res.reason });
    continue;
  }
  mutated.push(rel);
  if (APPLY) fs.writeFileSync(file, res.html);
}

// Accepted output is frozen. Mutating it outside a declared scope is drift that
// the next build silently reverts, so name the exact routes up front and let
// the repo's own freeze tooling close the transaction afterwards.
if (WRITE_SCOPE) {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, contract.frozen_registry), 'utf8'));
  const routeByFile = new Map((registry.pages || []).map((p) => [p.rendered_file, p.route]));
  const routes = [...new Set(mutated.map((rel) => routeByFile.get(rel)).filter(Boolean))].sort();
  fs.writeFileSync(path.join(ROOT, contract.active_mutation_scope), `${JSON.stringify({
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    source: 'scripts/retrofit_recommendation_summary.js',
    reason: 'recommendation_summary retrofit (.clarity/content-pattern-spec.json)',
    routes,
  }, null, 2)}\n`);
  console.log(`freeze transaction opened for ${routes.length} accepted route(s) in ${contract.active_mutation_scope}`);
}

const changed = (byStrategy.get('hoist_lead') || 0) + (byStrategy.get('fold_fit') || 0) + (byStrategy.get('fold_steps') || 0);
console.log(`recommendation_summary: ${targets.length} source pages scanned (${APPLY ? 'APPLIED' : 'dry run'})`);
for (const key of ['hoist_lead', 'fold_fit', 'fold_steps', 'present', 'skip']) {
  if (byStrategy.get(key)) console.log(`  ${key.padEnd(11)} ${byStrategy.get(key)}`);
}
console.log(`  changed     ${changed}`);
if (skipped.length) {
  const groups = new Map();
  for (const s of skipped) groups.set(s.reason, (groups.get(s.reason) || []).concat(s.rel));
  console.log('\nno recommendation could be lifted from these pages - left unchanged rather than filled:');
  for (const [reason, files] of groups) {
    console.log(`  ${files.length}x ${reason}`);
    for (const f of files.slice(0, 12)) console.log(`      ${f}`);
    if (files.length > 12) console.log(`      ... and ${files.length - 12} more`);
  }
}
