#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: a _redirects rule that sends a visitor or crawler anywhere but a page
 * this build publishes, in one hop.
 *
 *   - every internal 301/302/308 target must resolve to a page (not missing);
 *   - no target may itself redirect (a chain), whether through another
 *     _redirects rule or through Pages' own .html / trailing-slash 308s;
 *   - every legacy rule in data/redirects/legacy_404_redirects.json must be
 *     present in _redirects exactly, and its source must not be a live page
 *     (a rule there would shadow real content).
 *
 * Why: /virtual-event-production-for-nonprofit pointed at a page no build had
 * published, so it was a 301 into a 404 for as long as anyone can tell. And the
 * 55 URLs Bing still held as 404 on 25 Sep 2026 are now 301s whose value is
 * entirely that they land somewhere real.
 *
 * Resolution comes from scripts/lib/pages_routing.js, shared with
 * validate_no_redirecting_internal_links.js.
 *
 * RULE 0: zero redirect rules or zero legacy entries means there is nothing to
 * check, which is a failure rather than a pass.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, parseRedirects, resolvePath } = require('../lib/pages_routing.js');

const rules = parseRedirects(ROOT);
const legacyPath = path.join(ROOT, 'data/redirects/legacy_404_redirects.json');
const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8')).rules || [];

if (!rules.length) {
  console.error('REDIRECT TARGET VALIDATION FOUND NO RULES IN _redirects. Run it after scripts/update_redirects_clean_to_html.js.');
  process.exit(1);
}
if (!legacy.length) {
  console.error('REDIRECT TARGET VALIDATION FOUND NO ENTRIES IN data/redirects/legacy_404_redirects.json.');
  process.exit(1);
}

const problems = [];
let internal = 0;
for (const r of rules) {
  if (![301, 302, 307, 308].includes(r.status)) continue;
  if (!r.to.startsWith('/')) continue; // off-site (westpeekproductions.com) is not ours to resolve
  internal += 1;
  const target = r.to.split(/[?#]/)[0];
  const res = resolvePath(target, { root: ROOT, rules });
  if (res.kind === 'missing') problems.push(`_redirects line ${r.line}: ${r.from} -> ${r.to} lands on nothing this build publishes (a redirect into a 404)`);
  else if (res.kind === 'redirect') problems.push(`_redirects line ${r.line}: ${r.from} -> ${r.to} is a chain; ${r.to} itself goes ${res.status} to ${res.to} (${res.via}). Point it at the final URL.`);
}

const present = new Map(rules.map((r) => [r.from, r]));
for (const e of legacy) {
  const r = present.get(e.from);
  if (!r) { problems.push(`legacy rule ${e.from} -> ${e.to} is in data/redirects/legacy_404_redirects.json but not in _redirects`); continue; }
  if (r.to !== e.to || r.status !== 301) problems.push(`legacy rule ${e.from}: _redirects says ${r.to} ${r.status}, data says ${e.to} 301`);
  if (!e.why) problems.push(`legacy rule ${e.from} has no reason recorded`);
  const shadow = resolvePath(e.from, { root: ROOT, rules: [] });
  if (shadow.kind === 'page') problems.push(`legacy rule ${e.from} shadows a live page; remove the rule or the page`);
}

if (problems.length) {
  console.error(`Redirect target violations (${problems.length}):`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}

console.log(`Redirect targets OK: ${internal} internal redirect rules each land on a published page in one hop; ${legacy.length} legacy 404 rules present and not shadowing live pages.`);
