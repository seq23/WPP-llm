#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Writes the noindex decision from scripts/lib/noindex_policy.js into the
 * robots meta of the pages already on disk.
 *
 * This is deliberately a separate, re-runnable step rather than a one-off edit.
 * The 3,103 programmatic pages are committed build output: a page regenerated
 * from a release plan would silently come back indexed if the only record of
 * the decision were the HTML itself. The renderer therefore asks the same
 * module (see scripts/citation_intelligence/render_programmatic_page.js), and
 * this script exists to reconcile what is already committed with what the
 * module says today - including reverting a page to index,follow the moment it
 * earns an impression.
 *
 * It never deletes a file, never touches a page outside the audience-permutation
 * class, and refuses to run at all if any protected route resolves to noindex.
 *
 * FROZEN OUTPUT. Accepted pages are restored byte-for-byte from
 * data/release/frozen_accepted_outputs by `npm run authority:scale:restore`,
 * which `npm run build` runs AFTER this step and after the sitemap is written.
 * Editing only the file on disk therefore lasted until the restore: on
 * 2026-10-05 (runs 37323430900, 37323426591) a page earned an impression, this
 * step indexed it, the sitemap listed it, the restore put the frozen noindex
 * copy back, and validate_sitemap_coverage.js failed both lanes on "noindex
 * page listed in sitemap". So the decision is written into the frozen copy too
 * (the robots meta only - nothing else in the accepted bytes changes) and the
 * registry hash follows it, unless the route is thawed in the active mutation
 * scope, in which case the freeze step of that transaction captures it.
 *
 *   node scripts/apply_noindex_policy.js --check   report drift (disk AND frozen copy), change nothing
 *   node scripts/apply_noindex_policy.js           apply
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const policy = require('./lib/noindex_policy.js');

const ROOT = path.resolve(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

const INDEXABLE = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const ROBOTS_RE = /(<meta[^>]+name=["']robots["'][^>]*content=["'])([^"']*)(["'][^>]*>)/i;

// Refuse to write anything until the protected set is proven safe.
const assertion = policy.assertNoProtectedRouteIsNoindexed();

const { klass, noindex } = policy.classify();
const noindexSet = new Set(noindex);

const changed = [];
const missing = [];
const alreadyCorrect = [];
const frozenChanged = [];

// The frozen copy every restore writes back over the page on disk.
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const freezeContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
const frozenRegistryFile = path.join(ROOT, freezeContract.frozen_registry);
const frozenRegistry = fs.existsSync(frozenRegistryFile) ? JSON.parse(fs.readFileSync(frozenRegistryFile, 'utf8')) : { pages: [] };
const frozenByRoute = new Map((frozenRegistry.pages || []).map((p) => [String(p.route).replace(/\/+$/, ''), p]));
const scopeFile = path.join(ROOT, freezeContract.active_mutation_scope);
const thawed = new Set(fs.existsSync(scopeFile)
  ? (JSON.parse(fs.readFileSync(scopeFile, 'utf8')).routes || []).map((r) => String(r).replace(/\/+$/, ''))
  : []);

function reconcileFrozen(route, want) {
  const entry = frozenByRoute.get(route);
  if (!entry || thawed.has(route)) return;
  const cache = path.join(ROOT, entry.cache_file || '');
  if (!fs.existsSync(cache)) { missing.push(`${route} (frozen cache ${entry.cache_file} missing)`); return; }
  const raw = zlib.gunzipSync(fs.readFileSync(cache)).toString('utf8');
  const m = raw.match(ROBOTS_RE);
  if (!m) { missing.push(`${route} (frozen copy has no robots meta)`); return; }
  if (m[2] === want) return;
  frozenChanged.push({ route, from: m[2], to: want });
  if (CHECK_ONLY) return;
  const next = Buffer.from(raw.replace(ROBOTS_RE, `$1${want}$3`), 'utf8');
  const accepted = sha(next);
  const cacheRel = `${freezeContract.cache_dir}/${accepted}.html.gz`;
  const cacheAbs = path.join(ROOT, cacheRel);
  if (!fs.existsSync(cacheAbs)) fs.writeFileSync(cacheAbs, zlib.gzipSync(next, { level: 9 }));
  entry.accepted_sha256 = accepted;
  entry.cache_file = cacheRel;
  entry.cache_sha256 = sha(fs.readFileSync(cacheAbs));
}

for (const route of klass) {
  const file = path.join(ROOT, `${route.replace(/^\//, '')}.html`);
  if (!fs.existsSync(file)) { missing.push(route); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(ROBOTS_RE);
  if (!m) { missing.push(`${route} (no robots meta)`); continue; }

  const want = noindexSet.has(route) ? 'noindex,follow' : INDEXABLE;
  reconcileFrozen(route, want);
  const have = m[2];
  if (have === want) { alreadyCorrect.push(route); continue; }

  changed.push({ route, from: have, to: want });
  if (!CHECK_ONLY) {
    fs.writeFileSync(file, html.replace(ROBOTS_RE, `$1${want}$3`));
  }
}

if (frozenChanged.length && !CHECK_ONLY) {
  fs.writeFileSync(frozenRegistryFile, `${JSON.stringify(frozenRegistry, null, 2)}\n`);
  // Drop cache files no frozen page references any more (freeze() does the same).
  const keep = new Set((frozenRegistry.pages || []).map((p) => p.cache_file));
  for (const name of fs.readdirSync(path.join(ROOT, freezeContract.cache_dir))) {
    const rel = `${freezeContract.cache_dir}/${name}`;
    if (name.endsWith('.html.gz') && !keep.has(rel)) fs.rmSync(path.join(ROOT, rel), { force: true });
  }
}

console.log(JSON.stringify({
  mode: CHECK_ONLY ? 'check' : 'apply',
  protected_assertion: assertion,
  audience_permutation_class: klass.length,
  noindex_target: noindex.length,
  indexed_kept: klass.length - noindex.length,
  already_correct: alreadyCorrect.length,
  changed: changed.length,
  to_noindex: changed.filter((c) => c.to === 'noindex,follow').length,
  restored_to_index: changed.filter((c) => c.to === INDEXABLE).length,
  missing: missing.length,
  frozen_registry_pages: frozenByRoute.size,
  frozen_copies_reconciled: frozenChanged.length,
}, null, 2));

if (missing.length) {
  console.error('Pages in the class with no file or no robots meta:');
  for (const r of missing.slice(0, 20)) console.error(`  - ${r}`);
  process.exit(1);
}
if (!frozenByRoute.size) {
  console.error(`frozen registry ${freezeContract.frozen_registry} lists zero pages; refusing to report the frozen copies as reconciled`);
  process.exit(1);
}
if (CHECK_ONLY && (changed.length || frozenChanged.length)) {
  console.error(`${changed.length} page(s) on disk and ${frozenChanged.length} frozen copy(ies) drift from the noindex policy; run without --check to reconcile.`);
  process.exit(1);
}
