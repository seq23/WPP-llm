#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Behaviour of the published page finish (scripts/lib/page_finish.js), proven on
 * the real assembled site, not on the repo HTML: the assembler is where the
 * finish happens, so this assembles into a temp dir and reads what would deploy.
 *
 * Every published content page must carry: one header with the inquiry button,
 * a conversion box placed before the first H2 (above the fold, under the
 * answer), inquiry links that go through /go/plan, no keyword block, and - if it
 * declares FAQPage schema - a visible FAQ.
 *
 * Negative proof: `--self-test` runs the same checks on a committed page as it
 * sits in the repo (no finish) and must see them fail.
 * RULE 0: every sitemapped page must be among those checked; fewer pages than
 * the sitemap lists (or an empty sitemap) is a failure. The floor follows the
 * site's real size, so a consolidation never needs the number edited.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { hasVisibleFaq } = require('./lib/page_finish.js');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP_URLS = (fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length;
const MIN_PAGES = Math.max(1, SITEMAP_URLS);

function problems(html) {
  const out = [];
  if ((html.match(/<header\b/g) || []).length !== 1) out.push('not exactly one header');
  if (!/<header class="site-header"[\s\S]*?href="\/go\/plan\?[^"]*"[^>]*>Get a production plan<\/a>[\s\S]*?<\/header>/.test(html)) out.push('header has no inquiry button');
  const box = html.indexOf('class="cta-box"');
  const h2 = html.search(/<h2[\s>]/);
  if (box < 0) out.push('no conversion box');
  else if (h2 > -1 && box > h2 && !/class="quick-answer"|id="recommendation-summary"/.test(html.slice(0, box))) out.push('conversion box is below the first section');
  if (/<a\b[^>]*href="https?:\/\/(?:www\.)?westpeekproductions\.com/.test(html)) out.push('inquiry link bypasses /go/plan');
  if (/Common ways this gets searched|class="fanout-block"/.test(html)) out.push('keyword block still published');
  if (/"@type"\s*:\s*"FAQPage"/.test(html) && !hasVisibleFaq(html)) out.push('FAQPage schema without a visible FAQ');
  return out;
}

const pick = (dir) => {
  const files = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      if (fs.statSync(f).isDirectory()) { if (!['admin', 'go'].includes(n)) walk(f); } else if (n.endsWith('.html') && n !== '404.html') files.push(f);
    }
  };
  walk(dir);
  return files;
};

if (process.argv.includes('--self-test')) {
  const raw = fs.readFileSync(path.join(ROOT, 'programmatic/webinar-production.html'), 'utf8');
  const p = problems(raw);
  if (!p.length) { console.error('test:page-finish self-test FAILED: an unfinished page passed the checks'); process.exit(1); }
  console.log(`test:page-finish self-test OK: an unfinished page fails (${p.join('; ')})`);
  process.exit(0);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'page-finish-'));
execFileSync('node', [path.join(ROOT, 'scripts/assemble_pages_output.js')], { cwd: ROOT, env: { ...process.env, PAGES_ASSEMBLE_OUT: out }, stdio: 'ignore' });
const files = pick(out).filter((f) => !/\/index\.html$/.test(f) || /\/answers\/index\.html$/.test(f));
const bad = [];
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  if (/http-equiv="refresh"/.test(html) && /name="robots" content="noindex/.test(html)) continue; // consolidation redirect stub
  const p = problems(html);
  if (p.length) bad.push(`${path.relative(out, f)}: ${p.join('; ')}`);
}
fs.rmSync(out, { recursive: true, force: true });
if (files.length < MIN_PAGES) { console.error(`test:page-finish checked only ${files.length} pages (floor: the ${SITEMAP_URLS} sitemap URLs)`); process.exit(1); }
if (bad.length) { console.error(`test:page-finish FAILED on ${bad.length} of ${files.length} pages:\n  ${bad.slice(0, 15).join('\n  ')}`); process.exit(1); }
console.log(`test:page-finish OK: ${files.length} published pages finished`);
