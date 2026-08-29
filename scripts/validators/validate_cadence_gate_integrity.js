#!/usr/bin/env node
/**
 * The cadence gate must be able to block twice.
 *
 * This exists because it could not. cadence_gate.js used to rewrite
 * data/cadence/known_urls.json - the ledger that is the sole input distinguishing
 * a new page from an existing one - as a side effect of running. The observed
 * behaviour on a real blocked tree was:
 *
 *   $ node scripts/cadence_gate.js   ->  CADENCE GATE BLOCKED ... exit 1
 *   $ node scripts/cadence_gate.js   ->  CADENCE GATE CLEAR   ... exit 0
 *
 * with nothing else changed. The publishing cap was therefore unenforceable:
 * running the check consumed the evidence the check was reading. Anyone who ran
 * it, saw red, and ran it again saw green; any process that ran it before
 * committing silently committed the acceptance.
 *
 * This validator asserts the property that failure violated:
 *
 *   1. Running the gate does not modify the ledger. Byte comparison.
 *   2. Running the gate twice yields the same verdict and the same new-URL
 *      counts. A check whose result depends on how many times it has run is not
 *      a check.
 *   3. The gate is actually invoked by a workflow. A gate nothing calls is the
 *      documented prior state of this file across nine repositories, and it is
 *      indistinguishable from having no gate at all.
 *   4. Acceptance is a separate, reason-bearing command, and wherever a workflow
 *      does advance the ledger, it does so strictly AFTER a passing gate in the
 *      same file. A read-only gate with no advancer anywhere is a ratchet: a
 *      library that publishes inside its cap still accumulates unaccepted URLs
 *      until it crosses the cap and stays red forever, with no over-publishing
 *      behind it. So CI accepting is allowed and sometimes required - but only
 *      downstream of a gate that can still stop it, never unconditionally.
 *
 * It deliberately does not care whether the gate currently passes or blocks.
 * Freshness and volume are the gate's business; this is only about whether the
 * gate is capable of holding a verdict.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const LEDGER = path.join(ROOT, 'data/cadence/known_urls.json');
const GATE = 'scripts/cadence_gate.js';
const ACCEPT = 'scripts/cadence_accept.js';
const WORKFLOWS = path.join(ROOT, '.github/workflows');

const failures = [];

function runGate() {
  try {
    const stdout = execFileSync('node', [GATE, '--json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { exit: 0, report: JSON.parse(stdout) };
  } catch (err) {
    if (typeof err.status !== 'number') throw err;
    let report = null;
    try { report = JSON.parse(err.stdout); } catch { /* reported below */ }
    return { exit: err.status, report };
  }
}

// --- 1 & 2: the gate holds its verdict and leaves the ledger alone -----------
if (!fs.existsSync(LEDGER)) {
  failures.push(`ledger_missing: ${path.relative(ROOT, LEDGER)} does not exist, so "new since last accepted" is unanswerable and the weekly cap cannot fire at all`);
} else {
  const before = fs.readFileSync(LEDGER);

  const first = runGate();
  const afterFirst = fs.readFileSync(LEDGER);
  if (!before.equals(afterFirst)) {
    failures.push('gate_mutates_ledger: running the cadence gate rewrote data/cadence/known_urls.json. The gate reads that file to decide what is new, so writing it means the next run cannot see what this run blocked on. Accepting a backlog belongs in cadence:accept, which records a reason.');
  }

  const second = runGate();
  const afterSecond = fs.readFileSync(LEDGER);
  if (!afterFirst.equals(afterSecond)) {
    failures.push('gate_mutates_ledger: the second cadence gate run rewrote data/cadence/known_urls.json.');
  }

  if (first.exit !== second.exit) {
    failures.push(`gate_not_idempotent: two consecutive runs with no change between them exited ${first.exit} then ${second.exit}. A gate that clears itself on a retry cannot enforce anything.`);
  }
  if (first.report && second.report) {
    if (first.report.status !== second.report.status) {
      failures.push(`gate_not_idempotent: status changed from ${first.report.status} to ${second.report.status} across two identical runs.`);
    }
    if (first.report.new_editorial_urls !== second.report.new_editorial_urls) {
      failures.push(`gate_not_idempotent: new_editorial_urls changed from ${first.report.new_editorial_urls} to ${second.report.new_editorial_urls} across two identical runs.`);
    }
  } else {
    failures.push('gate_no_receipt: the cadence gate did not emit a parseable --json report, so its verdict cannot be checked.');
  }
}

// --- 3: the gate is wired to something ---------------------------------------
function workflowFiles() {
  if (!fs.existsSync(WORKFLOWS)) return [];
  return fs.readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/i.test(f)).map((f) => path.join(WORKFLOWS, f));
}
const wfs = workflowFiles();
const invoking = wfs.filter((f) => /cadence:gate/.test(fs.readFileSync(f, 'utf8')));
if (!invoking.length) {
  failures.push('gate_not_registered: no workflow in .github/workflows invokes `npm run cadence:gate`. A gate nothing runs is not a gate.');
}

// --- 4: acceptance is deliberate, and CI cannot perform it -------------------
if (!fs.existsSync(path.join(ROOT, ACCEPT))) {
  failures.push(`accept_missing: ${ACCEPT} does not exist, so the only way past a cadence block is to edit the ledger by hand or weaken the policy.`);
} else {
  try {
    execFileSync('node', [ACCEPT], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    failures.push('accept_without_reason: cadence:accept succeeded with no --reason. Acceptance must carry a recorded justification.');
  } catch (err) {
    if (err.status !== 2) {
      failures.push(`accept_without_reason: cadence:accept exited ${err.status} with no --reason; expected 2 (refusal).`);
    }
  }
}
// A workflow may advance the ledger, but only behind a gate that can still stop
// it. Comments are blanked first so that prose mentioning either command cannot
// satisfy or trip the ordering check.
for (const f of wfs) {
  const raw = fs.readFileSync(f, 'utf8');
  const code = raw.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
  const iAccept = code.indexOf('cadence:accept');
  if (iAccept < 0) continue;
  const iGate = code.indexOf('cadence:gate');
  if (iGate < 0 || iGate > iAccept) {
    failures.push(`accept_not_gated: ${path.basename(f)} runs cadence:accept without a cadence:gate before it. Advancing the baseline ahead of the check that reads it is the same defect as the gate writing its own ledger.`);
  }
  const gateStep = code.slice(0, iAccept);
  if (/continue-on-error:\s*true/.test(gateStep.slice(gateStep.lastIndexOf('- name:')))) {
    failures.push(`accept_not_gated: ${path.basename(f)} allows the cadence gate step to fail without stopping the job before cadence:accept runs.`);
  }
}

// ---------------------------------------------------------------------------
// The publisher must be governed by the same policy the gate reports on.
//
// Everything above establishes that the gate can hold a verdict. None of it
// establishes that anything upstream obeys it, and for a long time nothing did:
// data/cadence/policy.json declared 2 new pages a week, the release planner's
// only ceiling was a per-DAY number defaulting to 50, and the release workflow
// ran twice a day with that number set to 50 - a rate roughly 26x the declared
// cap, which is how 52 unaccepted editorial URLs accumulated. The gate reported
// the gap accurately every time; it simply had no power to prevent it, because
// the cap was applied downstream of the process it governed.
//
// So the properties asserted here are:
//
//   5. The planner reads data/cadence/policy.json and derives its new-page
//      allowance from new_pages_per_week - before it stages candidates, not after.
//   6. The per-run/per-day ceiling can only narrow that allowance. If the planner
//      ever takes the larger of the two, the policy stops being a cap.
//   7. No workflow declares a per-day new-page cap above the declared weekly
//      figure, so the workflow cannot advertise a rate the policy forbids.
//   8. Usage is measured over a multi-day window. A weekly cap enforced against a
//      ledger that resets at midnight is a daily cap wearing a weekly label, and
//      this publisher runs twice a day.
// ---------------------------------------------------------------------------
const POLICY_REL = 'data/cadence/policy.json';
const PLANNER_REL = 'scripts/citation_intelligence/build_release_plan.js';
const policyPath = path.join(ROOT, POLICY_REL);
const plannerPath = path.join(ROOT, PLANNER_REL);

let declaredWeekly = null;
if (!fs.existsSync(policyPath)) {
  failures.push(`policy_missing: ${POLICY_REL} does not exist, so there is no declared publishing rate for anything to be governed by.`);
} else {
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    declaredWeekly = Number(policy.new_pages_per_week);
    if (!Number.isFinite(declaredWeekly) || declaredWeekly < 0) {
      failures.push(`policy_no_weekly_cap: ${POLICY_REL} has no usable new_pages_per_week. The gate reports against it and the planner is required to read it.`);
      declaredWeekly = null;
    }
  } catch (err) {
    failures.push(`policy_unreadable: ${POLICY_REL} is not parseable JSON (${String(err.message).slice(0, 120)}).`);
  }
}

if (!fs.existsSync(plannerPath)) {
  failures.push(`planner_missing: ${PLANNER_REL} does not exist, so this validator cannot show the publisher is governed. It hard-fails rather than passing on an absent publisher.`);
} else {
  const planner = fs.readFileSync(plannerPath, 'utf8');
  // Mentioning the path in prose is not reading it. The policy constant must
  // resolve to the real file AND be passed to an actual read, or a planner that
  // only names the policy in a comment would satisfy this check.
  const constMatch = planner.match(/const\s+CADENCE_POLICY_REL\s*=\s*['"]([^'"]+)['"]/);
  const readsPolicy = /readJson\(\s*(?:CADENCE_POLICY_REL|['"]data\/cadence\/policy\.json['"])/.test(planner);
  if (!readsPolicy) {
    failures.push(`planner_ignores_policy: ${PLANNER_REL} never reads ${POLICY_REL}. The weekly cap is then enforced only after publishing, by a gate that can report the overrun but not prevent it - the exact state that produced 52 editorial URLs against a cap of 2.`);
  } else if (constMatch && constMatch[1] !== POLICY_REL) {
    failures.push(`planner_reads_wrong_policy: ${PLANNER_REL} reads '${constMatch[1]}', not ${POLICY_REL}. Pointing the publisher at a file the gate does not read restores the disagreement in a form that still looks governed.`);
  }
  if (!/new_pages_per_week/.test(planner)) {
    failures.push(`planner_ignores_weekly_cap: ${PLANNER_REL} does not consult new_pages_per_week.`);
  }
  // The allowance must be an intersection, never a union. Math.max over the two
  // headrooms would let the daily safety cap grant headroom the policy withheld.
  if (!/const\s+maxNew\s*=\s*Math\.min\(/.test(planner)) {
    failures.push(`planner_allowance_not_narrowed: ${PLANNER_REL} does not compute its new-page allowance as Math.min of the weekly policy headroom and the daily safety ceiling. A ceiling that can raise the declared rate is not a safety cap.`);
  }
  if (!/weeklyHeadroom/.test(planner) || !/usedThisWeek/.test(planner)) {
    failures.push(`planner_no_weekly_window: ${PLANNER_REL} does not measure usage across a weekly window. A per-day ledger cannot answer a per-week question, and this publisher is scheduled twice a day.`);
  }
  const stagingIndex = planner.search(/function\s+stageCandidate/);
  const allowanceIndex = planner.search(/const\s+maxNew\s*=/);
  if (stagingIndex >= 0 && allowanceIndex >= 0 && allowanceIndex > stagingIndex) {
    failures.push(`planner_allowance_applied_late: ${PLANNER_REL} computes its allowance after candidate staging is defined. The allowance must be known before anything is generated, not used to trim afterwards.`);
  }
}

if (declaredWeekly !== null) {
  for (const f of wfs) {
    const raw = fs.readFileSync(f, 'utf8');
    const code = raw.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
    for (const m of code.matchAll(/MAX_NEW_PAGES_PER_DAY:\s*'?"?(\d+)'?"?/g)) {
      const declared = Number(m[1]);
      if (declared > declaredWeekly) {
        failures.push(`workflow_cap_over_policy: ${path.basename(f)} sets MAX_NEW_PAGES_PER_DAY=${declared}, above the declared ${declaredWeekly} new pages per week in ${POLICY_REL}. A per-day safety cap larger than a whole week's allowance is a rate the policy does not permit, stated in the one place people read.`);
      }
    }
  }
}

const receipt = {
  validator: 'cadence_gate_integrity',
  status: failures.length ? 'FAIL' : 'PASS',
  hard_failures: failures.length,
  strong_warnings: 0,
  soft_warnings: 0,
  gate_invoked_by: invoking.map((f) => path.basename(f)),
  declared_new_pages_per_week: declaredWeekly,
  publisher_governed_by_policy: !failures.some((x) => x.startsWith('planner_') || x.startsWith('workflow_cap_over_policy')),
  failures,
};
console.log(JSON.stringify(receipt, null, 2));
process.exit(failures.length ? 1 : 0);
