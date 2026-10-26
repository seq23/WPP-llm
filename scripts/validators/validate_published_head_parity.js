#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Every INDEXABLE published page - frozen or not - carries the social head tags
 * and a complete publisher entity.
 *
 * WHY THIS EXISTS, and why validate_social_meta.js was not enough. That gate
 * walks ownedPages(), which excluded frozen accepted output. On 26 Oct 2026 it
 * printed "social meta OK: 434 owned page(s)" while 3,011 of the site's 3,197
 * published pages carried no og:title at all and 3,195 carried an Organization
 * with only a name and a url. The gate was green and the site was wrong, because
 * the gate could not reach 88% of it. A guard that cannot reach what it governs
 * is not a guard, so this one reads the published corpus directly and does not
 * ask what is frozen.
 *
 * It is read-only: it never writes a page. Fixing a failure here means thawing
 * the route into data/release/active_mutation_scope.json and running
 * scripts/apply_site_head.js and scripts/apply_organization_entity.mjs, which is
 * the EXACT_ROUTE_THAW_VALIDATE_REFREEZE policy in
 * data/release/accepted_output_freeze_contract.json.
 *
 * noindex pages and admin views are not public content and are excluded, exactly
 * as scripts/apply_organization_entity.mjs excludes them.
 *
 * RULE 0: the walk must check at least every URL sitemap.xml submits (each is
 * an indexable page), and never fewer than MIN_PAGES. Short of that the walk
 * stopped reaching the site, and that exits 1 rather than reporting success.
 * The floor used to be a fixed 2,500; on 26 Oct 2026 424 duplicate variants
 * were retired by 301 (data/seo/duplicate_family_consolidation.json) and the
 * site is 2,298 sitemap pages, so the floor now tracks the sitemap exactly.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, walk } = require('../lib/site_head.js');

const MIN_PAGES = 2000;
const sitemapFile = path.join(ROOT, 'sitemap.xml');
const SITEMAP_URLS = fs.existsSync(sitemapFile) ? (fs.readFileSync(sitemapFile, 'utf8').match(/<loc>/g) || []).length : 0;
const FLOOR = Math.max(MIN_PAGES, SITEMAP_URLS);
const ORG_ID = 'https://www.westpeekproductions.com/#organization';
const ORG_NAME = 'West Peek Productions';
const ORG_TYPE = /^(Organization|Corporation|NewsMediaOrganization|ProfessionalService|LocalBusiness)$/;
const REQUIRED_META = [
  [/<meta\s+property="og:title"\s+content="[^"]+"/, 'og:title'],
  [/<meta\s+property="og:description"\s+content="[^"]+"/, 'og:description'],
  [/<meta\s+property="og:type"\s+content="[^"]+"/, 'og:type'],
  [/<meta\s+property="og:url"\s+content="[^"]+"/, 'og:url'],
  [/<meta\s+property="og:site_name"\s+content="[^"]+"/, 'og:site_name'],
  [/<meta\s+property="og:image"\s+content="[^"]+"/, 'og:image'],
  [/<meta\s+property="og:image:width"\s+content="\d+"/, 'og:image:width'],
  [/<meta\s+property="og:image:height"\s+content="\d+"/, 'og:image:height'],
  [/<meta\s+name="twitter:card"\s+content="summary_large_image"/, 'twitter:card summary_large_image'],
];

const problems = [];
let checked = 0, orgsChecked = 0;

/** Every nested node, so an inline `publisher` is reached. */
function eachNode(x, fn, seen = new Set()) {
  if (!x || typeof x !== 'object' || seen.has(x)) return;
  seen.add(x);
  if (Array.isArray(x)) { for (const v of x) eachNode(v, fn, seen); return; }
  fn(x);
  for (const v of Object.values(x)) if (v && typeof v === 'object') eachNode(v, fn, seen);
}

for (const rel of walk(ROOT, ROOT, [])) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!/<\/head>/i.test(html)) continue;
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html) || /^admin\//.test(rel) || rel.includes('/admin/')) continue;
  checked++;
  const miss = REQUIRED_META.filter(([re]) => !re.test(html)).map(([, name]) => name);
  if (miss.length) problems.push(`${rel}: missing ${miss.join(', ')}`);

  // The first West Peek Organization in document order - the node an AI engine
  // and the owner's checklist both read - must be complete.
  let first = null;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (first) break;
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { problems.push(`${rel}: JSON-LD does not parse`); continue; }
    eachNode(data, (n) => {
      if (first) return;
      const types = [].concat(n['@type']).filter(Boolean).map(String);
      if (!types.some((t) => ORG_TYPE.test(t))) return;
      if (n['@id'] === ORG_ID || n.name === ORG_NAME) first = n;
    });
  }
  if (first) {
    orgsChecked++;
    const bad = ['name', 'url', 'logo', 'sameAs'].filter((k) => {
      const v = first[k];
      return v === undefined || v === null || (Array.isArray(v) && !v.length) || (typeof v === 'string' && !v.trim());
    });
    if (bad.length) problems.push(`${rel}: first Organization lacks ${bad.join(', ')}`);
  }
}

if (checked < FLOOR) {
  console.error(`published head parity FAILED: only ${checked} indexable page(s) checked (floor ${FLOOR}: max of ${MIN_PAGES} and the ${SITEMAP_URLS} sitemap URLs). The walk has stopped reaching the site; a gate that reads nothing cannot fail.`);
  process.exit(1);
}
if (!orgsChecked) {
  console.error('published head parity FAILED: no West Peek Organization found on any indexable page. The matcher has stopped matching.');
  process.exit(1);
}
if (problems.length) {
  console.error(`published head parity FAILED (${problems.length} of ${checked} indexable page(s)):`);
  for (const p of problems.slice(0, 30)) console.error(`  - ${p}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error('Fix: add the route to data/release/active_mutation_scope.json, run scripts/apply_site_head.js and scripts/apply_organization_entity.mjs, then refreeze (EXACT_ROUTE_THAW_VALIDATE_REFREEZE).');
  process.exit(1);
}
console.log(`published head parity OK: ${checked} indexable page(s) carry og/twitter tags; ${orgsChecked} carry a publisher Organization with name, url, logo and sameAs.`);
