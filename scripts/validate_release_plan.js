#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
const planPath=path.join(ROOT,'releases/citation_release_plan.json');
if(!fs.existsSync(planPath)){ console.error('Missing releases/citation_release_plan.json'); process.exit(1); }
const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
if(plan.blocked && plan.blocked.length){ console.error('Release plan has blocked units'); process.exit(1); }
if(!plan.release_units || plan.release_units.length < 10){ console.error('Release plan too thin'); process.exit(1); }
console.log(`Release plan OK (${plan.release_units.length} units)`);
