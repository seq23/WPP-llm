#!/usr/bin/env node
// entity:converge - make every published page state data/entity/entity.json.
//
// The entity facts sit inside hash-locked pages (data/release/frozen_output_registry.json),
// so an edit to entity.json cannot reach them through a normal build: the build's
// restore step puts the accepted bytes back. This is the repo's own
// EXACT_ROUTE_THAW_VALIDATE_REFREEZE policy, applied to the entity facts only:
//   1. thaw: every frozen route goes into the active mutation scope;
//   2. apply: scripts/apply_organization_entity.mjs rewrites sameAs/description
//      (nothing else on the page changes);
//   3. validate: validate_entity_graph.mjs must pass;
//   4. refreeze the pages that changed, then clear the scope.
// Run by hand after editing entity.json, and by entity-backlink-watch.yml after
// the watch self-heals entity.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, contract.frozen_registry), 'utf8'));
const routes = [...new Set((registry.pages || []).map((p) => p.route))].sort();
if (!routes.length) { console.error('[entity-converge] FAILED: frozen registry lists no routes'); process.exit(1); }

const scopePath = path.join(ROOT, contract.active_mutation_scope);
fs.writeFileSync(scopePath, JSON.stringify({ schema_version: '1.0', generated_at: new Date().toISOString(),
  source: 'scripts/entity_converge.mjs (entity facts only)', routes }, null, 2) + '\n');
const run = (...args) => execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
try {
  run('scripts/apply_organization_entity.mjs');
  run('scripts/validators/validate_entity_graph.mjs');
  run('scripts/authority_scale/frozen_outputs.mjs', 'freeze');
} finally {
  run('scripts/authority_scale/frozen_outputs.mjs', 'clear-scope');
}
console.log(`[entity-converge] OK: ${routes.length} frozen route(s) thawed, entity facts applied, refrozen, scope cleared`);
