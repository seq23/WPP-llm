#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Contract test: the robots decision the renderer writes into a NEW page is the
 * decision scripts/lib/noindex_policy.js reaches once that page's admission is
 * on record - i.e. the decision validate_demand_backed_pages.js will enforce.
 *
 * The failure this pins (3 Oct 2026, run 37110940345): the policy snapshots
 * data/content/page_admission_registry.json at load and keys demand by the
 * admitted query. apply_release_plan.js renders a unit before it records the
 * admission, so a demand-backed route in the audience-permutation class had no
 * registry entry at render time, resolved to "no demand", and shipped
 * noindex,follow. The validator, reading the registry the applier had by then
 * written, refused it as hidden with nothing sanctioning it, and the release
 * went red. Fix: the renderer passes the unit's query to the policy.
 *
 * This drives the real renderer and the real policy against a synthetic route
 * that is in the class, is not on disk, and has no admission - exactly the
 * state of a page at the moment it is created.
 *
 *   1. demand-backed query  -> indexable (the regression; fails without the fix)
 *   2. query with no demand -> noindex,follow (the class rule still holds)
 *   3. a route outside the class with no demand -> indexable (no over-reach)
 *   4. the registry-only lookup for the unadmitted route is "no demand" - the
 *      precondition that makes (1) a real test and not a tautology
 *   5. apply_release_plan.js holds a disagreeing page with a named reason
 *      rather than writing it (source-level pin on the hold)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const policy = require('./lib/noindex_policy.js');
const demandGate = require('./lib/demand_gate.js');
const { renderProgrammaticPage } = require('./citation_intelligence/render_programmatic_page.js');

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const ROBOTS_RE = /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i;
const robotsOf = (html) => (html.match(ROBOTS_RE) || [])[1] || '';

const audience = policy.AUDIENCE_SLUGS[0];
check(!!audience, 'audience vocabulary is empty; the class cannot be exercised');
const backed = demandGate.allRecords().find((r) => demandGate.hasDemand(r.query));
check(!!backed, 'no demand-backed query on record; the regression cannot be exercised');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content/page_admission_registry.json'), 'utf8'));
const admitted = new Set((registry.admissions || []).map((a) => String(a.route).replace(/\/+$/, '')));

let n = 0; let route; let slug;
do { slug = `parity-test-${++n}-for-${audience}`; route = `/programmatic/${slug}`; }
while (admitted.has(route) || fs.existsSync(path.join(ROOT, `${route.slice(1)}.html`)));

if (!failures.length) {
  const unit = (query) => ({
    query, target_route: route, source_route: `/${slug}`, cluster: 'parity-test',
    pillar: 'brand', page_family: 'programmatic', release_action: 'create',
  });
  check(policy.isAudiencePermutation(route), `${route} should be in the audience-permutation class`);
  check(policy.impressionsFor(route) === 0, `${route} unexpectedly carries impressions; pick another slug`);

  // 4. precondition: the registry alone knows nothing about this route.
  check(policy.hasMeasuredDemand(route) === false,
    'registry-only lookup for an unadmitted route returned demand; the test cannot distinguish the fix');

  // 1. the regression.
  const r1 = robotsOf(renderProgrammaticPage(unit(backed.query)));
  check(!/noindex/i.test(r1),
    `demand-backed audience-permutation page rendered "${r1}" before its admission was recorded; ` +
    'validate:demand-backed-pages will refuse it as hidden with nothing sanctioning it');
  check(policy.isNoindex(route, backed.query) === false, 'policy with the admitting query must say indexable');

  // 2. the class rule still holds for a query with no demand.
  const noDemand = 'parity test query with no demand record 7f3a';
  check(!demandGate.hasDemand(noDemand), 'fixture query unexpectedly has demand');
  const r2 = robotsOf(renderProgrammaticPage(unit(noDemand)));
  check(/^noindex,follow$/i.test(r2), `class route with no evidence rendered "${r2}", expected noindex,follow`);

  // 3. no over-reach outside the class.
  const outside = `/programmatic/parity-test-${n}-outside-class`;
  const r3 = robotsOf(renderProgrammaticPage({ ...unit(noDemand), target_route: outside, source_route: outside.replace('/programmatic', '') }));
  check(!/noindex/i.test(r3), `route outside the class rendered "${r3}", expected indexable`);
}

// 5. the applier holds a disagreeing page by name instead of writing it.
const applier = fs.readFileSync(path.join(ROOT, 'scripts/citation_intelligence/apply_release_plan.js'), 'utf8');
check(/robots_policy_disagreement/.test(applier) && /isNoindex\(route, query\)/.test(applier),
  'apply_release_plan.js no longer holds a page whose robots meta disagrees with the policy for its query');
const idx = (s) => applier.indexOf(s);
check(idx('robotsPolicyDisagreement(html, publicRoute, u.query)') > 0 &&
      idx('robotsPolicyDisagreement(html, publicRoute, u.query)') < idx('fs.writeFileSync(file, html)'),
  'the robots parity hold in apply_release_plan.js must run before the page is written');

if (failures.length) {
  console.error('test:render-robots-parity FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`test:render-robots-parity OK (route ${route}, demand query "${backed.query}")`);
