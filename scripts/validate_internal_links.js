#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: an internal href or src on a published page that the live domain
 * cannot answer.
 *
 * ─── Two holes this gate used to have ───────────────────────────────────────
 *
 * 1. IT ONLY LOOKED AT `href`. An `<img src>` was never examined, so thirteen
 *    pages under answers/ carried `src="assets/west-peek-productions-logo.jpeg"`
 *    - relative, so a browser at /answers/<page> resolves it to
 *    /answers/assets/west-peek-productions-logo.jpeg, which 404s. Ahrefs Site
 *    Audit, project Virtualagency-os, crawl of 3 September 2026, counted it
 *    exactly: "Page has broken image: 13", "Image broken: 1", inside 3,453
 *    internal URLs at Health Score 22 (Errors 2,705 · Warnings 3,206).
 *
 * 2. IT ASKED THE WRONG QUESTION. `fs.existsSync` against the repo tree answers
 *    "is this file in the repository", but the live domain answers only for what
 *    scripts/assemble_pages_output.js copies into .pages-output. /admin/ linked
 *    to seven /data/**.json files that exist on disk and are deliberately
 *    excluded from the deploy, so this gate called them fine while all seven
 *    404'd in production. The publish rule now comes from the assembler itself,
 *    so the deployer and the validator cannot disagree.
 *
 * 3. IT NEVER READ META OR STRUCTURED DATA. Fourteen pages carried
 *    `"logo":"assets/west-peek-productions-logo.jpeg"` in Organization JSON-LD
 *    and `content="assets/..."` in og:image / twitter:image. Neither is an
 *    href or src, so this gate never saw them; Ahrefs Site Audit (crawl of
 *    24 September 2026, PR #25) did. Open Graph and schema.org both require an
 *    absolute URL there, so og:image, twitter:image and JSON-LD "logo"/"image"
 *    must now be absolute http(s) URLs, and on our own origin must resolve to a
 *    published file.
 *
 * Both holes are the same shape: a check that runs, reports green, and is
 * incapable of seeing the defect it is named for.
 *
 * ─── RULE 0 ─────────────────────────────────────────────────────────────────
 *
 * Three floors, because a corpus can be empty in three ways. Fewer than
 * MIN_PAGES published pages means the generators have not run yet. Zero link
 * attributes means the scan regex matched nothing. Fewer than MIN_SRC src
 * attributes means the newly-added src coverage examined nothing - which is how
 * hole (1) would silently come back. Each exits non-zero rather than passing
 * over an empty loop.
 */
const fs = require('fs');
const path = require('path');
const { isPublishedPath } = require('./assemble_pages_output.js');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['.pages-output', 'node_modules', '.git', '.build', 'logs', 'artifacts']);

const MIN_PAGES = 100;
const MIN_SRC = 50;
// Image URLs carried in og:image / twitter:image and in JSON-LD "logo"/"image".
const MIN_IMAGE_URLS = 20;
const SITE_ORIGIN = 'https://virtualagency-os.com';

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    // Only pages that actually reach the live domain are in scope. A page under
    // docs/ or tests/ is never served, so its links are not a production defect.
    if (dir === ROOT && !isPublishedPath(name)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function candidatePaths(from, target) {
  const clean = target.split('#')[0].split('?')[0];
  if (!clean) return [];
  const base = clean.startsWith('/')
    ? path.join(ROOT, clean)
    : path.resolve(path.dirname(from), clean);
  const c = [base, path.join(base, 'index.html')];
  if (!path.extname(base)) c.push(`${base}.html`);
  return c;
}

/** Resolvable means: a FILE exists for it AND the deploy publishes that file. */
function resolves(from, target) {
  if (!target || /^(https?:|mailto:|tel:|#|javascript:|data:|\/\/)/i.test(target)) return true;
  for (const p of candidatePaths(from, target)) {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    if (!isPublishedPath(path.relative(ROOT, p))) {
      return { published: false, hit: path.relative(ROOT, p) };
    }
    return true;
  }
  return false;
}

const LINK_ATTR = /\b(href|src)\s*=\s*["']([^"']+)["']/gi;
const bad = [];
const files = walk(ROOT);
let attrs = 0;
let srcAttrs = 0;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  LINK_ATTR.lastIndex = 0;
  let m;
  while ((m = LINK_ATTR.exec(html))) {
    const attr = m[1].toLowerCase();
    const target = m[2];
    attrs += 1;
    if (attr === 'src') srcAttrs += 1;
    const r = resolves(file, target);
    if (r === true) continue;
    const rel = path.relative(ROOT, file);
    if (r && r.published === false) {
      bad.push(`${rel} -> ${attr}="${target}" (${r.hit} exists but the deploy excludes it, so this is a 404 in production)`);
    } else {
      bad.push(`${rel} -> ${attr}="${target}" (resolves to nothing)`);
    }
  }
}

// Hole (3): image URLs in meta tags and JSON-LD must be absolute and live.
const META_IMAGE = /<meta\s+(?:property|name)\s*=\s*["'](?:og|twitter):image["']\s+content\s*=\s*["']([^"']*)["']/gi;
const LD_BLOCK = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const LD_IMAGE = /"(logo|image)"\s*:\s*"([^"]*)"/g;
let imageUrls = 0;
function checkImageUrl(file, where, value) {
  imageUrls += 1;
  const rel = path.relative(ROOT, file);
  if (!/^https?:\/\//i.test(value)) {
    bad.push(`${rel} -> ${where}="${value}" (not an absolute URL; Open Graph and schema.org require one, crawlers resolve it against the page path)`);
    return;
  }
  if (value.toLowerCase().startsWith(`${SITE_ORIGIN}/`)) {
    const local = value.slice(SITE_ORIGIN.length);
    if (resolves(path.join(ROOT, 'index.html'), local) !== true) {
      bad.push(`${rel} -> ${where}="${value}" (our origin, but no published file answers ${local})`);
    }
  }
}
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  META_IMAGE.lastIndex = 0;
  let m;
  while ((m = META_IMAGE.exec(html))) checkImageUrl(file, 'meta image', m[1]);
  LD_BLOCK.lastIndex = 0;
  while ((m = LD_BLOCK.exec(html))) {
    LD_IMAGE.lastIndex = 0;
    let k;
    while ((k = LD_IMAGE.exec(m[1]))) checkImageUrl(file, `JSON-LD ${k[1]}`, k[2]);
  }
}

// RULE 0 - an empty corpus is a failure, not a pass. Checked before the verdict
// so that "0 offenders over 0 pages" can never be printed as success.
if (files.length < MIN_PAGES) {
  console.error(`INTERNAL LINK VALIDATION EXAMINED ONLY ${files.length} PUBLISHED PAGES (floor ${MIN_PAGES}). A gate that examines nothing cannot fail, so this is reported as a failure rather than a pass. Check that the published HTML surface is present in this checkout and that this gate runs AFTER whatever produces it.`);
  process.exit(1);
}
if (attrs === 0) {
  console.error(`INTERNAL LINK VALIDATION EXAMINED 0 LINK ATTRIBUTES across ${files.length} pages. The scan matched nothing, so its silence proves nothing.`);
  process.exit(1);
}
if (srcAttrs < MIN_SRC) {
  console.error(`INTERNAL LINK VALIDATION EXAMINED ONLY ${srcAttrs} src ATTRIBUTES (floor ${MIN_SRC}). src coverage is the half of this gate that catches broken images; if it examines nothing it cannot catch them, so this is a failure rather than a pass.`);
  process.exit(1);
}

if (imageUrls < MIN_IMAGE_URLS) {
  console.error(`INTERNAL LINK VALIDATION EXAMINED ONLY ${imageUrls} META/JSON-LD IMAGE URLS (floor ${MIN_IMAGE_URLS}). That scan is how relative logo paths in structured data are caught; if it examines nothing it cannot catch them, so this is a failure rather than a pass.`);
  process.exit(1);
}

if (bad.length) {
  console.error(`Broken internal links (${bad.length}):`);
  for (const item of bad.slice(0, 80)) console.error(`- ${item}`);
  if (bad.length > 80) console.error(`... and ${bad.length - 80} more`);
  process.exit(1);
}

console.log(`Internal link validation OK: ${files.length} published HTML files, ${attrs} link attributes (${srcAttrs} src), ${imageUrls} meta/JSON-LD image URLs`);
