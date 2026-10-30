#!/usr/bin/env node
// Retrofit the canonical Organization facts across already-published pages.
//
// WHY. Six generators in this repo emit JSON-LD and only two of them read
// scripts/lib/entity.mjs, which is the drift that file's own header warns about.
// The result on 26 Oct 2026: 3,195 of 3,197 published pages carried an
// Organization with a name and a url and nothing else. The programmatic
// renderer writes an inline `publisher` Organization with @type/@id/name/url;
// the standalone ORG_LD block in build_link_architecture.js has sameAs but no
// logo; the insights builder writes a third shape. An AI engine reading the
// first Organization on the page therefore had no logo and often no sameAs, and
// could not resolve the publisher to one entity.
//
// This step does not re-render anything. It edits only the Organization nodes
// that are already there, merging in the canonical facts (logo, sameAs, and any
// other key the canonical entity asserts that the node is missing) from
// WEST_PEEK_PRODUCTIONS. Keys the page already carries - @id, alternateName,
// contactPoint, email - are left exactly as they are.
//
// 30 Oct 2026: sameAs and description are now AUTHORITATIVE, not fill-only.
// data/entity/entity.json is the one declaration of them, and filling only
// missing keys had left four different sameAs lists live at once (2,277 nodes
// carried the company site alone, the homepage carried a third list). So this
// step now overwrites sameAs and description on every West Peek Organization
// node, and overwrites sameAs on every Scooter Taylor Person node, with the
// entity.json values. validate_entity_graph.mjs fails when a page disagrees.
//
// Idempotent: a page whose West Peek Organization nodes are already complete is
// left untouched, so this can run on every build and in batches.
//
// RULE 0: a run that finds no West Peek Organization node on any page means the
// matcher has stopped matching, and that exits 1 rather than reporting success.
import fs from 'node:fs';
import path from 'node:path';
import { WEST_PEEK_PRODUCTIONS, ORG_ID, SCOOTER_TAYLOR, PERSON_ID } from './lib/entity.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist-cache', 'reports', 'artifacts',
  'scripts', 'data', 'docs', 'tests', 'fixtures', 'config', 'content', 'templates', 'logs',
  'releases', 'seo', 'distribution_scripts']);

// The facts this step is responsible for. Anything else on the node is the
// page's own business.
const CANONICAL = ['logo', 'sameAs', 'url', 'name', 'description'];
// Of those, the facts entity.json owns outright: overwritten when they differ.
const AUTHORITATIVE = new Set(['sameAs', 'description']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Is this node the founder Person, under any of its shapes (incl. inline founder)? */
const isFounder = (n) => {
  if (!n || typeof n !== 'object') return false;
  const types = [].concat(n['@type']).filter(Boolean).map(String);
  if (n['@id'] === PERSON_ID) return types.length === 0 || types.includes('Person');
  return types.includes('Person') && n.name === SCOOTER_TAYLOR.name;
};
const ORG_TYPE = /^(Organization|Corporation|NewsMediaOrganization|ProfessionalService|LocalBusiness)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.isFile() && e.name.endsWith('.html')) out.push(abs);
  }
  return out;
}

const LD_RE = /(<script[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/gi;
const stats = { scanned: 0, pages_with_org: 0, already: 0, changed: 0, nodes_filled: 0, unparseable: 0, skipped_nonpublic: 0 };
const touched = [];

/** Is this node the West Peek organization, under any of its shapes? */
const isWestPeek = (n) => {
  if (!n || typeof n !== 'object') return false;
  const types = [].concat(n['@type']).filter(Boolean).map(String);
  if (!types.some((t) => ORG_TYPE.test(t))) return false;
  return n['@id'] === ORG_ID || n.name === WEST_PEEK_PRODUCTIONS.name;
};

/** Walk every nested object, so an inline `publisher` is reached too. */
function eachNode(x, fn, seen = new Set()) {
  if (!x || typeof x !== 'object' || seen.has(x)) return;
  seen.add(x);
  if (Array.isArray(x)) { for (const v of x) eachNode(v, fn, seen); return; }
  fn(x);
  for (const v of Object.values(x)) if (v && typeof v === 'object') eachNode(v, fn, seen);
}

for (const abs of walk(ROOT)) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  let html = fs.readFileSync(abs, 'utf8');
  stats.scanned++;
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html) || /^admin\//.test(rel) || rel.includes('/admin/')) {
    stats.skipped_nonpublic++; continue;
  }
  if (!/application\/ld\+json/i.test(html)) continue;

  let sawOrg = false, filledHere = 0, bad = false;
  const next = html.replace(LD_RE, (m, open, body, close) => {
    let data;
    try { data = JSON.parse(body.trim()); } catch { bad = true; return m; }
    let changedBlock = false;
    eachNode(data, (n) => {
      if (isFounder(n) && Object.keys(n).some((k) => k !== '@id')) {
        // A bare {"@id": ...} reference stays a reference; any node that states
        // facts about the founder states the canonical sameAs.
        if (!same(n.sameAs, SCOOTER_TAYLOR.sameAs)) {
          n.sameAs = [...SCOOTER_TAYLOR.sameAs];
          changedBlock = true;
          filledHere++;
        }
        return;
      }
      if (!isWestPeek(n)) return;
      sawOrg = true;
      for (const k of CANONICAL) {
        const missing = n[k] === undefined || n[k] === null
          || (Array.isArray(n[k]) && !n[k].length)
          || (typeof n[k] === 'string' && !n[k].trim());
        const stale = AUTHORITATIVE.has(k) && !missing && !same(n[k], WEST_PEEK_PRODUCTIONS[k]);
        if ((missing || stale) && WEST_PEEK_PRODUCTIONS[k] !== undefined) {
          n[k] = JSON.parse(JSON.stringify(WEST_PEEK_PRODUCTIONS[k]));
          changedBlock = true;
          filledHere++;
        }
      }
    });
    return changedBlock ? `${open}${JSON.stringify(data)}${close}` : m;
  });

  if (bad) { stats.unparseable++; continue; }
  if (sawOrg) stats.pages_with_org++;
  if (next === html) { if (sawOrg) stats.already++; continue; }
  stats.changed++;
  stats.nodes_filled += filledHere;
  touched.push(rel);
  if (!DRY) fs.writeFileSync(abs, next);
}

console.log(`[organization-entity]${DRY ? ' DRY-RUN' : ''} ` + Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(' '));
if (touched.length) console.log('  first:', touched.slice(0, 3).join(', '));

if (!stats.pages_with_org) {
  console.error('[organization-entity] FAILED: no West Peek Organization node found on any published page. The matcher has stopped matching; it is not that the site has no publisher.');
  process.exit(1);
}
