#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const planPath = path.join(ROOT, 'releases/citation_release_plan.json');
if (!fs.existsSync(planPath)) {
  console.error('Missing releases/citation_release_plan.json');
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const units = Array.isArray(plan.release_units) ? plan.release_units : null;
if (!units) {
  console.error('Release plan missing release_units array');
  process.exit(1);
}
if (Array.isArray(plan.blocked) && plan.blocked.length) {
  console.error('Release plan has blocked units');
  process.exit(1);
}
const maxNew = Number(plan.max_new_pages_this_run ?? plan.max_new_pages_per_day ?? 0);
const maxRepairs = Number(plan.max_repairs_this_run ?? plan.max_repairs_per_day ?? 0);
const ceiling = Math.max(0, maxNew) + Math.max(0, maxRepairs);
if (units.length > ceiling) {
  console.error(`Release plan exceeds run ceiling: ${units.length} > ${ceiling}`);
  process.exit(1);
}
const seen = new Set();
for (const unit of units) {
  const route = String(unit.target_route || '').trim();
  const action = String(unit.release_action || unit.action || '').trim();
  if (!route || !action) {
    console.error('Release plan contains unit without route/action');
    process.exit(1);
  }
  const key = `${route}|${action}`;
  if (seen.has(key)) {
    console.error(`Release plan contains duplicate unit: ${key}`);
    process.exit(1);
  }
  seen.add(key);
}
if (units.length === 0) {
  const budgetExhausted = maxNew === 0 && maxRepairs === 0;
  const noOpAllowed = budgetExhausted || plan.status === 'NO_INPUT' || plan.status === 'ALL_SKIPPED' || plan.status === 'COMPLETED_NO_CHANGES';
  if (!noOpAllowed) {
    console.error('Empty release plan without a valid no-op/budget-exhausted state');
    process.exit(1);
  }
  console.log('Release plan OK (0 units; valid no-op/budget exhausted)');
  process.exit(0);
}
console.log(`Release plan OK (${units.length} units)`);
