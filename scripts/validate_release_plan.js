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
  // A no-op must be DECLARED, never inferred from absent fields. maxNew and
  // maxRepairs both default to 0 when the keys are missing, so a truncated or
  // half-written plan used to read as "budget exhausted" and pass green over an
  // empty release - a legitimate stop and a broken planner producing the same
  // output. The named states below are written by the planner on purpose; the
  // budget path now requires the budget keys to actually be present.
  const NO_OP_STATES = ['NO_INPUT', 'ALL_SKIPPED', 'COMPLETED_NO_CHANGES'];
  const budgetDeclared = ['max_new_pages_this_run', 'max_new_pages_per_day'].some((k) => k in plan)
    && ['max_repairs_this_run', 'max_repairs_per_day'].some((k) => k in plan);
  const budgetExhausted = budgetDeclared && maxNew === 0 && maxRepairs === 0;
  const stateDeclared = NO_OP_STATES.includes(plan.status);
  if (!budgetExhausted && !stateDeclared) {
    console.error(`Empty release plan with no declared no-op state: status=${JSON.stringify(plan.status)}, budget keys ${budgetDeclared ? 'present' : 'ABSENT'}. Zero units is only acceptable when the planner says why - one of ${NO_OP_STATES.join('/')}, or an explicitly declared zero budget. Inferring "budget exhausted" from missing keys makes a truncated plan indistinguishable from a deliberate pause.`);
    process.exit(1);
  }
  // Rule 0: a NAMED STOP, green and self-explaining, not a silent pass.
  console.log(`NAMED STOP: release plan has 0 units - ${stateDeclared ? `planner declared status=${plan.status}` : 'declared budget is 0 new + 0 repairs this run'}. ${(plan.blocked || []).length} blocked receipt(s) were still checked against the allowed-reason vocabulary.`);
  process.exit(0);
}
console.log(`Release plan OK (${units.length} units, ${(plan.blocked || []).length} safely blocked)`);
