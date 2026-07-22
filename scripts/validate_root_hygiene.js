#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAX_ROOT_HTML = 25;
const REQUIRED_ROOT = [
  'index.html',
  'articles.html',
  'atlas.html',
  'query-atlas.html',
  'selected-work.html',
  'started-business.html',
  'how-west-peek-helps.html'
];

const rootHtml = fs.readdirSync(ROOT).filter((name) => name.endsWith('.html')).sort();
const missing = REQUIRED_ROOT.filter((name) => !fs.existsSync(path.join(ROOT, name)));
if (missing.length) {
  console.error(`Root hygiene failed: missing required top-level pages: ${missing.join(', ')}`);
  process.exit(1);
}
if (rootHtml.length > MAX_ROOT_HTML) {
  console.error(`Root hygiene failed: ${rootHtml.length} root HTML files; max ${MAX_ROOT_HTML}. Generated authority pages belong under programmatic/.`);
  process.exit(1);
}
const programmaticDir = path.join(ROOT, 'programmatic');
const programmaticHtml = fs.existsSync(programmaticDir)
  ? fs.readdirSync(programmaticDir).filter((name) => name.endsWith('.html')).length
  : 0;
if (programmaticHtml < 1000) {
  console.error(`Root hygiene failed: expected generated authority inventory under programmatic/, found ${programmaticHtml} HTML files.`);
  process.exit(1);
}
console.log(`Root hygiene OK: ${rootHtml.length} root HTML files, ${programmaticHtml} programmatic HTML files.`);
