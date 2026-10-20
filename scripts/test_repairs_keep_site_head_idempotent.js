#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Contract test: a bounded repair leaves every page it touches in the state
 * the build produces, so the Search Repair and Retest lane cannot red itself.
 *
 * 19-20 Oct 2026 the lane failed in validate:social-meta on
 * query-atlas/brand-messaging-architecture.html: apply_repairs.js rewrote the
 * meta description but left the site-head block (og:/twitter: description,
 * derived from it) stale, and double-escaped the page text (&amp;quot;).
 *
 * Drives the real repair functions against real published pages and asserts:
 *   1. every applied repair, once written, is a fixed point of apply_site_head.js
 *   2. no repaired description carries a double-escaped entity
 *   3. the og:/twitter: copies match the repaired <title> / description
 *   4. negative: the raw repair output WITHOUT the refresh is not a fixed point
 *      for at least one page (proves the test can see the original failure)
 * Hard-fails on zero exercised repairs.
 */
const fs = require('fs');
const path = require('path');
const R = require('./citation_intelligence/apply_repairs.js');
const { transform, START, END } = require('./apply_site_head.js');
const { ROOT, loadConfig, ownedPages } = require('./lib/site_head.js');

const cfg = loadConfig(ROOT);
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const meta = (h, attr, key) => ((h.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`)) || [])[1] || null);

const FIXED = ['query-atlas/brand-messaging-architecture.html'];
const pool = ownedPages(ROOT, cfg).filter((r) => /^(query-atlas|programmatic|learn)\//.test(r));
const sample = [...new Set([...FIXED, ...pool.filter((_, i) => i % Math.max(1, Math.floor(pool.length / 40)) === 0)])]
  .filter((r) => fs.existsSync(path.join(ROOT, r)));

let exercised = 0;
let rawNotFixedPoint = 0;
for (const rel of sample) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const route = '/' + rel.replace(/\.html$/, '');
  for (const [kind, run] of [
    ['meta_description', (h) => R.repairMetaDescription(h)],
    ['duplicate_title', (h) => R.repairDuplicateTitle(h, route, new Set())],
  ]) {
    const r = run(html);
    if (!r.applied) continue;
    exercised++;
    if (transform(rel, r.html, cfg) !== r.html) rawNotFixedPoint++;
    const out = R.refreshSiteHead(rel, r.html);
    check(transform(rel, out, cfg) === out, `${rel} [${kind}]: repaired page is not a fixed point of apply_site_head.js`);
    const desc = meta(out, 'name', 'description');
    check(!/&amp;(quot|amp|lt|gt|#\d+);/.test(desc || ''), `${rel} [${kind}]: description double-escaped: ${String(desc).slice(0, 80)}`);
    const title = (out.match(/<title>([^<]*)<\/title>/) || [])[1];
    // Where the page carries its own og:title / og:description outside the
    // site-head block, apply_site_head.js derives twitter:* from those instead.
    const outside = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), '');
    if (!/<meta\s+property="og:title"/.test(outside)) {
      check(meta(out, 'name', 'twitter:title') === title, `${rel} [${kind}]: twitter:title does not match repaired <title>`);
    }
    if (kind === 'meta_description' && !/<meta\s+property="og:description"/.test(outside)) check(meta(out, 'name', 'twitter:description') === desc, `${rel} [${kind}]: twitter:description does not match repaired description`);
  }
}
check(exercised > 0, 'zero repairs exercised: the sample reached no repairable page');
check(rawNotFixedPoint > 0, 'negative check: no raw repair output was stale, so this test cannot see the 19-20 Oct failure');

if (failures.length) { console.error(`repairs/site-head contract FAILED (${failures.length}):\n- ` + failures.slice(0, 30).join('\n- ')); process.exit(1); }
console.log(`repairs/site-head contract OK: ${exercised} repair(s) on ${sample.length} page(s) are fixed points of apply_site_head.js; ${rawNotFixedPoint} would have been stale without the refresh.`);
