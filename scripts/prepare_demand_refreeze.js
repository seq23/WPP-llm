#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * First step of `npm run demand:refreeze` (EXACT_ROUTE_THAW_VALIDATE_REFREEZE
 * for the demand pages):
 *   1. pins data/seo/demand_links.json: every measured landing page of a
 *      top-12 family (data/seo/demand_families.json) that is not itself a
 *      family primary, with the link(s) it must carry to the primary, anchored
 *      with the query Google showed it for;
 *   2. thaws exactly the hash-locked routes that the demand pages and those
 *      links change, by writing data/release/active_mutation_scope.json.
 * Then: build (apply_site_head writes the pages) -> freeze (accept the new
 * hashes) -> clear-scope. authority:scale:freeze refuses any unscoped drift.
 *
 * The links are pinned rather than derived on every build because the daily
 * sweep rebuilds demand_families.json; a live derivation would rewrite
 * hash-locked pages outside any thaw scope and red validate:authority-scale.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, DEMAND_FAMILIES_REL, DEMAND_LINKS_REL, loadConfig, frozenFiles, routeFor, demandLinks } = require('./lib/site_head.js');

const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
const families = JSON.parse(fs.readFileSync(path.join(ROOT, DEMAND_FAMILIES_REL), 'utf8'));
const pages = (loadConfig().demand_pages || []).filter((d) => d.full);
const links = demandLinks(ROOT, pages, families);
if (!links.length) {
  console.error('demand-refreeze: zero secondary landing pages for the top-12 families; refusing to pin an empty link list.');
  process.exit(1);
}
fs.writeFileSync(path.join(ROOT, DEMAND_LINKS_REL), `${JSON.stringify({
  _comment: [
    'Written by scripts/prepare_demand_refreeze.js (npm run demand:refreeze). Do not edit by hand.',
    'Each measured landing page of a top-12 query family links to the family primary with the query Google showed it for. Applied by scripts/apply_site_head.js; proven by scripts/validators/validate_demand_pages.js.',
  ],
  measured_targets_generated_at: families.measured_targets_generated_at,
  link_count: links.reduce((a, l) => a + l.links.length, 0),
  page_count: links.length,
  links,
}, null, 2)}\n`);

const cfg = loadConfig();
const frozen = frozenFiles();
const files = [...new Set([...(cfg.demand_pages || []).map((d) => d.file), ...(cfg.demand_links || []).map((d) => d.file)])];
const routes = files.filter((f) => frozen.has(f)).map(routeFor).sort();
if (!routes.length) {
  console.error('demand-refreeze: zero frozen demand routes; refusing to write an empty scope.');
  process.exit(1);
}
// A scope file that already exists is an open thaw transaction (for example
// npm run seo:consolidate-duplicates); its routes are kept, not replaced.
const scopeAbs = path.join(ROOT, contract.active_mutation_scope);
const open = fs.existsSync(scopeAbs) ? (JSON.parse(fs.readFileSync(scopeAbs, 'utf8')).routes || []) : [];
const allRoutes = [...new Set([...open, ...routes])].sort();
fs.writeFileSync(scopeAbs, `${JSON.stringify({ schema_version: '1.0', generated_at: new Date().toISOString(), source: 'data/seo/demand_pages.json + data/seo/demand_links.json', routes: allRoutes }, null, 2)}\n`);
console.log(`demand-refreeze: pinned ${links.length} linking page(s); thawed ${routes.length} frozen route(s) of ${files.length} demand file(s).`);
