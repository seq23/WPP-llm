#!/usr/bin/env node
// validate_entity_graph: every published page states the entity the way
// data/entity/entity.json declares it.
//
// WHY. On 30 Oct 2026 four different sameAs lists for West Peek Productions were
// live at once (2,277 nodes carried the company site alone, the homepage carried
// a fifth shape with a tracking-parameter LinkedIn URL), and the founder's
// Wikidata item existed but no page named it. Nothing compared the pages with
// the declaration, so drift was invisible.
//
// What it checks:
//   1. entity.json itself: non-empty sameAs for the organization and the
//      founder, every entry https, no entry on this site's own host, no pending
//      profile already in sameAs, ids equal to scripts/lib/entity.mjs.
//   2. Every West Peek Organization node on every public page: sameAs equals
//      entity.json (exact list), description equals it, name equals it, and the
//      logo URL equals it.
//   3. Every founder Person node that states facts: sameAs equals entity.json.
//   4. No sameAs anywhere in the corpus points at this site's own host.
//
// RULE 0: zero Organization nodes found across the corpus is a failure - it means
// the corpus is missing or the matcher broke, not that the site is clean.
import fs from 'node:fs';
import path from 'node:path';
import { ENTITY, ORG_ID, PERSON_ID, WEST_PEEK_PRODUCTIONS, SCOOTER_TAYLOR } from '../lib/entity.mjs';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist-cache', 'reports', 'artifacts',
  'scripts', 'data', 'docs', 'tests', 'fixtures', 'config', 'content', 'templates', 'logs',
  'releases', 'seo', 'distribution_scripts']);
const ORG_TYPE = /^(Organization|Corporation|NewsMediaOrganization|ProfessionalService|LocalBusiness)$/;
const LD_RE = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
const SITE_HOST = String(ENTITY.site || '').replace(/^www\./, '');

const errors = [];
const fail = (msg) => { if (errors.length < 400) errors.push(msg); else errors.overflow = (errors.overflow || 0) + 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

// ---- 1. the declaration -------------------------------------------------------
const org = ENTITY.organization || {};
const founder = ENTITY.founder || {};
if (!SITE_HOST) fail('entity.json: site is empty');
for (const [label, node] of [['organization', org], ['founder', founder]]) {
  if (!Array.isArray(node.sameAs) || !node.sameAs.length) fail(`entity.json: ${label}.sameAs is empty`);
  for (const u of node.sameAs || []) {
    if (!/^https:\/\//.test(u)) fail(`entity.json: ${label}.sameAs entry is not https: ${u}`);
    if (hostOf(u) === SITE_HOST) fail(`entity.json: ${label}.sameAs points at this site's own host: ${u}`);
  }
  if (new Set(node.sameAs || []).size !== (node.sameAs || []).length) fail(`entity.json: ${label}.sameAs has duplicates`);
}
for (const p of ENTITY.profiles_pending || []) {
  if ([...(org.sameAs || []), ...(founder.sameAs || [])].includes(p.url)) {
    fail(`entity.json: pending profile is already in sameAs: ${p.url}`);
  }
}
if (org['@id'] !== ORG_ID) fail(`entity.json: organization @id ${org['@id']} != entity.mjs ORG_ID ${ORG_ID}`);
if (founder['@id'] !== PERSON_ID) fail(`entity.json: founder @id ${founder['@id']} != entity.mjs PERSON_ID ${PERSON_ID}`);
if (!same(WEST_PEEK_PRODUCTIONS.sameAs, org.sameAs)) fail('entity.mjs organization sameAs does not equal entity.json');
if (!same(SCOOTER_TAYLOR.sameAs, founder.sameAs)) fail('entity.mjs founder sameAs does not equal entity.json');
if (!org.description) fail('entity.json: organization.description is empty');

// ---- 2-4. the corpus ----------------------------------------------------------
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.isFile() && e.name.endsWith('.html')) out.push(abs);
  }
  return out;
}
function eachNode(x, fn, seen = new Set()) {
  if (!x || typeof x !== 'object' || seen.has(x)) return;
  seen.add(x);
  if (Array.isArray(x)) { for (const v of x) eachNode(v, fn, seen); return; }
  fn(x);
  for (const v of Object.values(x)) if (v && typeof v === 'object') eachNode(v, fn, seen);
}
const typesOf = (n) => [].concat(n['@type']).filter(Boolean).map(String);
const isWestPeek = (n) => typesOf(n).some((t) => ORG_TYPE.test(t)) && (n['@id'] === ORG_ID || n.name === org.name);
const isFounder = (n) => (n['@id'] === PERSON_ID && (typesOf(n).length === 0 || typesOf(n).includes('Person')))
  || (typesOf(n).includes('Person') && n.name === founder.name);

let pages = 0, orgNodes = 0, personNodes = 0;
for (const abs of walk(ROOT)) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const html = fs.readFileSync(abs, 'utf8');
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html) || /^admin\//.test(rel) || rel.includes('/admin/')) continue;
  pages++;
  for (const m of html.matchAll(LD_RE)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; } // parse errors belong to validate_structured_data
    eachNode(data, (n) => {
      if (Array.isArray(n.sameAs) || typeof n.sameAs === 'string') {
        for (const u of [].concat(n.sameAs)) {
          if (hostOf(u) === SITE_HOST) fail(`${rel}: sameAs points at this site's own host: ${u}`);
        }
      }
      if (isWestPeek(n)) {
        orgNodes++;
        if (!same(n.sameAs, org.sameAs)) fail(`${rel}: Organization sameAs ${JSON.stringify(n.sameAs)} != entity.json`);
        if (n.description !== org.description) fail(`${rel}: Organization description differs from entity.json`);
        if (n.name !== org.name) fail(`${rel}: Organization name "${n.name}" != "${org.name}"`);
        const logo = typeof n.logo === 'string' ? n.logo : n.logo && n.logo.url;
        if (logo !== org.logo) fail(`${rel}: Organization logo ${logo} != ${org.logo}`);
      } else if (isFounder(n) && Object.keys(n).some((k) => k !== '@id')) {
        personNodes++;
        if (!same(n.sameAs, founder.sameAs)) fail(`${rel}: founder sameAs ${JSON.stringify(n.sameAs)} != entity.json`);
      }
    });
  }
}

if (!orgNodes) fail(`RULE 0: no West Peek Organization node found on any of ${pages} public page(s); the corpus is missing or the matcher broke`);
if (errors.length) {
  console.error(`[entity-graph] FAILED (${errors.length}${errors.overflow ? '+' + errors.overflow : ''} problem(s)); first 20:`);
  for (const e of errors.slice(0, 20)) console.error('  - ' + e);
  console.error('Fix: edit data/entity/entity.json, then `npm run entity:converge` to rewrite and refreeze the pages.');
  process.exit(1);
}
console.log(`[entity-graph] OK: ${pages} public page(s), ${orgNodes} Organization node(s), ${personNodes} founder node(s) match data/entity/entity.json (sameAs ${org.sameAs.length}+${founder.sameAs.length})`);
