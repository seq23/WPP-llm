#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Publication freeze (data/release/publication_freeze.json) is real, reachable
 * and holding.
 *  1. The flag file is well formed.
 *  2. The gate refuses an unmeasured query and admits a measured one while frozen
 *     (exercised, not asserted in prose).
 *  3. The only page creator, apply_release_plan.js, loads the gate and calls it
 *     on the create path - a gate the publisher never calls governs nothing.
 *  4. No page admitted with action "create" on or after the freeze date lacks a
 *     measured target.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const errors = [];
let gate;
try { gate = require('../lib/publication_freeze.js'); } catch (e) { console.error(`publication freeze FAILED: ${e.message}`); process.exit(1); }
let flag;
try { flag = gate.loadFreeze(ROOT); } catch (e) { console.error(`publication freeze FAILED: ${e.message}`); process.exit(1); }
if (typeof flag.frozen !== 'boolean') errors.push('frozen must be true or false');
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(flag.since || ''))) errors.push('since must be a YYYY-MM-DD date');
if (!flag.reason) errors.push('reason missing');
const measured = gate.measuredQueries(ROOT, flag);
if (!measured.size) errors.push(`${flag.measured_targets} holds zero measured targets; the gate cannot tell a measured query from an unmeasured one`);

if (flag.frozen) {
  const probe = gate.createAllowed('zz unmeasured probe query 7f3a', { flag, measured });
  if (probe.allowed) errors.push('gate admitted an unmeasured query while frozen');
  const real = [...measured][0];
  if (real && !gate.createAllowed(real, { flag, measured }).allowed) errors.push(`gate refused a measured query ("${real}") while frozen`);
}

const pubPath = path.join(ROOT, 'scripts/citation_intelligence/apply_release_plan.js');
const pub = fs.existsSync(pubPath) ? fs.readFileSync(pubPath, 'utf8') : '';
if (!/require\('\.\.\/lib\/publication_freeze\.js'\)/.test(pub)) errors.push('apply_release_plan.js does not load scripts/lib/publication_freeze.js');
const createBranch = pub.slice(pub.indexOf("u.release_action === 'create'"));
if (!/publicationFreeze\.createAllowed\(/.test(createBranch.slice(0, 600))) errors.push('apply_release_plan.js create path does not call publicationFreeze.createAllowed');

if (flag.frozen) {
  const adm = path.join(ROOT, 'data/content/page_admission_registry.json');
  const rows = fs.existsSync(adm) ? (JSON.parse(fs.readFileSync(adm, 'utf8')).admissions || []) : [];
  const late = rows.filter((a) => a.action === 'create' && String(a.admitted_at || '').slice(0, 10) >= flag.since && !measured.has(gate.norm(a.query)));
  for (const a of late.slice(0, 20)) errors.push(`${a.route} was created ${String(a.admitted_at).slice(0, 10)} during the freeze for unmeasured query "${a.query}"`);
}

if (errors.length) { console.error('publication freeze FAILED:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log(`publication freeze OK: frozen=${flag.frozen} since ${flag.since}; ${measured.size} measured target quer${measured.size === 1 ? 'y' : 'ies'}; gate wired into apply_release_plan.js and exercised.`);
