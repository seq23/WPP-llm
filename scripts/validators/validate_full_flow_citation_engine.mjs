#!/usr/bin/env node
/**
 * Full-flow citation engine contract.
 *
 * This validator used to assert `cadence.max_new_pages_per_day >= 50` under the name
 * "full flow page cap not active". That encoded a volume floor: it read a LOW page cap
 * as a broken engine. When the publisher was correctly throttled to the declared
 * cadence (data/cadence/policy.json, new_pages_per_week: 2) the assertion fired and
 * turned a governed throttle into a red build - the failure of run 33273999569.
 *
 * The assertion is converted, not deleted. What the full-flow engine actually needs is
 * not a big number, it is a COHERENT one: a single declared publishing rate that every
 * component restates identically, and a per-day cap that can only ever lower it. That
 * is what is asserted now. Volume is explicitly not the health signal here - this
 * property has ~3.4K pages and 2 observed citations, so a higher cap would not be
 * evidence of a working engine.
 */
import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const profile = read('data/strategy/citation_strategy_profile.json');
const contract = read('_content_release_contract.json');
const universe = read('data/query_atlas/query_universe.json');
const lane = read('data/governance/authority_lane_policy.json');
const policy = read('data/cadence/policy.json');

const errors = [];

// --- goal shape (unchanged) -------------------------------------------------
if (profile.citation_goal.stretch_target_observed_external_citations !== 100000) errors.push('100K target missing');
if (profile.citation_goal.time_horizon_days !== 90) errors.push('90-day horizon missing');
if (lane.operating_state !== 'ACTIVE') errors.push('runtime not active');

// --- query universe (unchanged) ---------------------------------------------
const queries = universe.queries || [];
if (queries.length < 1000) errors.push(`query universe too small: ${queries.length}`);
const pillars = new Set(queries.map((q) => q.pillar));
if (pillars.size < 7) errors.push(`seven pillars missing: ${pillars.size}`);

// --- cadence coherence (replaces the volume floor) ---------------------------
const weekly = Number(policy.new_pages_per_week);
if (!Number.isFinite(weekly) || weekly <= 0) {
  errors.push('cadence policy declares no usable new_pages_per_week; there is no governed rate to be coherent with');
}
const perDay = Number(contract.cadence?.max_new_pages_per_day);
if (!Number.isFinite(perDay)) {
  errors.push('contract declares no max_new_pages_per_day');
} else if (Number.isFinite(weekly) && perDay > weekly) {
  // A per-day safety cap above the WEEKLY allowance is the exact shape that let 52
  // editorial URLs land against a cap of 2: the cap could never bind.
  errors.push(`per-day cap ${perDay} exceeds the weekly allowance ${weekly}; a safety cap that cannot bind is not a cap`);
}
if (Number(contract.cadence?.max_repairs_per_day) < 100) errors.push('repair cap not active');

// The 90-day route target must be the declared rate restated, not an aspiration.
const weeks = Math.floor(Number(policy.refresh_window_days) / 7);
const expectedRouteTarget = weekly * weeks;
for (const [label, actual] of [
  ['cadence.ninety_day_route_target', contract.cadence?.ninety_day_route_target],
  ['strategy_targets.route_target_90_days', contract.strategy_targets?.route_target_90_days],
  ['citation_strategy_profile.citation_goal.route_target_90_days', profile.citation_goal?.route_target_90_days],
]) {
  if (Number(actual) !== expectedRouteTarget) {
    errors.push(`${label} is ${actual}, expected ${expectedRouteTarget} (${weekly}/wk x ${weeks} weeks)`);
  }
}

if (errors.length) { console.error(errors); process.exit(1); }
console.log(`Full-flow citation engine OK: ${queries.length} queries, ${pillars.size} pillars, ${weekly} new pages/week governed (per-day safety cap ${perDay}, ${contract.cadence.max_repairs_per_day} repairs/day x${contract.cadence.scheduled_runs_per_day} runs), 90-day route target ${expectedRouteTarget}, 100K/90-day citation stretch target`);
