#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Search Console intelligence files are present, coherent and fresh.
 * Written daily by distribution_scripts/gsc_search_intelligence.py inside
 * .github/workflows/search-repair-retest.yml. A collector that silently stops
 * leaves the publication freeze reading stale numbers, so staleness fails here.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = 'data/search_intelligence';
const MAX_AGE_DAYS = 7;
const errors = [];
const read = (n) => { const f = path.join(ROOT, DIR, n); if (!fs.existsSync(f)) { errors.push(`${DIR}/${n} missing`); return null; } return JSON.parse(fs.readFileSync(f, 'utf8')); };
const age = (iso) => (Date.now() - Date.parse(iso)) / 86400000;

const sa = read('search_analytics_28d.json');
if (sa) {
  if (!Array.isArray(sa.rows) || sa.row_count !== sa.rows.length) errors.push('search_analytics_28d.json row_count does not match rows');
  if (!sa.start_date || !sa.end_date) errors.push('search_analytics_28d.json has no window');
  if (!(age(sa.generated_at) <= MAX_AGE_DAYS)) errors.push(`search_analytics_28d.json is ${Math.floor(age(sa.generated_at))} day(s) old (max ${MAX_AGE_DAYS}); the daily collector has stopped`);
}
const cov = read('index_coverage.json');
if (cov) {
  if (!(cov.sitemap_url_count > 0)) errors.push('index_coverage.json was built over zero sitemap URLs');
  const n = Object.keys(cov.urls || {}).length;
  if (!n) errors.push('index_coverage.json holds zero inspected URLs');
  const sum = Object.values(cov.counts_by_coverage_state || {}).reduce((a, b) => a + b, 0);
  if (sum !== n || cov.inspected_ever !== n) errors.push(`index_coverage.json counts (${sum}) do not add up to inspected URLs (${n})`);
  if (!(age(cov.generated_at) <= MAX_AGE_DAYS)) errors.push(`index_coverage.json is ${Math.floor(age(cov.generated_at))} day(s) old (max ${MAX_AGE_DAYS})`);
}
const sm = read('sitemaps.json');
if (sm && !(sm.sitemaps || []).some((s) => /virtualagency-os\.com\/sitemap\.xml$/.test(s.path || ''))) errors.push('sitemaps.json does not list https://virtualagency-os.com/sitemap.xml');
if (errors.length) { console.error('search intelligence FAILED:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log(`search intelligence OK: ${sa.row_count} query x page row(s) ${sa.start_date}..${sa.end_date}; coverage ${Object.keys(cov.urls).length}/${cov.sitemap_url_count} URL(s) ${JSON.stringify(cov.counts_by_coverage_state)}.`);
