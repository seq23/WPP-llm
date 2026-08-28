'use strict';
/**
 * Add attribution to bare West Peek Productions CTA links.
 *
 * Dry-run by default; pass --write to apply. Never rewrites a link that already
 * carries utm_source, so it is safe to re-run and cannot clobber the hand-authored
 * campaigns already in place.
 *
 * utm_content is derived from the page's own path, so a lead is traceable to the
 * exact page that produced it rather than to the site as a whole.
 */
const fs = require('fs');
const path = require('path');
const { campaignForPage, contentForPage } = require('./lib/wpp_cta.js');

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const SKIP = new Set(['node_modules', '.git', 'admin', '.build', 'artifacts', 'reports', 'logs']);

const campaignFor = campaignForPage;
const contentFor = contentForPage;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name)); continue; }
    if (e.name.endsWith('.html')) files.push(path.join(dir, e.name));
  }
})(ROOT);

// Only href="...westpeekproductions.com..." with no utm_source before the closing quote.
const HREF = /href="(https?:\/\/(?:www\.)?westpeekproductions\.com[^"]*)"/g;
let changedFiles = 0, changedLinks = 0, alreadyOk = 0;

for (const abs of files) {
  const rel = path.relative(ROOT, abs);
  const src = fs.readFileSync(abs, 'utf8');
  let touched = 0;
  const out = src.replace(HREF, (m, href) => {
    if (/utm_source=/.test(href)) { alreadyOk++; return m; }
    const [base, frag = ''] = href.split('#');
    const sep = base.includes('?') ? '&amp;' : '?';
    const params = `utm_source=virtualagency-os&amp;utm_medium=referral&amp;utm_campaign=${campaignFor(rel)}&amp;utm_content=${contentFor(rel)}`;
    touched++;
    return `href="${base}${sep}${params}${frag ? '#' + frag : ''}"`;
  });
  if (touched) {
    changedLinks += touched; changedFiles++;
    if (WRITE) fs.writeFileSync(abs, out);
  }
}
console.log(JSON.stringify({
  mode: WRITE ? 'write' : 'dry-run',
  html_files_scanned: files.length,
  files_with_bare_ctas: changedFiles,
  links_attributed: changedLinks,
  links_already_attributed: alreadyOk,
}, null, 2));
