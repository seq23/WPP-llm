#!/usr/bin/env node
const { spawnSync } = require('child_process');
const checks = ['release-plan-integrity','content-release-trace','page-release-law','generated-content-gate','programmatic-substance'];
for (const id of checks) {
  const r = spawnSync('node', ['scripts/validators/validate_master_contract_pipeline.js', id], {stdio:'inherit'});
  if (r.status) process.exit(r.status);
}
console.log('Release validation OK');
