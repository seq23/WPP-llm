#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * First step of `npm run titles:refreeze`, the EXACT_ROUTE_THAW_VALIDATE_REFREEZE
 * the freeze contract asks for when an at-source fix changes accepted output.
 *
 * It thaws exactly the hash-locked routes whose <title> the brand fix changes, by
 * writing data/release/active_mutation_scope.json. Then: build (apply_site_head
 * and apply_title_suffix_band write the pages) -> freeze (accept the new hashes)
 * -> clear-scope. authority:scale:freeze refuses any unscoped drift, so a route
 * this step misses stops the release rather than slipping through.
 *
 * The thaw list comes from scripts/lib/title_brand.js, the same module that
 * decides the titles, so the two lists cannot disagree.
 *
 * RULE 0: a run that would thaw nothing exits non-zero rather than quietly
 * writing an empty scope and reporting success.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, walk, frozenFiles, routeFor } = require('./lib/site_head.js');
const { planTitles } = require('./lib/title_brand.js');

const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
const unesc = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const pages = [];
for (const rel of walk(ROOT, ROOT, [])) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (tm) pages.push({ rel, title: unesc(tm[1]).trim() });
}

const { changes, tooLong, collisions } = planTitles(pages);
const frozen = frozenFiles();
const routes = [...changes.keys()].filter((rel) => frozen.has(rel)).map(routeFor).sort();

if (!changes.size) {
  console.error('titles:refreeze: no title needs the site\'s name added; refusing to write an empty scope.');
  process.exit(1);
}

// A scope file that already exists is an open thaw transaction (for example
// npm run demand:refreeze); its routes are kept, not replaced.
const scopeAbs = path.join(ROOT, contract.active_mutation_scope);
const open = fs.existsSync(scopeAbs) ? (JSON.parse(fs.readFileSync(scopeAbs, 'utf8')).routes || []) : [];
const allRoutes = [...new Set([...open, ...routes])].sort();
fs.writeFileSync(scopeAbs, `${JSON.stringify({
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  source: 'scripts/lib/title_brand.js (Search Readiness b1 + b10)',
  routes: allRoutes,
}, null, 2)}\n`);
console.log(`titles:refreeze: ${changes.size} title(s) to rewrite, ${routes.length} of them hash-locked and now thawed (${allRoutes.length} route(s) in scope); ${tooLong.length} name(s) too long to carry the brand, ${collisions.length} refused as a duplicate.`);
