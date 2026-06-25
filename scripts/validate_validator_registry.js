#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const registryPath = path.join(ROOT, '_validator_registry.json');
const matrixPath = path.join(ROOT, '_repo_validation_matrix.json');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const regCommands = new Set((registry.validators || []).map((v) => v.command));
const matrixCommands = new Set((matrix.commands || []).map((v) => v.command));
const scriptCommands = Object.entries(pkg.scripts || {})
  .filter(([name]) => name.startsWith('validate:') || name.startsWith('release:prepush') || name === 'release:self-heal' || name === 'release:deep-validate:isolated')
  .flatMap(([name, cmd]) => {
    const parts = String(cmd).split(/&&/).map((s) => s.trim()).filter(Boolean);
    return parts.map((part) => ({ script: name, command: part }));
  })
  .filter(({ command }) => command.startsWith('node scripts/validate_') || command.startsWith('npm run validate:') || command.startsWith('npm run release:') || command === 'npm run build');
const bad = [];
for (const { script, command } of scriptCommands) {
  // npm run wrappers are valid if the wrapper script itself exists; raw node validators must be registered.
  if (command.startsWith('node scripts/validate_')) {
    if (!regCommands.has(command)) bad.push(`unregistered validator in package script ${script}: ${command}`);
    if (!matrixCommands.has(command)) bad.push(`validator missing from matrix in package script ${script}: ${command}`);
  }
}
for (const v of registry.validators || []) {
  if (!v.id || !v.command || !v.severity || !v.purpose || !v.owner) bad.push(`registry entry incomplete: ${JSON.stringify(v)}`);
}
for (const v of matrix.commands || []) {
  if (!v.id || !v.command || !v.severity || !v.purpose || !v.tier) bad.push(`matrix entry incomplete: ${JSON.stringify(v)}`);
}
if (bad.length) {
  console.error('Validator registry validation failed:\n- ' + bad.join('\n- '));
  process.exit(1);
}
console.log(`Validator registry OK (${(registry.validators || []).length} registered)`);
