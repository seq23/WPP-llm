#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'insights');
const DRAFTS_DIR = path.join(CONTENT_DIR, '_drafts');
const HTML_INSIGHTS_DIR = path.join(ROOT, 'insights');
const HTML_PILLARS_DIR = path.join(ROOT, 'pillars');
const LLMS_PATH = path.join(ROOT, 'llms.txt');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const REQUIRED_ROOT_FILES = ['.gitignore', 'README.md', 'package.json', '_headers', '_redirects'];
const SITE_BASE = 'https://virtualagency-os.com';
const REQUIRED_TEXT_SNIPPETS = [
  'https://productions.joinwestpeek.com/',
  'scooter@westpeek.ventures'
];

function readUtf8(p) { return fs.readFileSync(p, 'utf8'); }
function fail(msg) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }

function stripFrontmatter(md) {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  if (end === -1) return md;
  return md.slice(end + 4).trim();
}

function normalizeBody(md) {
  return stripFrontmatter(md)
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function listMarkdownFiles(dir, baseLabel) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => (f.endsWith('.md') || f.endsWith('.txt')) && f.toLowerCase() !== 'readme.md')
    .sort()
    .map((file) => ({ file, fullPath: path.join(dir, file), label: `${baseLabel}/${file}` }));
}

function listHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  function walk(current) {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.endsWith('.html')) out.push(full);
    }
  }
  walk(dir);
  return out.sort();
}


function validateNoDuplicateBodies(files, label) {
  const seen = new Map();
  const normalized = [];

  for (const entry of files) {
    if (/-\d{6}\.(md|txt)$/i.test(entry.file)) {
      fail(`Numeric-suffix slug detected in ${label}: ${entry.file}`);
    }

    const raw = readUtf8(entry.fullPath);
    const body = normalizeBody(raw);
    const hash = crypto.createHash('sha1').update(body).digest('hex');
    if (!seen.has(hash)) seen.set(hash, []);
    seen.get(hash).push(entry.label);
    normalized.push({ entry, body });

    const repeatedLineMatch = stripFrontmatter(raw).match(/^(\s*.+)\n(?:\1\n){2,}/m);
    if (repeatedLineMatch) {
      fail(`Repeated line spam detected in ${entry.label}: ${repeatedLineMatch[1].trim()}`);
    }
  }

  for (const group of seen.values()) {
    if (group.length > 1) fail(`Duplicate insight body detected in ${label}: ${group.join(', ')}`);
  }

}

function validateDraftSchedule(draftFiles) {
  const seenDates = new Map();
  const dates = [];

  for (const entry of draftFiles) {
    const m = entry.file.match(/^(\d{4}-\d{2}-\d{2})_/);
    if (!m) {
      fail(`Draft missing leading publish date: ${entry.file}`);
      continue;
    }
    const date = m[1];
    dates.push(date);
    if (!seenDates.has(date)) seenDates.set(date, []);
    seenDates.get(date).push(entry.file);
  }

  for (const [date, files] of seenDates.entries()) {
    if (files.length > 1) fail(`More than one draft scheduled for ${date}: ${files.join(', ')}`);
  }

  if (!dates.length) return;
  const sorted = dates.slice().sort();
  const start = new Date(`${sorted[0]}T00:00:00Z`);
  const end = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`);
  const actual = new Set(sorted);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!actual.has(iso)) fail(`Draft date coverage gap: missing ${iso}`);
  }
}

function validateRequiredRootFiles() {
  for (const file of REQUIRED_ROOT_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) fail(`Missing required root snapshot file: ${file}`);
  }
}

function validateRoutingInMarkdown(files) {
  for (const entry of files) {
    const raw = readUtf8(entry.fullPath);
    if (!raw.includes('scooter@westpeek.ventures')) fail(`Missing direct quote email in ${entry.label}`);
  }
}

function validateRoutingInHtml() {
  const pages = [
    ...listHtmlFiles(HTML_INSIGHTS_DIR),
    ...listHtmlFiles(HTML_PILLARS_DIR),
    path.join(ROOT, 'selected-work.html'),
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'how-west-peek-helps.html'),
    path.join(ROOT, 'articles.html')
  ].filter((p, i, arr) => fs.existsSync(p) && arr.indexOf(p) === i);

  for (const page of pages) {
    const html = readUtf8(page);
    for (const snippet of REQUIRED_TEXT_SNIPPETS) {
      if (!html.includes(snippet)) fail(`Missing required routing text in ${path.relative(ROOT, page)}: ${snippet}`);
    }
  }
}

function validateSitemapParity() {
  if (!fs.existsSync(SITEMAP_PATH)) {
    fail('Missing sitemap.xml');
    return;
  }
  const xml = readUtf8(SITEMAP_PATH);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urlSet = new Set(urls);

  const insightHtml = listHtmlFiles(HTML_INSIGHTS_DIR).map((full) => `${SITE_BASE}/insights/${path.basename(full)}`);
  const pillarHtml = listHtmlFiles(HTML_PILLARS_DIR).map((full) => {
    const rel = path.relative(HTML_PILLARS_DIR, full).replace(/\\/g, '/');
    return `${SITE_BASE}/pillars/${rel}`;
  });

  for (const url of [...insightHtml, ...pillarHtml]) {
    if (!urlSet.has(url)) fail(`Sitemap missing generated URL: ${url}`);
  }

  for (const url of urls) {
    if (url.startsWith(`${SITE_BASE}/insights/`) && !url.endsWith('/insights/index.html')) {
      const name = url.split('/').pop();
      if (!fs.existsSync(path.join(HTML_INSIGHTS_DIR, name))) fail(`Sitemap has stale insights URL: ${url}`);
    }
  }
}

function validateLlms() {
  const llms = readUtf8(LLMS_PATH);
  for (const snippet of REQUIRED_TEXT_SNIPPETS) {
    if (!llms.includes(snippet)) fail(`llms.txt missing required routing text: ${snippet}`);
  }
}

function main() {
  validateRequiredRootFiles();

  const published = listMarkdownFiles(CONTENT_DIR, 'published');
  const drafts = listMarkdownFiles(DRAFTS_DIR, 'drafts');

  validateNoDuplicateBodies(published, 'published insights');
  validateNoDuplicateBodies(drafts, 'draft queue');
  validateNoDuplicateBodies([...published, ...drafts], 'published + draft universe');
  validateDraftSchedule(drafts);
  validateRoutingInMarkdown([...published, ...drafts]);
  validateRoutingInHtml();
  validateSitemapParity();
  validateLlms();

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`Insights validation passed (${published.length} published, ${drafts.length} drafts).`);
}

main();
