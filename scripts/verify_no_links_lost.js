#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Prove that a link-architecture change only added.
 *
 * Adding breadcrumbs and sibling blocks to 3,052 generated pages is a bulk
 * rewrite, and the failure mode of a bulk rewrite is silent subtraction: a
 * regex that eats one character too many, an insertion point that lands inside
 * an existing element, a template that replaces a section instead of following
 * it. None of that shows up in a link-count total, because the total went up.
 *
 * So this compares every HTML file against a git ref, per file, and fails if
 * any file lost an href it used to have or lost visible text it used to show.
 * Additions are expected and ignored; only removals are errors.
 *
 * Visible text is compared as a multiset of words after stripping script,
 * style and tags, so re-ordering is allowed but disappearance is not.
 *
 * Usage:
 *   node scripts/verify_no_links_lost.js <git-ref> [--limit N]
 *   node scripts/verify_no_links_lost.js HEAD~1
 *
 * Exits non-zero on any loss, with the file and what went missing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ref = process.argv[2];
if (!ref) { console.error('usage: verify_no_links_lost.js <git-ref>'); process.exit(2); }
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

function git(argv) {
  return execFileSync('git', argv, { cwd: ROOT, maxBuffer: 1 << 28, encoding: 'utf8' });
}

const tracked = git(['ls-tree', '-r', '--name-only', ref])
  .split('\n').filter((f) => f.endsWith('.html'));

const hrefs = (html) => (html.match(/href=["']([^"']+)["']/gi) || []).map((s) => s.slice(6, -1));
const words = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

function multiset(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

const hrefProblems = [];
const textProblems = [];
let checked = 0; let deleted = 0; let addedHrefs = 0; let addedWords = 0;

for (const rel of tracked) {
  if (checked >= LIMIT) break;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { deleted += 1; hrefProblems.push(`DELETED FILE ${rel}`); continue; }
  let before;
  try { before = git(['show', `${ref}:${rel}`]); } catch { continue; }
  const after = fs.readFileSync(abs, 'utf8');
  checked += 1;
  if (before === after) continue;

  const hb = multiset(hrefs(before));
  const ha = multiset(hrefs(after));
  for (const [href, n] of hb) {
    const m = ha.get(href) || 0;
    if (m < n) hrefProblems.push(`${rel}: lost href ${JSON.stringify(href)} (${n} -> ${m})`);
  }
  for (const [href, n] of ha) addedHrefs += Math.max(0, n - (hb.get(href) || 0));

  const wb = multiset(words(before));
  const wa = multiset(words(after));
  for (const [w, n] of wb) {
    const m = wa.get(w) || 0;
    if (m < n) textProblems.push(`${rel}: lost visible text "${w}" (${n} -> ${m})`);
  }
  for (const [w, n] of wa) addedWords += Math.max(0, n - (wb.get(w) || 0));
}

const textFiles = [...new Set(textProblems.map((p) => p.split(':')[0]))];
console.log(JSON.stringify({
  ref, files_compared: checked, files_deleted: deleted,
  hrefs_added: addedHrefs, visible_words_added: addedWords,
  href_losses: hrefProblems.length,
  visible_text_losses: textProblems.length,
  files_with_visible_text_loss: textFiles.length,
}, null, 2));

if (textProblems.length) {
  console.error(`\nVISIBLE TEXT REMOVED on ${textFiles.length} file(s):`);
  for (const f of textFiles.slice(0, 40)) console.error(`- ${f}`);
  for (const p of textProblems.slice(0, 20)) console.error(`  ${p}`);
}
if (hrefProblems.length) {
  console.error(`\nHREF LOSS (${hrefProblems.length}):`);
  for (const p of hrefProblems.slice(0, 60)) console.error(`- ${p}`);
}
if (hrefProblems.length || textProblems.length) process.exit(1);
console.log('No page lost an href or a word of visible text.');
