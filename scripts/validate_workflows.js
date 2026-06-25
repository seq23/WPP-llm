#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..');
const workflowDir = path.join(ROOT, '.github', 'workflows');
const required = [
  'ci.yml',
  'query-intelligence.yml',
  'programmatic-release.yml',
  'distribution.yml',
  'credential-check.yml'
];
const bad = [];

if (!fs.existsSync(workflowDir)) bad.push('missing .github/workflows directory');

for (const file of required) {
  const full = path.join(workflowDir, file);
  if (!fs.existsSync(full)) {
    bad.push(`missing required workflow: ${file}`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  try {
    const doc = YAML.parse(text);
    if (!doc || typeof doc !== 'object') bad.push(`${file}: parsed YAML is not an object`);
    if (!doc.name) bad.push(`${file}: missing name`);
    // The yaml package follows YAML 1.2 and parses unquoted `on` correctly in GitHub-style files.
    if (!Object.prototype.hasOwnProperty.call(doc, 'on')) bad.push(`${file}: missing on trigger`);
    if (!doc.jobs || typeof doc.jobs !== 'object') bad.push(`${file}: missing jobs`);
    if (doc.jobs) {
      for (const [jobId, job] of Object.entries(doc.jobs)) {
        if (!job || typeof job !== 'object') bad.push(`${file}: job ${jobId} is not an object`);
        else {
          if (!job['runs-on']) bad.push(`${file}: job ${jobId} missing runs-on`);
          if (!Array.isArray(job.steps) || job.steps.length === 0) bad.push(`${file}: job ${jobId} missing steps`);
        }
      }
    }
  } catch (err) {
    bad.push(`${file}: YAML parse failed: ${err.message}`);
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/^NODE\s*$/.test(line) || /^PY\s*$/.test(line)) {
      bad.push(`${file}: heredoc terminator at column 1 on line ${idx + 1}; this breaks YAML block indentation`);
    }
    if (line.includes('${{ secrets.') && line.includes('echo ')) {
      bad.push(`${file}: possible secret echo on line ${idx + 1}`);
    }
  });
}

const allowedWorkflowNames = new Set(required);
for (const file of fs.existsSync(workflowDir) ? fs.readdirSync(workflowDir).filter((n) => /\.ya?ml$/.test(n)) : []) {
  if (!allowedWorkflowNames.has(file)) bad.push(`unexpected workflow file: ${file}; keep the action spine explicit`);
}

if (bad.length) {
  console.error('GitHub workflow validation failed:\n- ' + bad.join('\n- '));
  process.exit(1);
}
console.log(`GitHub workflow validation OK (${required.length} workflows)`);
