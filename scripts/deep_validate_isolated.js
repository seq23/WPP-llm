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
  ['strategy-gate', 'node scripts/validate_strategy_gate.js'],
  ['master-plan-completion', 'node scripts/validate_master_plan_completion.js'],
  ['validator-registry', 'node scripts/validate_validator_registry.js'],
  ['canonical-routes', 'node scripts/validate_canonical_routes.js'],
  ['priority-pages', 'node scripts/validate_priority_pages.js'],
  ['homepage-ctas', 'node scripts/validate_homepage_ctas.js'],
  ['backlink-remediation', 'node scripts/validate_backlink_remediation.js'],
  ['release-plan', 'node scripts/validate_release_plan.js'],
  ['atom-contract', 'node scripts/validators/validate_atom_contract.js'],
  ['page-family-contract', 'node scripts/validators/validate_page_family_contract.js'],
  ['page-admission', 'node scripts/validators/validate_page_admission.js'],
  ['query-atlas', 'node scripts/validate_query_atlas.js'],
  ['programmatic-engine', 'node scripts/validate_programmatic_release_engine.js'],
  ['workflow-data-trace', 'node scripts/validators/validate_workflow_data_trace.js'],
  ['citation-goal-sizing', 'node scripts/validators/validate_master_contract_pipeline.js citation-goal-sizing'],
  ['free-aeo-mode-contract', 'node scripts/validators/validate_master_contract_pipeline.js free-aeo-mode-contract'],
  ['programmatic-release-contract', 'node scripts/validators/validate_master_contract_pipeline.js programmatic-release-contract'],
  ['citation-intelligence-contract', 'node scripts/validators/validate_master_contract_pipeline.js citation-intelligence-contract'],
  ['agent-run-artifact-intake', 'node scripts/validators/validate_master_contract_pipeline.js agent-run-artifact-intake'],
  ['normalized-agent-run-schema', 'node scripts/validators/validate_master_contract_pipeline.js normalized-agent-run-schema'],
  ['release-plan-integrity', 'node scripts/validators/validate_master_contract_pipeline.js release-plan-integrity'],
  ['content-release-trace', 'node scripts/validators/validate_master_contract_pipeline.js content-release-trace'],
  ['page-release-law', 'node scripts/validators/validate_master_contract_pipeline.js page-release-law'],
  ['generated-content-gate', 'node scripts/validators/validate_master_contract_pipeline.js generated-content-gate'],
  ['programmatic-substance', 'node scripts/validators/validate_master_contract_pipeline.js programmatic-substance'],
  ['canonical-routing-law', 'node scripts/validators/validate_master_contract_pipeline.js canonical-routing-law'],
  ['search-quality-basics', 'node scripts/validators/validate_master_contract_pipeline.js search-quality-basics'],
  ['sitemap-parity', 'node scripts/validators/validate_master_contract_pipeline.js sitemap-parity'],
  ['content-safety', 'node scripts/validators/validate_master_contract_pipeline.js content-safety'],
  ['strategy-integrity-contract', 'node scripts/validators/validate_master_contract_pipeline.js strategy-integrity-contract'],
  ['deterministic-build', 'node scripts/validators/validate_master_contract_pipeline.js deterministic-build'],
  ['repo-hygiene', 'node scripts/validators/validate_master_contract_pipeline.js repo-hygiene'],
  ['insights', 'node scripts/validate_insights.js'],
  ['fanout', 'node scripts/validate_fanout_warning.js'],
  ['answer-coverage', 'node scripts/validate_answer_coverage.js'],
  ['entity-coverage', 'node scripts/validate_entity_coverage.js'],
  ['internal-links', 'node scripts/validate_internal_links.js'],
  ['sitemap-coverage', 'node scripts/validate_sitemap_coverage.js']
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
