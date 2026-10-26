#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * GUARD: the demand family list and the demand pages are one list.
 *
 * 26 Oct 2026: the only measured query of "virtual-event-management" aged out
 * of the 90-day Search Console window; build_demand_families.js wrote a family
 * file without that family, and validate_demand_pages.js redded the daily
 * Search Repair run because demand_pages.json still pinned a page to it.
 *
 * This test fails if:
 *   1. a family declared in demand_family_rules.json can vanish from the
 *      built file because no query matched it this window;
 *   2. such an unmeasured family can enter the top 12;
 *   3. build() accepts a demand page pinned to an undeclared family;
 *   4. with the REAL repo data, dropping every measured query of every
 *      demand-page family (the worst-case window rollover) loses any of them.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { build, buildFamilies, undeclaredDemandPageFamilies, TOP_N } = require('./build_demand_families.js');

const ROOT = path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// 1 + 2: synthetic rules, one family with no query this window.
const rules = { families: [
  { id: 'measured-fam', label: 'Measured', intent: 'service', primary_route: '/', pattern: 'measured' },
  { id: 'aged-out-fam', label: 'Aged out', intent: 'service', primary_route: '/', pattern: 'nothing matches this' },
] };
const targets = [{ query: 'a measured query', impressions: 5, clicks: 0, best_position: 3, pages: ['/'] }];
const fams = buildFamilies({ targets, rules, root: ROOT });
const aged = fams.find((f) => f.family === 'aged-out-fam');
ok(aged, 'a declared family with no measured query this window vanished from the built family list');
ok(aged.no_measured_queries === true && aged.impressions === 0 && aged.queries.length === 0, 'unmeasured family is not marked no_measured_queries with zero impressions');
ok(aged.primary_route === '/', 'unmeasured family lost its declared primary route');
ok(aged.top12 === false, 'an unmeasured family entered the top 12');
ok(fams.find((f) => f.family === 'measured-fam').top12 === true, 'the measured family is not top 12');

// 3: a demand page pinned to an undeclared family is refused.
ok(undeclaredDemandPageFamilies(rules, { pages: [{ file: 'x.html', family: 'not-declared' }] }).length === 1, 'an undeclared demand-page family was accepted');
ok(undeclaredDemandPageFamilies(rules, { pages: [{ file: 'x.html', family: 'aged-out-fam' }] }).length === 0, 'a declared demand-page family was refused');

// 4: real data, worst-case rollover.
const realRules = readJson('data/seo/demand_family_rules.json');
const dp = readJson('data/seo/demand_pages.json');
const pinned = [...new Set((dp.pages || []).map((p) => p.family))];
ok(pinned.length >= 12, `only ${pinned.length} demand-page families; Rule 0 needs the real list`);
ok(undeclaredDemandPageFamilies(realRules, dp).length === 0, `demand_pages.json pins undeclared families: ${undeclaredDemandPageFamilies(realRules, dp).join(', ')}`);
const real = build(ROOT);
for (const id of pinned) ok(real.families.some((f) => f.family === id), `demand-page family "${id}" missing from a fresh build`);
const compiled = realRules.families.filter((r) => pinned.includes(r.id)).map((r) => new RegExp(r.pattern, 'i'));
const mt = readJson('data/seo/measured_targets.json');
const thinned = (mt.targets || []).filter((t) => !compiled.some((re) => re.test(t.query)));
ok(thinned.length < (mt.targets || []).length, 'the rollover simulation removed nothing; it proves nothing');
const rolled = buildFamilies({ targets: thinned, rules: realRules, root: ROOT });
for (const id of pinned) ok(rolled.some((f) => f.family === id && f.no_measured_queries), `demand-page family "${id}" vanished when its queries aged out`);
ok(rolled.filter((f) => f.top12).every((f) => f.impressions > 0) && rolled.filter((f) => f.top12).length <= TOP_N, 'top 12 holds an unmeasured family');

console.log(`demand families keep declared OK: ${checks} checks; ${pinned.length} demand-page families survive a full window rollover.`);
