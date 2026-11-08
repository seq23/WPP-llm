#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Behaviour test for the westpeek.live proof line (owner ruling 2 Nov 2026):
 * West Peek Productions stays the one main CTA; pages whose topic is a virtual /
 * online / hybrid conference, summit or event carry exactly one westpeek.live
 * line, linking to the platform's front page (proof, not a sign-up); every other
 * page carries none.
 *
 *   1. transform() on a real matching page: exactly one westpeek.live link, and
 *      every westpeekproductions.com link is exactly what it was before.
 *   2. transform() on a real non-matching page: zero westpeek.live links.
 *   3. Every published page: matching -> exactly one, non-matching -> zero, and
 *      no westpeek.live link points anywhere but the front page.
 * Hard-fails on zero matching or zero non-matching pages.
 */
const fs = require('fs');
const path = require('path');
const { transform } = require('./apply_site_head.js');
const { ROOT, loadConfig, walk } = require('./lib/site_head.js');

const cfg = loadConfig(ROOT);
const proof = cfg.platform_proof_files;
const failures = [];
const LIVE = /href="(https?:\/\/(?:www\.)?westpeek\.live[^"]*)"/g;
const WPP = /href="(https?:\/\/(?:www\.)?westpeekproductions\.com[^"]*)"/g;
const hrefs = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const pages = walk(ROOT, ROOT, []).filter((r) => !r.startsWith('admin/'));
const matching = pages.filter((r) => proof.has(r));
const other = pages.filter((r) => !proof.has(r) && /<\/(?:article|main)>/.test(read(r)));
if (!matching.length || !other.length) {
  console.error(`platform-proof: ${matching.length} matching and ${other.length} non-matching pages; the topic sources or the page walk are broken.`);
  process.exit(1);
}

// 1 + 2: the build step itself, on a real page of each kind with the line stripped first.
const strip = (h) => h.replace(/<!--platform-proof:start-->[\s\S]*?<!--platform-proof:end-->/g, '');
for (const [rel, want] of [[matching[0], 1], [other.find((r) => /westpeekproductions\.com/.test(read(r))), 0]]) {
  const before = strip(read(rel));
  const after = transform(rel, before, cfg);
  const n = hrefs(after, LIVE).length;
  if (n !== want) failures.push(`${rel}: transform gave ${n} westpeek.live link(s), want ${want}`);
  if (JSON.stringify(hrefs(after, WPP)) !== JSON.stringify(hrefs(before, WPP))) failures.push(`${rel}: transform changed the West Peek Productions CTA links`);
  if (!hrefs(after, WPP).length) failures.push(`${rel}: no West Peek Productions CTA left`);
}

// 3: what is published.
const { DEMO_VENUE, DEMO_VENUE_PAGES } = require('./lib/platform_proof.js');
for (const rel of DEMO_VENUE_PAGES) if (!pages.includes(rel)) failures.push(`${rel}: listed as a demo-venue page but not published`);
for (const rel of pages) {
  const live = hrefs(read(rel), LIVE);
  if (DEMO_VENUE_PAGES.has(rel)) {
    // A demo-venue page links the demo venue, and nothing else on westpeek.live.
    if (!live.length) failures.push(`${rel}: demo-venue page has no westpeek.live demo link`);
    for (const h of live) if (h !== DEMO_VENUE) failures.push(`${rel}: westpeek.live link is not the demo venue: ${h}`);
    continue;
  }
  const want = proof.has(rel) ? 1 : 0;
  if (live.length !== want) failures.push(`${rel}: ${live.length} westpeek.live link(s) published, want ${want}`);
  for (const h of live) if (!/^https:\/\/westpeek\.live\/(?:\?|$)/.test(h)) failures.push(`${rel}: westpeek.live link goes past the front page: ${h}`);
}

if (failures.length) {
  console.error(`platform-proof: ${failures.length} failure(s)\n  ${failures.slice(0, 15).join('\n  ')}`);
  process.exit(1);
}
console.log(`platform-proof: OK - ${matching.length} matching page(s) carry exactly one westpeek.live line, ${pages.length - matching.length} other page(s) carry none, WPP CTA unchanged.`);
