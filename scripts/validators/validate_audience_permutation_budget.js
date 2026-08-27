#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Stops the audience-permutation fan-out from growing back.
 *
 * The class - programmatic routes formed by appending "for <audience>" to a
 * topic head - reached 777 routes earning 0.548 impressions each, against 3.169
 * for every other programmatic route. The 714 members with no measured demand
 * and no Search Console impressions are now noindex. Nothing here deletes them,
 * and nothing here can delete anything: the only outcome of this validator is a
 * passing or failing build.
 *
 * The failure it exists to prevent is not the 714 pages. It is the generator
 * producing another 714 next quarter and nobody noticing until the corpus is
 * measured again a year later. Two rules:
 *
 *   Rule A - class containment. Every route in the class that is INDEXABLE must
 *     carry measured demand or GSC impressions. A newly generated member with no
 *     evidence must ship noindex or this fails. This is what makes the fan-out
 *     self-limiting: it may still generate pages, but ungated ones cannot enter
 *     the index.
 *
 *   Rule B - new-audience tripwire. Rule A is scoped to the ten audience
 *     suffixes that actually materialized. A generator that starts fanning out
 *     on an eleventh would slip past it, so any "for <x>" suffix outside the
 *     vocabulary that crosses the threshold of indexable, evidence-free routes
 *     fails too, with the instruction to gate it under Rule A. The largest
 *     ungoverned suffix today is "companies" at 49; the threshold is 60.
 *
 * Rule A is also a consistency check on the shipped HTML, not just on the data:
 * it reads the robots meta actually on disk. A page whose meta says index but
 * whose evidence says otherwise fails here even if every JSON file agrees.
 */
const fs = require('fs');
const path = require('path');
const policy = require('../lib/noindex_policy.js');

const ROOT = path.resolve(__dirname, '..', '..');
const ROBOTS_RE = /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i;

const errors = [];
const notes = [];

const robotsOnDisk = (route) => {
  const file = path.join(ROOT, `${route.replace(/^\//, '')}.html`);
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(ROBOTS_RE);
  return m ? m[1] : null;
};
const isIndexable = (robots) => robots !== null && !/noindex/i.test(robots);

// The protected set is asserted before anything else is reported, so a signal
// regression surfaces here as a hard failure rather than as a quiet reindex.
try {
  policy.assertNoProtectedRouteIsNoindexed();
} catch (err) {
  errors.push(err.message);
}

const routes = policy.programmaticRoutes();
const { klass } = policy.classify(routes);

// --- Rule A: class containment ----------------------------------------------
const ungatedInClass = [];
const missingMeta = [];
for (const route of klass) {
  const robots = robotsOnDisk(route);
  if (robots === null) { missingMeta.push(route); continue; }
  if (isIndexable(robots) && !policy.isProtected(route)) {
    ungatedInClass.push(route);
  }
}
if (missingMeta.length) {
  errors.push(
    `${missingMeta.length} audience-permutation page(s) have no robots meta to judge, e.g. ` +
    missingMeta.slice(0, 5).join(', ')
  );
}
if (ungatedInClass.length) {
  errors.push(
    `Rule A: ${ungatedInClass.length} audience-permutation route(s) are indexable with neither measured demand nor ` +
    `Search Console impressions. Ship them noindex (node scripts/apply_noindex_policy.js) or supply demand evidence:\n  ` +
    ungatedInClass.slice(0, 20).join('\n  ') +
    (ungatedInClass.length > 20 ? `\n  ... and ${ungatedInClass.length - 20} more` : '')
  );
}

// --- Rule B: new-audience tripwire ------------------------------------------
const governed = new Set(policy.AUDIENCE_SLUGS);
const ungovernedCounts = new Map();
for (const route of routes) {
  const suffix = policy.audienceSuffix(route);
  if (!suffix || governed.has(suffix)) continue;
  if (policy.isProtected(route)) continue;
  if (!isIndexable(robotsOnDisk(route))) continue;
  ungovernedCounts.set(suffix, (ungovernedCounts.get(suffix) || 0) + 1);
}
const overThreshold = [...ungovernedCounts.entries()]
  .filter(([, n]) => n > policy.NEW_AUDIENCE_THRESHOLD)
  .sort((a, b) => b[1] - a[1]);
if (overThreshold.length) {
  errors.push(
    `Rule B: ${overThreshold.length} audience suffix(es) outside the governed vocabulary exceed ` +
    `${policy.NEW_AUDIENCE_THRESHOLD} indexable routes with no demand and no impressions - a new fan-out is ` +
    `growing ungated. Add the suffix to audience_slugs in data/demand/audience_permutation_policy.json so Rule A ` +
    `gates it; do not raise the threshold:\n  ` +
    overThreshold.map(([s, n]) => `for-${s}: ${n} routes`).join('\n  ')
  );
}

const largestUngoverned = [...ungovernedCounts.entries()].sort((a, b) => b[1] - a[1])[0];
const classNoindex = klass.filter((r) => !isIndexable(robotsOnDisk(r))).length;
notes.push(
  `audience-permutation class: ${klass.length} routes - ${classNoindex} noindex, ` +
  `${klass.length - classNoindex} indexed on measured demand or impressions.`
);
notes.push(
  `largest ungoverned "for <x>" suffix: ${largestUngoverned ? `for-${largestUngoverned[0]} at ${largestUngoverned[1]} routes` : 'none'} ` +
  `(threshold ${policy.NEW_AUDIENCE_THRESHOLD}).`
);

for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  console.error('validate:audience-permutation-budget FAILED');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `validate:audience-permutation-budget OK (${routes.length} programmatic routes, ${klass.length} in class, ` +
  `0 ungated indexable, 0 ungoverned suffixes over threshold)`
);
