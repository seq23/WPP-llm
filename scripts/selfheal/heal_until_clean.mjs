#!/usr/bin/env node
// Validate -> repair -> re-validate, until clean or out of attempts.
//
// The repo already had this shape, but only around two narrow checks:
// release/self_heal_release_quality.js repairs post-build content quality, and
// search:self-heal-loop repairs diagnosed page defects. Everything else in the
// 53-validator registry was validate-only, so any other failure stopped the
// release and waited for a human - even when a repair for exactly that defect
// already existed in package.json and had simply never been wired to the
// validator that detects it.
//
// How it works
//   1. Run the repo's own full validation (npm run validate:all). That command,
//      not this script, defines "clean". It is fail-fast, so on the happy path
//      this costs one pass and nothing else runs.
//   2. If it fails, replay every validator in _validator_registry.json in
//      collect-all mode to attribute the failure to specific validator ids.
//   3. Run the repair each failing validator declares as `repair_command` in the
//      registry, then go back to step 1.
//
// It stops early when clean, and stops when a pass produces no repairable
// failures - looping again would just repeat the same result.
//
//   node scripts/selfheal/heal_until_clean.mjs [--max 3] [--dry-run]
//                                              [--validate "npm run validate:all"]
//
// Exit 0 means the chain is green and it is safe to push. Non-zero means it is
// not, and the report names what could not be healed and why.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const MAX = Math.max(1, Math.min(5, Number(arg('--max', '3')) || 3));
const DRY = argv.includes('--dry-run');
const VALIDATE_CMD = arg('--validate', 'npm run validate:all');
const OUT_DIR = path.join(ROOT, 'artifacts/validation');

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '_validator_registry.json'), 'utf8'));
const validators = registry.validators || [];
const repairFor = new Map(
  validators.filter((v) => v.repair_command).map((v) => [v.id, v.repair_command]),
);

const run = (cmd) => {
  const started = Date.now();
  const r = spawnSync(cmd, {
    cwd: ROOT, shell: true, encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=3072' },
  });
  return { cmd, code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}`, ms: Date.now() - started };
};

// The repo has no collect-all registry runner (deep_validate_isolated.js stops at
// the first failure, and covers 41 of the 53 registered validators). Without
// collect-all, one broken validator hides every other one and the loop would heal
// a single defect per attempt at best. So attribution is done here.
function attributeFailures() {
  const results = [];
  for (const v of validators) {
    const r = run(v.command);
    results.push({
      id: v.id,
      command: v.command,
      severity: v.severity || 'HARD_FAIL',
      status: r.code === 0 ? 'PASS' : 'FAIL',
      exit_code: r.code,
      duration_ms: r.ms,
      repair_command: v.repair_command || null,
      tail: r.code === 0 ? null : r.out.trim().split('\n').slice(-12).join('\n'),
    });
    process.stdout.write(`  ${r.code === 0 ? 'PASS' : 'FAIL'} ${v.id}\n`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'validation-summary-selfheal.json'),
    `${JSON.stringify({ schema_version: '1.0', generated_at: new Date().toISOString(), source: '_validator_registry.json', results }, null, 2)}\n`,
  );
  return results.filter((r) => r.status === 'FAIL').map((r) => r.id);
}

const attempts = [];
let clean = false;
let lastGateTail = null;

for (let attempt = 1; attempt <= MAX; attempt += 1) {
  console.log(`[self-heal] attempt ${attempt}: ${VALIDATE_CMD}`);
  const gate = run(VALIDATE_CMD);
  if (gate.code === 0) {
    attempts.push({ attempt, gate_exit: 0, failed: [], repaired: [], result: 'CLEAN' });
    clean = true;
    console.log(`[self-heal] clean on attempt ${attempt}`);
    break;
  }
  lastGateTail = gate.out.trim().split('\n').slice(-20).join('\n');
  console.log(`[self-heal] gate failed (exit ${gate.code}); attributing to registry validators`);
  const failed = attributeFailures();

  const repairable = failed.filter((id) => repairFor.has(id));
  const unrepairable = failed.filter((id) => !repairFor.has(id));
  console.log(`[self-heal] attempt ${attempt}: ${failed.length} failing validator(s) (${repairable.length} repairable)`);
  for (const id of unrepairable) console.log(`  no registered repair: ${id}`);
  if (!failed.length) {
    // The aggregate command is red but no registered validator reproduces it.
    // That is a gap between validate:all and the registry, not something a
    // repair can close. Name it rather than looping.
    console.log('  gate failed but every registered validator passed - the defect is in an unregistered step');
  }

  if (!repairable.length) {
    attempts.push({ attempt, gate_exit: gate.code, failed, repaired: [], result: 'NO_REPAIR_AVAILABLE' });
    break;
  }

  const repaired = [];
  for (const id of repairable) {
    const cmd = repairFor.get(id);
    if (DRY) { console.log(`  would repair ${id}: ${cmd}`); repaired.push({ id, cmd, code: 0, dry: true }); continue; }
    console.log(`  repairing ${id}: ${cmd}`);
    const r = run(cmd);
    if (r.code !== 0) console.log(`  repair FAILED for ${id} (exit ${r.code})`);
    repaired.push({ id, cmd, code: r.code });
  }
  attempts.push({ attempt, gate_exit: gate.code, failed, repaired, result: DRY ? 'DRY_RUN_STOP' : 'REPAIRED_RETRYING' });
  if (DRY) break;
}

const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  validate_command: VALIDATE_CMD,
  max_attempts: MAX,
  dry_run: DRY,
  registered_repairs: Object.fromEntries(repairFor),
  status: clean ? 'CLEAN' : 'NOT_CLEAN',
  safe_to_push: clean,
  gate_tail: clean ? null : lastGateTail,
  attempts,
};
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'self-heal-loop.json'), `${JSON.stringify(report, null, 2)}\n`);

if (!clean) {
  console.error(`[self-heal] NOT CLEAN after ${attempts.length} attempt(s) - refusing to declare the tree publishable.`);
  console.error('  see artifacts/validation/self-heal-loop.json');
  process.exit(1);
}
console.log('[self-heal] safe to push');
