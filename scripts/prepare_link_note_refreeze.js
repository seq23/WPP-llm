#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * First step of `npm run link-notes:refreeze`, the EXACT_ROUTE_THAW_VALIDATE_REFREEZE
 * the freeze contract asks for when an at-source fix changes accepted output.
 *
 * WHY
 * ---
 * `scripts/build_link_architecture.js` writes the note beside every link in a
 * hub list, a related-links block and a neighbours block. It used to print a
 * truncation of the target's own meta description, and every member of a cluster
 * shares that sentence's shape and its topic terms, so one sentence appeared on
 * every row - which the Search Readiness q1 sample reads as template filler.
 * The note is now built from the target's slug suffix and de-duplicated per
 * page.
 *
 * Those notes live inside published, hash-locked HTML. A normal build rewrites
 * the regions and then `authority:scale:restore` puts the frozen copy back, so
 * the fix never reaches the page unless its route is thawed first.
 *
 * THE THAW LIST
 * -------------
 * Exactly the frozen routes whose rendered HTML carries a note region
 * (`<span class="hub-note">`) - which is precisely the set whose notes this fix
 * rewrites. A page with no note region is not thawed, so a route this fix cannot
 * change cannot drift under cover of it. `authority:scale:freeze` refuses any
 * unscoped drift, so a route this step misses stops the release rather than
 * slipping through.
 *
 * RULE 0: a run that would thaw nothing exits non-zero rather than quietly
 * writing an empty scope and reporting success.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NOTE_REGION = '<span class="hub-note">';

const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
const frozen = JSON.parse(fs.readFileSync(path.join(ROOT, contract.frozen_registry), 'utf8')).pages || [];

const routes = [];
let missing = 0;
for (const p of frozen) {
  const abs = p.rendered_file ? path.join(ROOT, p.rendered_file) : null;
  if (!abs || !fs.existsSync(abs)) { missing += 1; continue; }
  if (fs.readFileSync(abs, 'utf8').includes(NOTE_REGION)) routes.push(p.route);
}

if (!routes.length) {
  console.error('link-notes:refreeze: no frozen page carries a link note region; refusing to write an empty scope.');
  process.exit(1);
}

// A scope file that already exists is an open thaw transaction (for example
// npm run stance:refreeze); its routes are kept, not replaced.
const scopeAbs = path.join(ROOT, contract.active_mutation_scope);
const open = fs.existsSync(scopeAbs) ? (JSON.parse(fs.readFileSync(scopeAbs, 'utf8')).routes || []) : [];
const allRoutes = [...new Set([...open, ...routes])].sort();
fs.writeFileSync(scopeAbs, `${JSON.stringify({
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  source: 'scripts/prepare_link_note_refreeze.js (Search Readiness q1)',
  routes: allRoutes,
}, null, 2)}\n`);

console.log(`link-notes:refreeze: ${routes.length} frozen route(s) carry a link note and are now thawed (${allRoutes.length} route(s) in scope); ${missing} frozen route(s) had no rendered file.`);
