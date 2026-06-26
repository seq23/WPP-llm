#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const outDir = path.join(ROOT, 'logs', 'actions');
fs.mkdirSync(outDir, { recursive: true });

const summary = {
  generated_at: new Date().toISOString(),
  checks: [],
  notes: [
    'This report never writes secret values.',
    'Missing credentials are SKIP conditions for credential-bound steps, not repo validation failures.'
  ]
};

function add(id, status, detail) {
  summary.checks.push({ id, status, detail });
}


function readPublicIndexNowKey() {
  const explicit = path.join(ROOT, 'indexnow.txt');
  if (fs.existsSync(explicit)) return fs.readFileSync(explicit, 'utf8').trim();
  const hexFile = fs.readdirSync(ROOT).find((name) => /^[0-9a-fA-F-]{32,64}\.txt$/.test(name));
  return hexFile ? path.basename(hexFile, '.txt') : '';
}

const indexNow = process.env.INDEXNOW_KEY || '';
const publicIndexNow = readPublicIndexNowKey();
const effectiveIndexNow = indexNow || publicIndexNow;
if (effectiveIndexNow) {
  const safeShape = /^[A-Za-z0-9_-]{8,128}$/.test(effectiveIndexNow);
  const source = indexNow ? 'secret_or_variable' : 'repo_public_key_file';
  add('INDEXNOW_KEY', safeShape ? `present_valid_shape_${source}` : `present_suspicious_shape_${source}`, safeShape ? `IndexNow key is available via ${source}.` : `IndexNow key source ${source} exists but shape is unusual; verify GitHub secret or root key file.`);
} else {
  add('INDEXNOW_KEY', 'missing_skip_indexnow', 'IndexNow submission will be skipped until a GitHub secret/variable or public root key file exists.');
}

const gscJson = process.env.GSC_SERVICE_ACCOUNT_JSON || '';
if (gscJson) {
  try {
    const obj = JSON.parse(gscJson);
    const ok = Boolean(obj.client_email && obj.private_key && obj.type === 'service_account');
    add('GSC_SERVICE_ACCOUNT_JSON', ok ? 'present_valid_json_shape' : 'present_invalid_service_account_shape', ok ? 'Service account JSON exists with required fields.' : 'JSON parses but does not look like a service account key.');
  } catch (err) {
    add('GSC_SERVICE_ACCOUNT_JSON', 'present_invalid_json', 'Secret exists but is not parseable JSON.');
  }
} else {
  add('GSC_SERVICE_ACCOUNT_JSON', 'missing_skip_gsc', 'Search Console API tasks will be skipped until this secret exists.');
}

const gscSite = process.env.GSC_SITE_URL || '';
if (gscSite) {
  const ok = /^sc-domain:[A-Za-z0-9.-]+$/.test(gscSite) || /^https:\/\/.+\/$/.test(gscSite);
  add('GSC_SITE_URL', ok ? 'present_valid_shape' : 'present_suspicious_shape', ok ? 'Search Console site URL has an accepted shape.' : 'Use sc-domain:example.com or https://example.com/.');
} else {
  add('GSC_SITE_URL', 'missing_skip_gsc', 'Search Console API tasks will be skipped until this secret exists.');
}

const publicSite = process.env.PUBLIC_SITE_URL || 'https://virtualagency-os.com';
add('PUBLIC_SITE_URL', publicSite.startsWith('https://') ? 'present' : 'suspicious', `Public site URL configured as ${publicSite.replace(/https?:\/\//, '')}.`);

const output = path.join(outDir, 'credential-check-summary.json');
fs.writeFileSync(output, JSON.stringify(summary, null, 2));
console.log(`Credential check summary written to ${path.relative(ROOT, output)}`);
for (const check of summary.checks) {
  console.log(`${check.id}: ${check.status}`);
}
