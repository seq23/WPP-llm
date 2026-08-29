#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * No orphan scripts.
 *
 * Every executable under scripts/ must be reachable from something that runs it:
 * an npm script, a workflow, a shell script, or a require/import in another file.
 * A script nothing calls is not neutral. Two of the orphans this validator was
 * written for were loaded guns:
 *
 *   - a duplicate release-plan generator wrote releases/citation_release_plan.json,
 *     the same live path the wired planner under scripts/citation_intelligence/
 *     writes, with a stale schema and none of the velocity or quality gating.
 *     Anyone who ran it overwrote the live release plan.
 *   - the WO-3 production page generator rebuilds two live programmatic pages but
 *     was never wired into `build`, so running it by hand stripped the
 *     breadcrumbs, entity schema, fan-out block and CTA attribution that the
 *     build pipeline adds after generation.
 *
 * A dead script is either deleted or wired. There is no allowlist here on
 * purpose: "one-shot, keep it around" is exactly how the two above survived. If
 * a one-shot must be kept, wire it behind an npm script so the wiring is visible.
 *
 * What counts as a caller is deliberately narrow. A prose mention of a filename
 * is not a caller, so this file excludes itself from the corpus and names no
 * orphan by filename above - a validator that its own comments satisfy proves
 * nothing. A reference must look like an invocation or a module specifier:
 * the basename with its extension (`node scripts/foo.js`, `require('./foo.js')`)
 * or the extension-less basename inside a quoted import specifier.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SELF = path.relative(ROOT, __filename);
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|eot|zip|gz|tgz|pdf|mp4|mp3)$/i;
const NUL = String.fromCharCode(0);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tracked files only. An untracked scratch file in someone's working tree is not
// a defect in the repository, and a validator that trips on one gets muted.
const tracked = execSync('git ls-files -z', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  .toString().split(String.fromCharCode(0)).filter(Boolean);

const scripts = tracked
  .filter((f) => f.startsWith('scripts/') && /\.(js|mjs|cjs)$/.test(f))
  .filter((f) => f !== SELF)
  .sort();

if (!scripts.length) {
  console.error('validate:no-orphan-scripts FAILED: examined zero tracked scripts under scripts/ - the scan is broken, not the repo.');
  process.exit(1);
}

// Two corpora, because a prose mention of a filename is not a caller.
//   runners - things that execute a command line: package.json scripts, workflow
//             YAML, shell scripts, Makefiles. A basename here is an invocation.
//   code    - JS/MJS/CJS, where a basename inside a quoted specifier is an import
//             and a basename inside any other quoted string is a spawn target.
// A note in a data file or a paragraph in a README satisfies neither.
const RUNNER = /(^|\/)(package\.json|Makefile|makefile)$|^\.github\/(workflows|scripts)\/|\.(sh|bash|zsh|ya?ml)$/;
const CODE = /\.(js|mjs|cjs)$/;

const runners = [];
const code = [];
for (const rel of tracked) {
  if (BINARY.test(rel)) continue;
  if (rel === SELF) continue; // this file documents the orphans it hunts; it is not a caller
  const abs = path.join(ROOT, rel);
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
  if (text.indexOf(NUL) !== -1) continue; // binary payload
  if (RUNNER.test(rel)) runners.push([rel, text]);
  else if (CODE.test(rel)) code.push([rel, text]);
}

if (!runners.length || !code.length) {
  console.error(`validate:no-orphan-scripts FAILED: reference corpus is empty (${runners.length} runner file(s), ${code.length} code file(s)). The scan is broken, not the repo.`);
  process.exit(1);
}

const orphans = [];
for (const rel of scripts) {
  const base = path.basename(rel);
  const stem = base.replace(/\.(js|mjs|cjs)$/, '');
  const invocation = new RegExp(esc(base));
  // require('./foo'), from '../lib/foo', spawn('scripts/foo.js')
  const specifier = new RegExp(`['"\`][^'"\`\\n]*?[./]${esc(stem)}(\\.(js|mjs|cjs))?['"\`]`);
  const referenced =
    runners.some(([file, text]) => file !== rel && invocation.test(text))
    || code.some(([file, text]) => file !== rel && specifier.test(text));
  if (!referenced) orphans.push(rel);
}

if (orphans.length) {
  console.error(`validate:no-orphan-scripts FAILED: ${orphans.length} script(s) under scripts/ have no caller anywhere in the repo.`);
  for (const o of orphans) console.error(`  - ${o}`);
  console.error('Wire each into an npm script, a workflow, or a require/import, or delete it. Do not add an allowlist.');
  process.exit(1);
}

console.log(`No orphan scripts OK (${scripts.length} scripts under scripts/ plus this validator, every one invoked or imported; ${runners.length} runner file(s) and ${code.length} code file(s) scanned)`);
