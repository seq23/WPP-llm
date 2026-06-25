#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'logs', 'deep-validation');
fs.mkdirSync(LOG_DIR, { recursive: true });
const commands = [
  ['strategy-gate', 'node scripts/validate_strategy_gate.js'],
  ['master-plan-completion', 'node scripts/validate_master_plan_completion.js'],
  ['validator-registry', 'node scripts/validate_validator_registry.js'],
  ['canonical-routes', 'node scripts/validate_canonical_routes.js'],
  ['priority-pages', 'node scripts/validate_priority_pages.js'],
  ['homepage-ctas', 'node scripts/validate_homepage_ctas.js'],
  ['backlink-remediation', 'node scripts/validate_backlink_remediation.js'],
  ['release-plan', 'node scripts/validate_release_plan.js'],
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
