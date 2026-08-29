#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Prove the self-healing loop is reachable from CI, not just from a human shell.
 *
 * The defect this guards. scripts/selfheal/heal_until_clean.mjs works: on
 * 2026-08-29 a corrupted data/agent_runs/normalized_agent_runs.json (records[]
 * and mode deleted) was detected as normalized-agent-run-schema, repaired by
 * `npm run citation:normalize-artifacts`, and revalidated clean on attempt 2.
 * But nothing ran it. `selfheal` and `selfheal:dry` existed in package.json and
 * appeared in no workflow, no aggregate npm script, and no git hook, so the loop
 * healed nothing in CI for its entire life. p-n-p and dream-wedding-builder each
 * closed exactly this gap with a self-heal.yml; this repo was left out.
 *
 * What this asserts. Every npm script named in SELF_HEAL_SCRIPTS is invoked by
 * at least one file under .github/workflows/, reached transitively through other
 * npm scripts. A repair lane that no workflow can start is theatre regardless of
 * how well it works when run by hand.
 *
 * Zero-item hard fail: if the workflow directory is empty, or none of the named
 * scripts exist in package.json, this exits non-zero rather than passing
 * vacuously. A validator that silently examines nothing is the failure mode it
 * is here to prevent.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');

// The lanes that must stay CI-reachable. Each is a repair lane: it mutates the
// tree to clear a defect a validator detects.
const SELF_HEAL_SCRIPTS = ['selfheal', 'release:quality:self-heal'];

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};

const errors = [];

if (!fs.existsSync(WORKFLOW_DIR)) {
  console.error(`self-heal wiring: no ${path.relative(ROOT, WORKFLOW_DIR)} to examine`);
  process.exit(1);
}
const workflows = fs.readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));
if (!workflows.length) {
  console.error('self-heal wiring: examined zero workflow files - refusing to pass vacuously');
  process.exit(1);
}

const present = SELF_HEAL_SCRIPTS.filter((name) => scripts[name]);
const missing = SELF_HEAL_SCRIPTS.filter((name) => !scripts[name]);
for (const name of missing) {
  errors.push(`package.json has no "${name}" script - the self-heal lane was removed or renamed without updating this guard`);
}
if (!present.length) {
  console.error('self-heal wiring: examined zero self-heal npm scripts - refusing to pass vacuously');
  process.exit(1);
}

// A workflow reaches `target` if it runs it directly, or runs some npm script
// whose body reaches it. Resolved against package.json so a change to an
// aggregate lane cannot quietly orphan the loop again.
const reaches = (scriptName, target, seen = new Set()) => {
  if (scriptName === target) return true;
  if (seen.has(scriptName)) return false;
  seen.add(scriptName);
  const body = scripts[scriptName];
  if (!body) return false;
  for (const m of String(body).matchAll(/npm run (?:--silent )?([\w:.-]+)/g)) {
    if (reaches(m[1], target, seen)) return true;
  }
  return false;
};

const workflowBodies = workflows.map((f) => ({
  file: f,
  text: fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8'),
}));

const findings = [];
for (const target of present) {
  const hits = [];
  for (const { file, text } of workflowBodies) {
    // Strip comment lines: a script named only in a comment is documentation,
    // not an invocation, and must not satisfy this check.
    const live = text
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    for (const m of live.matchAll(/npm run (?:--silent )?([\w:.-]+)/g)) {
      if (reaches(m[1], target)) { hits.push(`${file} (via npm run ${m[1]})`); break; }
    }
  }
  if (!hits.length) {
    errors.push(`no workflow reaches "npm run ${target}" - the repair lane exists but CI can never start it`);
  }
  findings.push({ target, reached_by: hits });
}

if (errors.length) {
  console.error('Self-heal wiring validation failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}

console.log(`Self-heal wiring OK (${present.length} repair lane(s) checked against ${workflows.length} workflow file(s))`);
for (const f of findings) console.log(`  ${f.target} <- ${f.reached_by.join(', ')}`);
