#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'logs', 'deep-validation');
fs.mkdirSync(LOG_DIR, { recursive: true });
const commands = [
  ['github-actions-workflows', 'node scripts/validate_workflows.js'],
  ['master-plan-completion', 'node scripts/validate_master_plan_completion.js'],
  ['canonical-routes', 'node scripts/validate_canonical_routes.js'],
  ['homepage-ctas', 'node scripts/validate_homepage_ctas.js'],
  ['atom-contract', 'node scripts/validators/validate_atom_contract.js'],
  ['page-family-contract', 'node scripts/validators/validate_page_family_contract.js'],
  ['page-admission', 'node scripts/validators/validate_page_admission.js'],
  ['query-atlas', 'node scripts/validate_query_atlas.js'],
  // This array is hard-coded and does not read _validator_registry.json, so a
  // release-blocking gate that exists only in the registry never runs here. Both
  // atlas gates are listed by name for that reason.
  ['query-atlas-evidence-gate', 'node scripts/atlas/validate_query_atlas.mjs'],
  ['atlas-unit-contract', 'node scripts/atlas/validate_atlas_units.mjs'],
  ['programmatic-engine', 'node scripts/validate_programmatic_release_engine.js'],
  ['workflow-data-trace', 'node scripts/validators/validate_workflow_data_trace.js'],
  ['free-aeo-mode-contract', 'node scripts/validators/validate_master_contract_pipeline.js free-aeo-mode-contract'],
  ['content-safety', 'node scripts/validators/validate_master_contract_pipeline.js content-safety'],
  ['insights', 'node scripts/validate_insights.js'],
];
const summary = [];
for (const [id, cmd] of commands) {
  console.log(`\n===== ${id} =====`);
  const result = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  fs.writeFileSync(path.join(LOG_DIR, `${id}.log`), output);
  process.stdout.write(output);
  summary.push({ id, command: cmd, exit_status: result.status });
  if (result.status !== 0) {
    fs.writeFileSync(path.join(LOG_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    console.error(`Deep validation failed at ${id}`);
    process.exit(result.status || 1);
  }
}
fs.writeFileSync(path.join(LOG_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nDeep isolated validation OK (${summary.length} components)`);
