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
// Reasons the planner is allowed to refuse a unit for. A receipt carrying
// anything else means the planner emitted a refusal this validator does not
// recognise, which is worth failing on.
//
// 'no_demand_record' was added to the planner by c0f4433b0 ("Refuse to build a
// page for a query nobody has searched for") and never added here - the planner
// and this validator each kept their own list with no link between them. It
// stayed dormant because the committed plan blocks nothing; the first plan that
// actually refused a query on demand evidence failed the build for doing
// exactly what that gate was built to do. Refusing to publish against a query
// nobody has searched for is the safe outcome, not an error.
const allowedBlockedReasons = new Set([
  'quality_preflight_rejected',
  'quality_repair_missing_opportunity_metadata',
  'postbuild_quality_quarantine',
  'no_demand_record',
]);
for (const blocked of plan.blocked || []) {
  if (!blocked.target_route || !allowedBlockedReasons.has(blocked.reason)) {
    console.error(`Release plan contains invalid blocked receipt: ${JSON.stringify(blocked)}`);
    process.exit(1);
  }
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
console.log(`Release plan OK (${units.length} units, ${(plan.blocked || []).length} safely blocked)`);
