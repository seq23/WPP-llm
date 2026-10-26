'use strict';
/**
 * One reader for data/seo/duplicate_family_consolidation.json, shared by the
 * release plan (pause), the _redirects emitter (301s) and their validator, so
 * the three cannot keep different lists.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LEDGER = path.join(ROOT, 'data/seo/duplicate_family_consolidation.json');

function load() {
  if (!fs.existsSync(LEDGER)) return { families: [] };
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}

// Every retired variant -> its keeper, as 301 rules.
function redirectRules(ledger = load()) {
  const rules = [];
  for (const f of ledger.families || []) for (const m of f.merged || []) rules.push({ from: m.route, to: f.keeper, status: 301 });
  return rules.sort((a, b) => a.from.localeCompare(b.from));
}

// The release lane is paused for every consolidated family: no create may
// bring a retired URL back, and no repair may rewrite a keeper under its merge.
function pausedPrefixes(ledger = load()) {
  return [...new Set((ledger.families || []).map((f) => f.pause_prefix).filter(Boolean))].sort();
}

function isPaused(route, prefixes = pausedPrefixes()) {
  const r = String(route || '').replace(/\/+$/, '');
  if (!r.startsWith('/programmatic/')) return false;
  const slug = r.slice('/programmatic/'.length);
  return prefixes.some((p) => slug === p || slug.startsWith(`${p}-`));
}

module.exports = { LEDGER, load, redirectRules, pausedPrefixes, isPaused };
