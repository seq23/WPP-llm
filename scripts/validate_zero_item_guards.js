#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Every gate in the validation suite must hard-fail when its input set is empty.
 *
 * The defect. On 2026-09-04 run 33889515936 went red on
 * `validate:workflow-liveness`, and it was right to: it detected that it was
 * running inside GitHub Actions with no credential, so its live check would have
 * been skipped and it would have exited 0 having proven that no lane was alive.
 * A gate that examines nothing cannot fail. Green from such a gate is not a
 * statement about the repository, it is silence wearing a passing colour.
 *
 * That validator caught the defect in itself because someone had written the
 * check by hand. Its siblings had not. An audit of the 40-odd validators this
 * repo runs in CI found six that reported PASS while explicitly printing that
 * they had examined zero items:
 *
 *   validate_fanout_warning.js            "Fan-out validation passed (0 HTML files)."
 *   validate_internal_links.js            "Internal link validation OK: 0 HTML files"
 *   validate_canonical_routes.js          passed silently over zero pages
 *   validate_wpp_cta_attribution.js       "0/0 outbound CTA link(s) attributed; 0 bare."
 *   validate_insights.js                  "Insights validation passed (0 published, 0 drafts)."
 *   validate_audience_permutation_budget  "OK (0 programmatic routes, 0 in class, 0 ungated)"
 *
 * Fixing those six is a fix for six scripts. It is not a fix for the class: the
 * next validator added to the suite inherits the same wall. So this runs the
 * proof rather than asserting it in prose.
 *
 * What this does. For every validator the CI chain actually invokes, the contract
 * _zero_item_guard_contract.json names a probe: a recipe that empties that
 * validator's real input set. This builds a throwaway copy of the repository per
 * probe, applies the recipe, runs each validator in it, and requires a NON-ZERO
 * exit. A validator that exits 0 over an empty input set is reported as a failure
 * of this guard.
 *
 * Coverage is enforced, not optional. Any validator in the CI chain with no
 * contract entry is a hard failure here, so a new gate cannot be merged without
 * declaring - and passing - its empty-input behaviour.
 *
 * Zero-item hard fail, applied to itself. If the CI chain expands to zero
 * validators, or a probe group contains zero validators, or zero probes ran,
 * this exits non-zero. This guard is subject to the rule it enforces.
 *
 * Nothing is mutated in the working tree. Probes run in os.tmpdir() copies that
 * are removed afterwards.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, '_zero_item_guard_contract.json');
const errors = [];
const fail = (m) => errors.push(m);

if (!fs.existsSync(CONTRACT_PATH)) {
  console.error('zero-item guards FAILED: missing _zero_item_guard_contract.json - the probe recipes are the only record of what each validator\'s input set is.');
  process.exit(1);
}
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const probes = contract.probes || {};
const declared = new Map((contract.validators || []).map((v) => [v.command, v]));
if (!Object.keys(probes).length) {
  console.error('zero-item guards FAILED: contract declares zero probes.');
  process.exit(1);
}
if (!declared.size) {
  console.error('zero-item guards FAILED: contract declares zero validators.');
  process.exit(1);
}

// --- 1. what does CI actually run? -----------------------------------------
// Expanded from package.json rather than from a hand-kept list, so a validator
// added to validate:all is in scope here the moment it is added.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const roots = Array.isArray(contract.chain_roots) ? contract.chain_roots : [];
if (!roots.length) {
  console.error('zero-item guards FAILED: contract names no chain_roots, so the set of validators in scope would be empty.');
  process.exit(1);
}
for (const r of roots) {
  if (!scripts[r]) fail(`chain_roots names "${r}", which is not a package script. The chain it was meant to cover is unexamined.`);
}

const leaves = new Set();
const expand = (name, seen = new Set()) => {
  if (seen.has(name) || !scripts[name]) return;
  seen.add(name);
  for (const rawPart of String(scripts[name]).split('&&')) {
    const part = rawPart.trim().replace(/^[A-Z_]+=\S+\s+/, '');
    const m = part.match(/^npm run ([\w:.-]+)/);
    if (m) { expand(m[1], seen); continue; }
    if (/^(node|python3) scripts\//.test(part) && /valid/i.test(part)) leaves.add(part);
  }
};
for (const r of roots) expand(r);

if (!leaves.size) {
  console.error('zero-item guards FAILED: expanded the CI chain and found zero validators. The expander is broken, or the suite is empty; both are the emergency this guard exists to catch.');
  process.exit(1);
}

// --- 2. coverage: no validator may be in CI and absent from the contract ----
for (const cmd of [...leaves].sort()) {
  if (!declared.has(cmd)) {
    fail(`${cmd} runs in CI but declares no zero-item probe in _zero_item_guard_contract.json. Its behaviour over an empty input set is unknown, which is how a gate ends up green having looked at nothing. Add an entry naming the probe that empties its input.`);
  }
}
for (const [cmd, entry] of declared) {
  if (!leaves.has(cmd)) fail(`contract declares ${cmd}, which the CI chain no longer invokes. A probe for a gate nothing runs proves nothing - remove it or re-wire the gate.`);
  if (!entry.probe || !probes[entry.probe]) fail(`contract entry ${cmd} names probe "${entry.probe}", which is not defined in probes{}.`);
  if (!entry.input || String(entry.input).trim().length < 10) fail(`contract entry ${cmd} does not say what its input set IS. A probe with no stated input cannot be reviewed.`);
}
if (errors.length) {
  console.error(`validate:zero-item-guards FAILED (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

// --- 3. run the probes ------------------------------------------------------
const groups = new Map();
for (const [cmd, entry] of declared) {
  if (!groups.has(entry.probe)) groups.set(entry.probe, []);
  groups.get(entry.probe).push(cmd);
}

const only = process.argv[2] || null;
let probed = 0;
const survived = [];
const results = [];

for (const [probeId, cmds] of [...groups].sort()) {
  if (only && only !== probeId) continue;
  if (!cmds.length) { fail(`probe ${probeId} covers zero validators.`); continue; }
  const recipe = probes[probeId];
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `zero-item-${probeId}-`));
  try {
    // tar rather than cp -a: excludes .git cheaply and never follows back into ROOT.
    execFileSync('bash', ['-c', `tar --exclude=./.git -cf - . | (cd ${JSON.stringify(sandbox)} && tar -xf -)`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });

    let emptied = 0;
    for (const dir of recipe.empty_dir_contents || []) {
      const target = path.join(sandbox, dir);
      if (!fs.existsSync(target)) { fail(`probe ${probeId}: empty_dir_contents names ${dir}, which does not exist. The recipe empties nothing.`); continue; }
      const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { fs.unlinkSync(p); emptied += 1; } } };
      walk(target);
    }
    for (const ext of recipe.delete_files_with_extension || []) {
      const skip = new Set(['node_modules', '.git']);
      const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (skip.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(ext)) { fs.unlinkSync(p); emptied += 1; } } };
      walk(sandbox);
    }
    for (const rel of recipe.delete_paths || []) {
      const target = path.join(sandbox, rel);
      if (!fs.existsSync(target)) { fail(`probe ${probeId}: delete_paths names ${rel}, which does not exist. The recipe empties nothing.`); continue; }
      const st = fs.statSync(target);
      if (st.isDirectory()) { const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); if (e.isDirectory()) walk(q); else { fs.unlinkSync(q); emptied += 1; } } }; walk(target); }
      else { fs.unlinkSync(target); emptied += 1; }
    }
    // A JSON input can be "empty" without being absent: a truncated or half-written
    // artifact still parses. This strips a document down to the named keys and
    // empties the arrays inside them, which is the shape a crashed producer leaves.
    for (const spec of recipe.truncate_json_to || []) {
      const target = path.join(sandbox, spec.file);
      if (!fs.existsSync(target)) { fail(`probe ${probeId}: truncate_json_to names ${spec.file}, which does not exist.`); continue; }
      const doc = JSON.parse(fs.readFileSync(target, 'utf8'));
      const keep = new Set(spec.keep || []);
      const out = {};
      for (const k of Object.keys(doc)) {
        if (!keep.has(k)) { emptied += 1; continue; }
        out[k] = Array.isArray(doc[k]) ? (emptied += doc[k].length, []) : doc[k];
      }
      for (const k of keep) if (!(k in out)) fail(`probe ${probeId}: truncate_json_to keeps "${k}", which ${spec.file} does not have.`);
      fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
    }
    for (const spec of recipe.empty_json_array || []) {
      const target = path.join(sandbox, spec.file);
      if (!fs.existsSync(target)) { fail(`probe ${probeId}: empty_json_array names ${spec.file}, which does not exist.`); continue; }
      const doc = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (!Array.isArray(doc[spec.key])) { fail(`probe ${probeId}: ${spec.file} has no array at "${spec.key}" to empty.`); continue; }
      emptied += doc[spec.key].length;
      doc[spec.key] = [];
      fs.writeFileSync(target, JSON.stringify(doc, null, 2) + '\n');
    }
    if (!emptied) {
      fail(`probe ${probeId} removed zero items, so every validator under it was run against a FULL input set and its exit code proves nothing about empty input.`);
      continue;
    }

    for (const cmd of cmds.sort()) {
      const argv = cmd.split(/\s+/);
      const res = spawnSync(argv[0], argv.slice(1), { cwd: sandbox, encoding: 'utf8', timeout: 300000, env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '', GITHUB_ACTIONS: '' } });
      const code = res.status;
      const last = String(res.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0] || String(res.stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] || '';
      results.push({ probe: probeId, cmd, code, last: last.slice(0, 120), emptied });
      if (code === 0) {
        survived.push(cmd);
        fail(`${cmd} EXITED 0 over probe "${probeId}" (${emptied} input item(s) removed): ${last.slice(0, 160)}\n    A gate that passes over an empty input set cannot fail, so its green is not evidence. Add an examined-count floor that hard-fails.`);
      }
      probed += 1;
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

if (!probed) {
  console.error('validate:zero-item-guards FAILED: ran zero probes. This guard is subject to its own rule and refuses to pass vacuously.');
  process.exit(1);
}

for (const r of results) {
  console.log(`  ${r.code === 0 ? 'SURVIVED' : 'hard-failed'}  ${r.cmd}  [probe ${r.probe}, ${r.emptied} item(s) removed]`);
}

if (errors.length) {
  console.error(`validate:zero-item-guards FAILED (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`validate:zero-item-guards OK - ${probed} validator(s) across ${groups.size} probe(s) each hard-failed when pointed at an empty input set; ${leaves.size} CI-chain validator(s) all covered.`);
