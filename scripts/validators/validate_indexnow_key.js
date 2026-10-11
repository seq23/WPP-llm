#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * IndexNow key file is published and the post-deploy ping is wired.
 * The key lives in indexnow.txt; the verification file <key>.txt must sit at the
 * site root with the key as its content, or every IndexNow submission is
 * rejected. The ping runs after CI on main in .github/workflows/distribution.yml
 * through distribution_scripts/indexnow_submit.sh.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const errors = [];
const keyPath = path.join(ROOT, 'indexnow.txt');
if (!fs.existsSync(keyPath)) { console.error('indexnow key FAILED: indexnow.txt missing'); process.exit(1); }
const key = fs.readFileSync(keyPath, 'utf8').trim();
if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) errors.push(`indexnow.txt does not hold a valid key (${key.length} chars)`);
const verify = path.join(ROOT, `${key}.txt`);
if (!fs.existsSync(verify)) errors.push(`verification file ${key}.txt missing at site root`);
else if (fs.readFileSync(verify, 'utf8').trim() !== key) errors.push(`${key}.txt content does not equal the key`);
const wf = path.join(ROOT, '.github/workflows/distribution.yml');
const wfText = fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8') : '';
if (!/deploy_distribution\.sh/.test(wfText)) errors.push('distribution.yml no longer runs deploy_distribution.sh (the IndexNow ping)');
if (!/workflow_run:[\s\S]*CI - Build and Validate[\s\S]*branches: \[main\]/.test(wfText)) errors.push('distribution.yml is no longer triggered after CI on main');
const dd = path.join(ROOT, 'distribution_scripts/deploy_distribution.sh');
if (!fs.existsSync(dd) || !/indexnow_submit\.sh/.test(fs.readFileSync(dd, 'utf8'))) errors.push('deploy_distribution.sh does not call indexnow_submit.sh');
if (errors.length) { console.error('indexnow key FAILED:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log(`indexnow key OK: ${key.slice(0, 6)}… published as /${key.slice(0, 6)}….txt; ping wired after CI on main.`);
