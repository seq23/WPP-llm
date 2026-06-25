#!/usr/bin/env node
const { spawnSync } = require('child_process');
const r = spawnSync('node', ['scripts/validators/validate_master_contract_pipeline.js', 'agent-run-artifact-intake'], {stdio:'inherit'});
process.exit(r.status || 0);
