#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: a data/seo/demand_families.json that is stale or inconsistent with
 * data/seo/measured_targets.json.
 *
 *   - fresh: rebuilding from the current measured targets and family rules
 *     (scripts/build_demand_families.js) gives exactly the committed file;
 *   - consistent: every measured query is in exactly one family, the family
 *     impressions add up to the measured total, and top12 is the twelve
 *     highest-impression eligible families in order;
 *   - every family landing page still resolves (a page, or a redirect to a
 *     page): measured URLs never 404.
 *
 * WHY. 11 Oct 2026: 482 measured queries and 7,288 impressions, but the
 * strengthening pass only saw the 28-day window. The families are what the
 * strengthening sweep and the demand pages are chosen from; a stale or partial
 * family file would quietly point both at the wrong pages.
 *
 * RULE 0: zero targets or zero families is a failure, not a pass.
 */
const fs = require('fs');
const path = require('path');
const { build, OUT, TOP_N } = require('../build_demand_families.js');

const ROOT = path.resolve(__dirname, '../..');
const errors = [];
const file = path.join(ROOT, OUT);
if (!fs.existsSync(file)) { console.error(`demand families FAILED: ${OUT} missing; run npm run seo:demand-families`); process.exit(1); }
const committed = JSON.parse(fs.readFileSync(file, 'utf8'));
const mt = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seo/measured_targets.json'), 'utf8'));
const targets = mt.targets || [];
const fams = committed.families || [];

if (!targets.length) errors.push('measured_targets.json has zero targets; nothing to group');
if (!fams.length) errors.push('demand_families.json has zero families');

if (committed.measured_targets_generated_at !== mt.generated_at) errors.push(`stale: built from measured targets of ${committed.measured_targets_generated_at}, current is ${mt.generated_at}`);
const fresh = build(ROOT);
if (JSON.stringify(fresh) !== JSON.stringify(committed)) {
  const diff = (fresh.families || []).find((f, i) => JSON.stringify(f) !== JSON.stringify(fams[i]));
  errors.push(`stale: a rebuild differs from the committed file${diff ? ` (first difference: family "${diff.family}")` : ''}; run npm run seo:demand-families`);
}

const seen = new Map();
for (const f of fams) for (const q of f.queries || []) seen.set(q.query, (seen.get(q.query) || 0) + 1);
for (const t of targets) {
  const n = seen.get(t.query) || 0;
  if (n !== 1) errors.push(`query "${t.query}" is in ${n} families; must be exactly 1`);
}
for (const q of seen.keys()) if (!targets.some((t) => t.query === q)) errors.push(`family query "${q}" is not a measured target`);
const total = targets.reduce((a, t) => a + Number(t.impressions || 0), 0);
const famTotal = fams.reduce((a, f) => a + Number(f.impressions || 0), 0);
if (famTotal !== total || committed.impressions_total !== total) errors.push(`impressions do not add up: families ${famTotal}, file total ${committed.impressions_total}, measured ${total}`);
for (const f of fams) {
  const sum = (f.queries || []).reduce((a, q) => a + Number(q.impressions || 0), 0);
  if (sum !== f.impressions) errors.push(`${f.family}: impressions ${f.impressions} but its queries sum to ${sum}`);
  for (const lp of f.landing_pages || []) if (!lp.resolves_to) errors.push(`${f.family}: measured landing page ${lp.page} resolves to nothing (404)`);
  if (f.top12 && !f.primary_route) errors.push(`${f.family}: top-12 family without a primary route`);
}
const eligible = fams.filter((f) => f.eligible_for_strengthening).sort((a, b) => b.impressions - a.impressions);
const want = eligible.slice(0, TOP_N).map((f) => f.family);
if (JSON.stringify(want) !== JSON.stringify(committed.top12)) errors.push(`top12 is not the ${TOP_N} highest-impression eligible families: want ${want.join(', ')}`);
if ((committed.top12 || []).length !== Math.min(TOP_N, eligible.length)) errors.push(`top12 lists ${(committed.top12 || []).length} families`);

if (errors.length) { console.error(`demand families FAILED (${errors.length}):\n- ${errors.slice(0, 30).join('\n- ')}`); process.exit(1); }
console.log(`demand families OK: ${targets.length} measured queries, ${total} impressions, ${fams.length} families, each query in exactly one; fresh against measured targets of ${mt.generated_at}; top 12 = ${committed.top12.join(', ')}.`);
