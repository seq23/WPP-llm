#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Keep main's validation reachable on commits CI cannot see.
 *
 * The defect. Four workflows in this repo push to main through
 * .github/scripts/commit_and_push_if_changed.sh, authenticated with GITHUB_TOKEN.
 * GitHub does not trigger workflows on GITHUB_TOKEN pushes, so ci.yml - which
 * triggers only on push, pull_request and dispatch - never ran on any of them.
 *
 * Observed 2026-08-29: the last green ci.yml run on main tested 019b7448, while
 * main was abea8a17d, published by the search-repair-retest cron. On that commit
 * `npm run cadence:gate` exits 1 (52 editorial URLs against a 2/week cap). main
 * had been red for an unknown number of bot pushes and no run said so; it
 * surfaced only because a human PR was the first CI run on that content.
 *
 * A gate that cannot observe the commits it governs is not a gate. This asserts
 * ci.yml carries a time trigger, so main is validated on a schedule regardless of
 * who pushed or how they authenticated.
 *
 * Zero-item hard fail: if no workflow pushes to main, or ci.yml is absent, this
 * exits non-zero rather than passing vacuously - either would mean the premise
 * it is defending has silently changed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');
// The workflow carrying this repo's validation spine.
const SPINE = 'ci.yml';

const errors = [];

if (!fs.existsSync(WORKFLOW_DIR)) {
  console.error(`ci reachability: no ${path.relative(ROOT, WORKFLOW_DIR)} to examine`);
  process.exit(1);
}
const files = fs.readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));
if (!files.length) {
  console.error('ci reachability: examined zero workflow files - refusing to pass vacuously');
  process.exit(1);
}

const read = (f) => fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8');
const uncommented = (text) => text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

// Lanes that write to main. These are the pushes ci.yml cannot see.
const botPushers = files.filter((f) => {
  const t = uncommented(read(f));
  return t.includes('commit_and_push_if_changed.sh') || /(^|[;&|\s])git\s+push(\s|$)/m.test(t);
});
if (!botPushers.length) {
  console.error(
    'ci reachability: found zero workflows that push to main - refusing to pass vacuously. '
    + 'If the bot lanes were genuinely removed, retire this validator deliberately rather than letting it pass on an empty set.',
  );
  process.exit(1);
}

const spinePath = path.join(WORKFLOW_DIR, SPINE);
if (!fs.existsSync(spinePath)) {
  console.error(`ci reachability: ${SPINE} is missing - the validation spine this check defends does not exist`);
  process.exit(1);
}
const spine = uncommented(read(SPINE));

// A time trigger is the only one that fires independent of who pushed.
if (!/^\s*schedule:/m.test(spine) || !/^\s*-\s*cron:/m.test(spine)) {
  errors.push(
    `${SPINE} has no schedule/cron trigger, but ${botPushers.length} workflow(s) push to main with GITHUB_TOKEN `
    + `(${botPushers.join(', ')}) and GitHub does not trigger workflows on those pushes - main can go red unobserved`,
  );
}

if (errors.length) {
  console.error('CI reachability validation failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}

console.log(
  `CI reachability OK (${SPINE} is time-triggered; ${botPushers.length} bot-pushing lane(s) covered: ${botPushers.join(', ')})`,
);
