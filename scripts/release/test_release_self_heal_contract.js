#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ROOT, extractVisibleText, shingleSetFromHtml, jaccard } = require('../citation_intelligence/content_quality.js');

const primary = '<main><h1>Distinct operating plan</h1><p>Alpha beta gamma delta epsilon zeta eta theta iota kappa.</p></main>';
const fanout = '<section class="fanout-block" data-fanout="true"><h2>Common ways this gets searched</h2><p>Shared repeated discovery copy that must never affect semantic admission.</p></section>';
assert.strictEqual(extractVisibleText(primary), extractVisibleText(primary.replace('</main>', `${fanout}</main>`)), 'fanout changed primary visible text');
assert.strictEqual(jaccard(shingleSetFromHtml(primary), shingleSetFromHtml(primary.replace('</main>', `${fanout}</main>`))), 1, 'fanout changed semantic shingles');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const autonomous = pkg.scripts['release:autonomous'] || '';
assert(autonomous.includes('release:quality:self-heal'), 'autonomous release bypasses quality self-heal');
assert(autonomous.indexOf('release:quality:self-heal') < autonomous.indexOf('validate:autonomous'), 'self-heal runs after final validation');
assert((pkg.scripts['release:push-gate'] || '').includes('release:self-heal'), 'push gate omits exact release validation');
const planValidator = fs.readFileSync(path.join(ROOT, 'scripts/validate_release_plan.js'), 'utf8');
for (const reason of ['quality_preflight_rejected', 'quality_repair_missing_opportunity_metadata', 'postbuild_quality_quarantine']) {
  assert(planValidator.includes(`'${reason}'`), `release plan validator rejects safe receipt ${reason}`);
}

const writers = ['admin-command.yml', 'programmatic-release.yml', 'query-intelligence.yml', 'search-repair-retest.yml'];
for (const name of writers) {
  const body = fs.readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8');
  assert(body.includes('commit_and_push_if_changed.sh'), `${name} bypasses governed push helper`);
  assert(!/(^|[;&|\s])git\s+push(?:\s|$)/m.test(body), `${name} contains raw git push`);
}
const pushHelper = fs.readFileSync(path.join(ROOT, '.github/scripts/commit_and_push_if_changed.sh'), 'utf8');
assert(pushHelper.includes('validate_exact_commit'), 'push helper omits exact candidate validation');
assert(pushHelper.includes('PRE_PUSH_INSTALL_ARGV'), 'push helper install stage is not testable');
assert(pushHelper.includes('Transient push failure'), 'push helper omits transient retry handling');
assert(pushHelper.includes('git rebase "origin/$target_branch"'), 'push helper omits remote-advance reconciliation');
console.log('Release self-heal contract tests: PASS');
