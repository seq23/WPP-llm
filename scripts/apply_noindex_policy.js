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
 *   node scripts/apply_noindex_policy.js --check   report drift, change nothing
 *   node scripts/apply_noindex_policy.js           apply
 */
const fs = require('fs');
const path = require('path');
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

for (const route of klass) {
  const file = path.join(ROOT, `${route.replace(/^\//, '')}.html`);
  if (!fs.existsSync(file)) { missing.push(route); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(ROBOTS_RE);
  if (!m) { missing.push(`${route} (no robots meta)`); continue; }

  const want = noindexSet.has(route) ? 'noindex,follow' : INDEXABLE;
  const have = m[2];
  if (have === want) { alreadyCorrect.push(route); continue; }

  changed.push({ route, from: have, to: want });
  if (!CHECK_ONLY) {
    fs.writeFileSync(file, html.replace(ROBOTS_RE, `$1${want}$3`));
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
}, null, 2));

if (missing.length) {
  console.error('Pages in the class with no file or no robots meta:');
  for (const r of missing.slice(0, 20)) console.error(`  - ${r}`);
  process.exit(1);
}
if (CHECK_ONLY && changed.length) {
  console.error(`${changed.length} page(s) drift from the noindex policy; run without --check to reconcile.`);
  process.exit(1);
}
