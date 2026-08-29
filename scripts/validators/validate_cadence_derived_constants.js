#!/usr/bin/env node
/**
 * Cadence derived-constant coherence.
 *
 * THE DEFECT CLASS THIS EXISTS TO CATCH
 * A constant that is implicitly a function of the publishing rate, restated as a
 * literal somewhere else, where the rate changes and the literal does not.
 *
 * This is not hypothetical here. PR #12 correctly throttled the publisher to the
 * declared cadence (data/cadence/policy.json, new_pages_per_week: 2) and updated
 * _content_release_contract.json. It did not update the SIX other places that each
 * kept their own copy of the same numbers:
 *
 *   - _content_release_contract.json strategy_targets.route_target_90_days   (4500)
 *   - citation_strategy_profile.json citation_goal.route_target_90_days      (4500)
 *   - citation_strategy_profile.json cadence.max_new_pages_per_day           (50)
 *   - velocity_governor.json daily_ceiling.new_pages                         (50)
 *   - citation_yield_contract.json publication_budget                        (50)
 *   - build_growth_health.mjs / generate_query_universe.js hardcoded literals (50)
 *
 * The consequences were real, not cosmetic: the velocity governor's stale 50 sat at
 * the FRONT of a first-wins `||` chain in build_release_plan.js, so the contract's 2
 * was never read and the published plan recorded a ceiling of 50; and the query-atlas
 * page told the public the site was "capped at 50 new pages/day".
 *
 * Every figure below is therefore DERIVED from data/cadence/policy.json at runtime and
 * compared, rather than trusted. A future rate change fails loudly here instead of
 * silently leaving six components disagreeing.
 *
 * Deliberately NOT asserted: any floor on the rate. A low cap is a governed throttle,
 * not a broken engine. Asserting `>= 50` is exactly what turned a correct throttle into
 * red run 33273999569.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const POLICY_REL = 'data/cadence/policy.json';
const CONTRACT_REL = '_content_release_contract.json';
const PLANNER_REL = 'scripts/citation_intelligence/build_release_plan.js';

const failures = [];
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail });
  if (!ok) failures.push(`${name}: ${detail}`);
};

// --- the single source of truth ---------------------------------------------
const policy = read(POLICY_REL);
const weekly = Number(policy.new_pages_per_week);
const refreshWindowDays = Number(policy.refresh_window_days);
if (!Number.isFinite(weekly) || weekly < 0) {
  console.error(`FAIL cadence_policy_unusable: ${POLICY_REL} has no usable new_pages_per_week. Every derived figure is meaningless without it.`);
  process.exit(1);
}
if (!Number.isFinite(refreshWindowDays) || refreshWindowDays <= 0) {
  console.error(`FAIL cadence_policy_unusable: ${POLICY_REL} has no usable refresh_window_days.`);
  process.exit(1);
}
const weeks = Math.floor(refreshWindowDays / 7);
const expectedRouteTarget = weekly * weeks;

const contract = read(CONTRACT_REL);
const perDay = Number(contract.cadence?.max_new_pages_per_day);
const perDayRepairs = Number(contract.cadence?.max_repairs_per_day);

// --- 1. the per-day safety cap must be able to bind --------------------------
check(
  'per_day_cap_can_bind',
  Number.isFinite(perDay) && perDay <= weekly,
  `${CONTRACT_REL} cadence.max_new_pages_per_day is ${perDay}; it must be <= the weekly allowance ${weekly}. A per-day cap above the weekly allowance can never bind - that is how 52 editorial URLs landed against a cap of 2.`,
);

// --- 2. every 90-day route target is the rate restated -----------------------
const routeTargets = [
  [`${CONTRACT_REL} cadence.ninety_day_route_target`, contract.cadence?.ninety_day_route_target],
  [`${CONTRACT_REL} strategy_targets.route_target_90_days`, contract.strategy_targets?.route_target_90_days],
];
const profile = read('data/strategy/citation_strategy_profile.json');
routeTargets.push(['citation_strategy_profile.json citation_goal.route_target_90_days', profile.citation_goal?.route_target_90_days]);
for (const [label, actual] of routeTargets) {
  check(
    `route_target_derived:${label}`,
    Number(actual) === expectedRouteTarget,
    `${label} is ${actual}; ${weekly}/wk over floor(${refreshWindowDays}/7)=${weeks} weeks implies ${expectedRouteTarget}.`,
  );
}

// --- 3. every restated per-day ceiling equals the contract -------------------
const governor = read('data/authority_scale/velocity_governor.json');
const yieldContract = read('data/authority_scale/citation_yield_contract.json');
const perDayCopies = [
  ['citation_strategy_profile.json cadence.max_new_pages_per_day', profile.cadence?.max_new_pages_per_day],
  ['citation_strategy_profile.json citation_goal.daily_new_page_capacity', profile.citation_goal?.daily_new_page_capacity],
  ['velocity_governor.json daily_ceiling.new_pages', governor.daily_ceiling?.new_pages],
  ['velocity_governor.json current_default_new_page_ceiling_per_day', governor.current_default_new_page_ceiling_per_day],
  ['citation_yield_contract.json publication_budget.current_starting_ceiling_per_day', yieldContract.publication_budget?.current_starting_ceiling_per_day],
];
// Generated artifacts are checked too: they are what humans and the public actually read.
if (exists('data/admin/growth_health.json')) {
  perDayCopies.push(['data/admin/growth_health.json new_page_capacity_per_day', read('data/admin/growth_health.json').new_page_capacity_per_day]);
}
if (exists('data/query_atlas/query_universe.json')) {
  perDayCopies.push(['data/query_atlas/query_universe.json counts.max_new_pages_per_day', read('data/query_atlas/query_universe.json').counts?.max_new_pages_per_day]);
}
for (const [label, actual] of perDayCopies) {
  check(
    `per_day_copy_agrees:${label}`,
    Number(actual) === perDay,
    `${label} is ${actual}; ${CONTRACT_REL} declares ${perDay}. A restated cadence number is how this drifts.`,
  );
}

// --- 4. route mutations is the sum it claims to be ---------------------------
check(
  'route_mutations_derived',
  Number(contract.cadence?.max_route_mutations_per_day) === perDay + perDayRepairs,
  `${CONTRACT_REL} cadence.max_route_mutations_per_day is ${contract.cadence?.max_route_mutations_per_day}; the planner computes it as new + repairs = ${perDay + perDayRepairs}.`,
);

// --- 5. the tier ladder cannot start above the governed ceiling --------------
for (const [label, tiers] of [
  ['velocity_governor.json scale_tiers', governor.scale_tiers],
  ['citation_yield_contract.json publication_budget.scale_tiers', yieldContract.publication_budget?.scale_tiers],
]) {
  const list = (tiers || []).map(Number).filter(Number.isFinite);
  check(
    `tier_ladder_floor:${label}`,
    list.length > 0 && Math.min(...list) <= perDay,
    `${label} lowest tier is ${list.length ? Math.min(...list) : 'none'}; the governed ceiling is ${perDay}. A ladder whose floor is above the ceiling can only ever recommend a number the contract forbids - which is exactly what handed the planner 50.`,
  );
}

// --- 6. the planner must take the LOWEST declared ceiling, not the first -----
const planner = readText(PLANNER_REL);
check(
  'planner_lowest_wins',
  /Math\.min\(\.\.\.declaredNewCeilings\)/.test(planner) || /Math\.min\([^)]*max_new_pages_per_day/.test(planner),
  `${PLANNER_REL} does not reduce its declared new-page ceilings with Math.min. A first-wins \`||\` chain lets a stale velocity recommendation outrank the contract.`,
);
check(
  'planner_reads_contract_ceiling',
  /contract\.cadence\?\.max_new_pages_per_day/.test(planner),
  `${PLANNER_REL} never reads the contract's max_new_pages_per_day.`,
);
check(
  'planner_reads_weekly_policy',
  /new_pages_per_week/.test(planner),
  `${PLANNER_REL} does not consult new_pages_per_week from ${POLICY_REL}.`,
);

// --- 7. generators must read the contract, not restate it -------------------
for (const rel of ['scripts/build_growth_health.mjs', 'scripts/citation_intelligence/generate_query_universe.js']) {
  const src = readText(rel);
  check(
    `generator_reads_contract:${rel}`,
    /_content_release_contract\.json/.test(src),
    `${rel} does not read ${CONTRACT_REL}; it is restating cadence figures as literals, which is how the public query-atlas page came to advertise a cap of 50 against a governed 2.`,
  );
}

// --- 8. governance files must not declare publication volume ----------------
const lane = read('data/governance/authority_lane_policy.json');
const laneOffenders = [];
if (lane.global_caps) laneOffenders.push('global_caps');
for (const [name, cfg] of Object.entries(lane.lanes || {})) {
  if (cfg && (cfg.max_new_pages_per_run !== undefined || cfg.max_repairs_per_run !== undefined)) laneOffenders.push(`lanes.${name}`);
}
check(
  'lane_policy_declares_no_volume',
  laneOffenders.length === 0,
  `data/governance/authority_lane_policy.json declares publication volume at ${laneOffenders.join(', ')}. Nothing reads these, and they contradicted the contract by up to 25x. A lane grants admission requirements, never volume.`,
);

// --- Rule 0: this validator must never pass on an empty loop -----------------
const MIN_CHECKS = 18;
if (checks.length < MIN_CHECKS) {
  console.error(`FAIL cadence_derived_constants examined only ${checks.length} constants (expected at least ${MIN_CHECKS}). A coherence check that inspects nothing is not a check.`);
  process.exit(1);
}

if (failures.length) {
  console.error(JSON.stringify({ validator: 'cadence_derived_constants', status: 'FAIL', governed_new_pages_per_week: weekly, per_day_safety_cap: perDay, expected_90_day_route_target: expectedRouteTarget, checks: checks.length, failures }, null, 2));
  process.exit(1);
}
console.log(`Cadence derived constants OK (${checks.length} constants checked against ${POLICY_REL}: ${weekly} new pages/week, per-day safety cap ${perDay}, 90-day route target ${expectedRouteTarget} = ${weekly} x ${weeks} weeks)`);
