#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'insights');
const DRAFTS_DIR = path.join(CONTENT_DIR, '_drafts');

function slugifyFilename(name) {
  const ext = path.extname(name);
  let base = path.basename(name, ext);
  base = base.replace(/^\d{4}-\d{2}-\d{2}_/, '');
  base = base.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) base = 'post';
  return base + ext.toLowerCase();
}

function datePrefix(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_/);
  return m ? m[1] : null;
}

function main() {
  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log('No drafts directory; nothing to release.');
    process.exit(0);
  }

  const today = new Date().toISOString().slice(0, 10);
  const files = fs.readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
    .sort();

  if (!files.length) {
    console.log('No drafts to release.');
    process.exit(0);
  }

  const eligible = files.filter((f) => {
    const date = datePrefix(f);
    return date && date <= today;
  });

  if (!eligible.length) {
    console.log(`No draft scheduled for release on or before ${today}.`);
    process.exit(0);
  }

  const pick = eligible[0];
  const from = path.join(DRAFTS_DIR, pick);
  const normalized = slugifyFilename(pick);
  const to = path.join(CONTENT_DIR, normalized);

  if (fs.existsSync(to)) {
    const skippedDir = path.join(CONTENT_DIR, '_skipped');
    fs.mkdirSync(skippedDir, { recursive: true });
    const skippedTo = path.join(skippedDir, pick);
    fs.renameSync(from, skippedTo);
    console.warn(`WARNING: Duplicate slug already published for ${pick}.`);
    console.warn(`Moved duplicate draft to content/insights/_skipped/${pick} and continuing.`);
    process.exit(0);
  }

  fs.renameSync(from, to);
  console.log(`Released: ${pick} -> ${path.basename(to)}`);
}

main();
