#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const { extractVisibleText, shingleSetFromHtml, jaccard } = require('../citation_intelligence/content_quality.js');

const primary = '<main><h1>Distinct operating plan</h1><p>Alpha beta gamma delta epsilon zeta eta theta iota kappa.</p></main>';
const fanout = '<section class="fanout-block" data-fanout="true"><h2>Common ways this gets searched</h2><p>Shared repeated discovery copy that must never affect semantic admission.</p></section>';
assert.strictEqual(extractVisibleText(primary), extractVisibleText(primary.replace('</main>', `${fanout}</main>`)), 'fanout changed primary visible text');
assert.strictEqual(jaccard(shingleSetFromHtml(primary), shingleSetFromHtml(primary.replace('</main>', `${fanout}</main>`))), 1, 'fanout changed semantic shingles');

console.log('Fanout-blind content quality: PASS');
