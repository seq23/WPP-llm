#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pages published by the shared search loop (seq23/search-loop, owner ruling
 * 1 Nov 2026) land in questions/ with head tags in alphabetical attribute order:
 *   <meta content="..." name="description"/>   <link href="..." rel="canonical"/>
 * Every generator and validator in this repo reads the house order
 *   <meta name="description" content="...">    <link rel="canonical" href="...">
 * so an engine page counted as having no description, no canonical and no og
 * tags, and apply_site_head declared them a second time. This rewrites the head
 * <meta>/<link> tags of questions/ pages into the house order (values untouched)
 * and runs first in `npm run build`, before anything reads them.
 *
 * Zero-item rule: no questions/ directory is a valid state (the loop has not
 * published yet) and says so; it never reports a rewrite it did not make.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'questions');

const ATTR = /([a-zA-Z:-]+)=(?:"([^"]*)"|'([^']*)')/g;
function attrs(tag) {
  const out = [];
  let m;
  while ((m = ATTR.exec(tag))) out.push([m[1].toLowerCase(), m[2] !== undefined ? m[2] : m[3]]);
  ATTR.lastIndex = 0;
  return out;
}
function rebuild(name, list, lead) {
  const first = list.filter(([k]) => lead.includes(k)).sort((a, b) => lead.indexOf(a[0]) - lead.indexOf(b[0]));
  const rest = list.filter(([k]) => !lead.includes(k));
  return `<${name} ${[...first, ...rest].map(([k, v]) => `${k}="${v}"`).join(' ')}>`;
}

function normalizeHead(html) {
  const end = html.search(/<\/head>/i);
  if (end < 0) return html;
  const head = html.slice(0, end)
    .replace(/<meta\b[^>]*>/gi, (t) => rebuild('meta', attrs(t), ['name', 'property', 'http-equiv', 'charset', 'content']))
    .replace(/<link\b[^>]*>/gi, (t) => rebuild('link', attrs(t), ['rel', 'href']));
  return head + html.slice(end);
}

function main() {
  if (!fs.existsSync(DIR)) {
    console.log('search-loop heads: no questions/ directory yet (the loop has not published); nothing to normalize');
    return;
  }
  const files = fs.readdirSync(DIR, { recursive: true }).filter((f) => String(f).endsWith('.html'));
  let changed = 0;
  for (const f of files) {
    const abs = path.join(DIR, String(f));
    const before = fs.readFileSync(abs, 'utf8');
    const after = normalizeHead(before);
    if (after !== before) { fs.writeFileSync(abs, after); changed += 1; }
  }
  console.log(`search-loop heads: ${files.length} questions/ page(s) read, ${changed} rewritten into the house tag order`);
}

if (require.main === module) main();
module.exports = { normalizeHead };
