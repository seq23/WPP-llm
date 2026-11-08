#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * West Peek Productions is the one main door (owner rulings 2 Nov and 7 Nov
 * 2026), proven on the assembled site that deploys, not on the repo HTML.
 *
 * Every published page must:
 *   1. have a logo that goes to https://westpeekproductions.com/;
 *   2. have "West Peek Productions ↗" and "Community as a service ↗" in BOTH the
 *      header menu and the footer, going to westpeekproductions.com and its
 *      /community-as-a-service/ page, plus "Library home" back to this site;
 *   3. send every link whose words are a web address to that address.
 * The home page must also carry "Two ways West Peek Productions helps" with the
 * community-as-a-service block linking to the 3-minute quiz.
 *
 * WHY. Before 7 Nov 2026 the logo said "West Peek Productions home" but opened
 * this site, no visible link reached westpeekproductions.com, and two About
 * links reading "westpeekproductions.com" opened the Google inquiry form.
 *
 * Negative proof: `--self-test` runs the checks on committed pages as they sit
 * in the repo (no finish) and on a page whose address-labelled link goes to the
 * form; both must fail, and a correct page must pass.
 * RULE 0: every sitemapped page must be among those checked.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://westpeekproductions.com/';
const COMMUNITY = 'https://westpeekproductions.com/community-as-a-service/';
const ADDRESS_LABEL = /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+(?:com|org|net|io|co|ai|app|dev|live|ventures|vc|fm|tv|us|edu|gov|me|so))(\/[^\s]*)?$/i;

const plain = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8599;|&nearr;/g, '↗').replace(/\s+/g, ' ').trim();
const anchors = (html) => [...String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
  attrs: m[1], href: ((m[1].match(/href="([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&'), label: plain(m[2]),
}));
const block = (html, re) => (String(html).match(re) || [''])[0];
const where = (href) => {
  try { const u = new URL(href, 'https://virtualagency-os.com'); return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`; } catch { return href; }
};
const hasDoor = (links) => links.some((a) => a.href === SITE && a.label === 'West Peek Productions ↗')
  && links.some((a) => a.href === COMMUNITY && a.label === 'Community as a service ↗');

function problems(html, { home = false } = {}) {
  const out = [];
  const header = block(html, /<header class="site-header"[\s\S]*?<\/header>/);
  const footer = block(html, /<footer class="site-footer"[\s\S]*?<\/footer>/);
  const brand = anchors(header).find((a) => /class="brand"/.test(a.attrs));
  if (!brand) out.push('no logo link');
  else if (brand.href !== SITE) out.push(`logo goes to ${brand.href}, not ${SITE}`);
  const nav = anchors(block(header, /<nav[\s\S]*?<\/nav>/));
  if (!hasDoor(nav)) out.push('header menu does not reach westpeekproductions.com and its community-as-a-service page');
  if (!nav.some((a) => a.href === '/' && a.label === 'Library home')) out.push('header menu has no "Library home" link');
  if (!hasDoor(anchors(footer))) out.push('footer does not reach westpeekproductions.com and its community-as-a-service page');
  for (const a of anchors(html)) {
    const m = a.label.match(ADDRESS_LABEL);
    if (!m) continue;
    const want = `${m[1].toLowerCase().replace(/^www\./, '')}${(m[2] || '').replace(/\/+$/, '')}`;
    if (where(a.href) !== want) out.push(`link labelled "${a.label}" goes to ${a.href}`);
  }
  if (home) {
    const ways = block(html, /<section[^>]*class="[^"]*two-ways[\s\S]*?<\/section>/);
    if (!/<h2>Two ways West Peek Productions helps<\/h2>/.test(ways)) out.push('home has no "Two ways West Peek Productions helps" section');
    const community = block(ways, /<div class="way" id="community-as-a-service">[\s\S]*?<\/div>/);
    if (!anchors(community).some((a) => a.href === COMMUNITY && /3-minute quiz/.test(a.label))) out.push('home community block does not link the 3-minute quiz');
    if (!anchors(community).some((a) => a.href === SITE)) out.push('home community block does not link westpeekproductions.com');
    const events = block(ways, /<div class="way" id="virtual-and-hybrid-events">[\s\S]*?<\/div>/);
    if (!anchors(events).some((a) => a.href === 'https://westpeek.live/venue/demo/lobby' && /demo venue/.test(a.label))) out.push('home events block does not link the westpeek.live demo venue');
    if (anchors(html).some((a) => /westpeek\.live\/(?:signup|sign-up|register|join|apply|early-access)/i.test(a.href))) out.push('home links a westpeek.live sign-up form');
  }
  return out;
}

if (process.argv.includes('--self-test')) {
  const fails = [];
  for (const rel of ['index.html', 'about.html', 'programmatic/webinar-production.html']) {
    const p = problems(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { home: rel === 'index.html' });
    if (!p.length) fails.push(`${rel} (unfinished) passed`);
  }
  const chrome = (body) => `<header class="site-header"><a class="brand" href="${SITE}">x</a><nav><a href="/">Library home</a><a href="${SITE}">West Peek Productions ↗</a><a href="${COMMUNITY}">Community as a service ↗</a></nav></header>${body}<footer class="site-footer"><a href="${SITE}">West Peek Productions ↗</a><a href="${COMMUNITY}">Community as a service ↗</a></footer>`;
  const toForm = problems(chrome('<p><a href="/go/plan?from=about">westpeekproductions.com</a></p>'));
  if (!toForm.some((x) => /labelled "westpeekproductions.com"/.test(x))) fails.push(`an address-labelled link to the form passed (${toForm})`);
  const good = problems(chrome('<p><a href="https://westpeekproductions.com/">westpeekproductions.com</a> <a href="/go/plan">Start an inquiry</a></p>'));
  if (good.length) fails.push(`a correct page failed (${good})`);
  if (fails.length) { console.error(`test:main-door self-test FAILED: ${fails.join('; ')}`); process.exit(1); }
  console.log('test:main-door self-test OK: unfinished pages and a mislabelled link fail, a correct page passes');
  process.exit(0);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'main-door-'));
execFileSync('node', [path.join(ROOT, 'scripts/assemble_pages_output.js')], { cwd: ROOT, env: { ...process.env, PAGES_ASSEMBLE_OUT: out }, stdio: 'ignore' });
const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    if (fs.statSync(f).isDirectory()) { if (!['admin', 'go'].includes(n) || d !== out) walk(f); } else if (n.endsWith('.html')) files.push(f);
  }
})(out);
const bad = [];
const checked = new Set();
for (const f of files) {
  const rel = path.relative(out, f).replace(/\\/g, '/');
  const html = fs.readFileSync(f, 'utf8');
  if (/http-equiv="refresh"/.test(html) && /name="robots" content="noindex/.test(html)) continue;
  const p = problems(html, { home: rel === 'index.html' });
  if (p.length) bad.push(`${rel}: ${p.join('; ')}`);
  checked.add(rel);
}
fs.rmSync(out, { recursive: true, force: true });
const { sitemapPaths, candidates } = require('./lib/sitemap_floor.js');
const listed = sitemapPaths(ROOT);
const unchecked = listed.filter((url) => !candidates(url).some((rel) => checked.has(rel)));
if (!listed.length || unchecked.length || !checked.has('index.html')) {
  console.error(`test:main-door floor: ${unchecked.length} of ${listed.length} sitemap page(s) not checked${checked.has('index.html') ? '' : ' (home missing)'}:\n  ${unchecked.slice(0, 15).join('\n  ')}`);
  process.exit(1);
}
if (bad.length) { console.error(`test:main-door FAILED on ${bad.length} of ${checked.size} pages:\n  ${bad.slice(0, 15).join('\n  ')}`); process.exit(1); }
console.log(`test:main-door OK: ${checked.size} published pages reach westpeekproductions.com (${listed.length} sitemap pages covered)`);
