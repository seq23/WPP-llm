#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const targets = ['.gsc-service-account.json'];
for (const rel of targets) {
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full)) {
    fs.rmSync(full, { force: true });
    console.log(`Removed ${rel}`);
  }
}
console.log('Release cleanup OK');
