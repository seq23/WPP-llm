#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
if (process.env.SKIP_RELEASE_PLAN === '1') {
  console.log('Release plan rebuild skipped because current autonomous run already has a locked plan.');
  process.exit(0);
}
const r=spawnSync(process.execPath,['scripts/citation_intelligence/build_release_plan.js'],{stdio:'inherit',env:process.env});
process.exit(r.status ?? 1);
