#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: a duplicate-family consolidation that is only half true.
 *
 * data/seo/duplicate_family_consolidation.json says which /programmatic/
 * variants (Google: "Duplicate, Google chose different canonical than user",
 * canonical = the homepage) were merged into which indexed family page. Each of
 * these must hold, or one component is keeping a list the others disagree with:
 *   - every retired variant has no rendered page, a `<from> <keeper> 301` line in
 *     _redirects, every admission row `consolidated` with redirect_to = keeper,
 *     a `retired` entry in the freeze registry and no `pages` entry there;
 *   - every keeper is a rendered, admitted, frozen page that is not itself a
 *     redirect source, and carries its merged answers;
 *   - the committed release plan has no unit in a paused family;
 *   - no route on the thin ledger (data/seo/consolidation_candidates.json, re-read
 *     2 Nov 2026) was used as a keeper or retired.
 *
 * RULE 0: a ledger with no families or no retired variants fails.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, parseRedirects } = require('../lib/pages_routing.js');
const fam = require('../lib/consolidated_families.js');

const readJson = (rel, d) => (fs.existsSync(path.join(ROOT, rel)) ? JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) : d);
const ledger = fam.load();
const rules = fam.redirectRules(ledger);
const errors = [];
if (!(ledger.families || []).length || !rules.length) {
  console.error('duplicate-family-consolidation: the ledger has no families or no retired variants; nothing was examined.');
  process.exit(1);
}
if (ledger.consolidated_count !== rules.length) errors.push(`ledger consolidated_count ${ledger.consolidated_count} != ${rules.length} merged routes`);

const fileOf = (r) => path.join(ROOT, `${r.replace(/^\//, '')}.html`);
const redirects = new Map(parseRedirects(ROOT).map((r) => [r.from, r]));
const admissions = readJson('data/content/page_admission_registry.json', { admissions: [] }).admissions;
const rows = new Map();
for (const a of admissions) { if (!rows.has(a.route)) rows.set(a.route, []); rows.get(a.route).push(a); }
const registry = readJson('data/release/frozen_output_registry.json', { pages: [], retired: [] });
const frozen = new Set((registry.pages || []).map((p) => p.route));
const retired = new Map((registry.retired || []).map((p) => [p.route, p]));
const thin = new Set(JSON.stringify(readJson('data/seo/consolidation_candidates.json', {})).match(/\/programmatic\/[a-z0-9-]+/g) || []);
const keepers = new Set();

for (const f of ledger.families) {
  const k = f.keeper;
  keepers.add(k);
  if (!fs.existsSync(fileOf(k))) { errors.push(`keeper ${k}: no rendered page`); continue; }
  if (!(rows.get(k) || []).some((a) => a.status === 'admitted')) errors.push(`keeper ${k}: not admitted`);
  if (!frozen.has(k)) errors.push(`keeper ${k}: not in the freeze registry`);
  if (redirects.has(k)) errors.push(`keeper ${k}: is itself a redirect source`);
  if (thin.has(k)) errors.push(`keeper ${k}: is on the thin ledger, which is not touched before 2 Nov 2026`);
  const html = fs.readFileSync(fileOf(k), 'utf8');
  const blocks = (html.match(/<!--consolidated:answers-->/g) || []).length;
  if (f.merged_answers > 0 && blocks !== 1) errors.push(`keeper ${k}: expected one merged-answers block, found ${blocks}`);
}
for (const r of rules) {
  if (keepers.has(r.from)) errors.push(`${r.from}: both a keeper and retired`);
  if (fs.existsSync(fileOf(r.from))) errors.push(`${r.from}: retired but still rendered`);
  const line = redirects.get(r.from);
  if (!line || line.to !== r.to || line.status !== 301) errors.push(`${r.from}: _redirects has ${line ? `${line.to} ${line.status}` : 'no rule'}, ledger says ${r.to} 301`);
  const rs = rows.get(r.from) || [];
  if (rs.length && rs.some((a) => a.status !== 'consolidated' || a.redirect_to !== r.to)) errors.push(`${r.from}: an admission row is not consolidated to ${r.to}`);
  if (frozen.has(r.from)) errors.push(`${r.from}: retired but still a frozen page`);
  if (rs.length && retired.get(r.from)?.redirect_to !== r.to) errors.push(`${r.from}: freeze registry has no retired entry to ${r.to}`);
  if (thin.has(r.from)) errors.push(`${r.from}: is on the thin ledger, which is not touched before 2 Nov 2026`);
}
const plan = readJson('data/releases/daily_release_plan.json', { units: [] });
const prefixes = fam.pausedPrefixes(ledger);
for (const u of plan.units || []) if (fam.isPaused(u.target_route, prefixes)) errors.push(`release plan unit ${u.target_route} is in a paused family`);

if (errors.length) {
  console.error(`duplicate-family-consolidation: ${errors.length} problem(s):`);
  for (const e of errors.slice(0, 50)) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`duplicate-family-consolidation: ${ledger.families.length} keepers, ${rules.length} retired variants, ${prefixes.length} paused families; redirects, admissions, freeze registry and release plan agree.`);
