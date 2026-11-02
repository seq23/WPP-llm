#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * First step of `npm run platform-proof:refreeze` (EXACT_ROUTE_THAW_VALIDATE_REFREEZE
 * for the westpeek.live proof line, scripts/lib/platform_proof.js).
 *
 * For each hash-locked page whose topic is a virtual / online / hybrid conference,
 * summit or event and that does not yet carry the line, it thaws exactly that
 * route (data/release/active_mutation_scope.json) and adds the line to the
 * accepted page with the same applyPlatformProof() the build uses, and nothing
 * else: a full build over a thawed page would also pull in every unrelated
 * generator change made since it was accepted. Then: apply_site_head (the
 * pages the build already owns) -> freeze (accept the new hashes) -> clear-scope.
 * authority:scale:freeze refuses any unscoped drift.
 *
 * The thaw list comes from platformProofFiles(), the same function the build uses,
 * so the two cannot disagree. RULE 0: zero matching pages exits non-zero.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, frozenFiles, routeFor } = require('./lib/site_head.js');
const { platformProofFiles, applyPlatformProof, START } = require('./lib/platform_proof.js');

const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
const want = platformProofFiles(ROOT);
if (!want.size) {
  console.error('platform-proof:refreeze: zero pages have a virtual / online / hybrid conference, summit or event topic; the topic sources are unreadable. Refusing to write an empty scope.');
  process.exit(1);
}
const frozen = frozenFiles();
const todo = [...want].filter((rel) => frozen.has(rel) && !fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(START));
for (const rel of todo) {
  const abs = path.join(ROOT, rel);
  fs.writeFileSync(abs, applyPlatformProof(fs.readFileSync(abs, 'utf8'), rel, true));
}
const routes = todo.map(routeFor).sort();

const scopeAbs = path.join(ROOT, contract.active_mutation_scope);
const open = fs.existsSync(scopeAbs) ? (JSON.parse(fs.readFileSync(scopeAbs, 'utf8')).routes || []) : [];
const allRoutes = [...new Set([...open, ...routes])].sort();
fs.writeFileSync(scopeAbs, `${JSON.stringify({
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  source: 'scripts/lib/platform_proof.js (westpeek.live proof line)',
  routes: allRoutes,
}, null, 2)}\n`);
console.log(`platform-proof:refreeze: ${want.size} matching page(s), ${routes.length} hash-locked and now thawed (${allRoutes.length} route(s) in scope).`);
