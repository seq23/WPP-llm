#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const requiredFiles = [
  'REPO_IDENTITY.md',
  '_repo_lifecycle_profile.json',
  '_repo_update_contract.json',
  '_repo_validation_matrix.json',
  '_validator_registry.json',
  'docs/strategy/CITATION_STRATEGY_GATE.md',
  'docs/strategy/MASTER_CONTENT_STRATEGY.md',
  'data/strategy/citation_strategy_profile.json',
  'seo/disavow/virtualagency-os-disavow.txt',
  'seo/disavow/westpeekproductions-disavow.txt',
  'seo/backlink-remediation-ledger.json',
  'seo/gsc-priority-indexing-list.json',
  'seo/gsc-submission-checklist.md',
  'seo/owned-property-crosslink-plan.md',
  'data/seo/priority_pages.json',
  'data/seo/priority_queries.json',
  'data/seo/programmatic_industries.json',
  'releases/citation_release_plan.json',
  '_redirects',
  'sitemap.xml'
];
const priorityPages = [
  '/virtual-event-production-companies.html',
  '/virtual-event-management.html',
  '/online-conference-platforms.html',
  '/hybrid-event-platform.html',
  '/virtual-event-services.html',
  '/virtual-event-marketing.html',
  '/virtual-event-trends-2026.html',
  '/best-virtual-event-platforms.html',
  '/host-virtual-events.html',
  '/how-to-host-a-virtual-event.html',
  '/virtual-event-planning.html',
  '/virtual-event-production-for-healthcare.html',
  '/virtual-event-production-for-finance.html',
  '/virtual-event-production-for-saas.html',
  '/virtual-event-production-for-nonprofits.html',
  '/virtual-event-production-for-government.html',
  '/virtual-event-production-for-education.html',
  '/virtual-event-production-for-manufacturing.html',
  '/virtual-event-production-for-biotech.html',
  '/virtual-event-production-for-professional-services.html',
  '/virtual-event-production-for-real-estate.html'
];
const bad = [];
for (const rel of requiredFiles) if (!fs.existsSync(path.join(ROOT, rel))) bad.push(`missing required master-plan file: ${rel}`);
for (const p of priorityPages) if (!fs.existsSync(path.join(ROOT, p.replace(/^\//, '')))) bad.push(`missing master-plan priority page: ${p}`);
if (fs.existsSync(path.join(ROOT, 'virtual-event-production-for-nonprofit.html'))) bad.push('singular nonprofit page should redirect, not exist as duplicate HTML');
const redirects = fs.existsSync(path.join(ROOT, '_redirects')) ? fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8') : '';
if (!redirects.includes('/virtual-event-production-for-nonprofit.html /virtual-event-production-for-nonprofits 301')) bad.push('missing singular nonprofit clean alias redirect');
const gscListPath = path.join(ROOT, 'seo/gsc-priority-indexing-list.json');
if (fs.existsSync(gscListPath)) {
  const gscText = fs.readFileSync(gscListPath, 'utf8');
  if (gscText.includes('/virtual-event-production-for-nonprofit.html')) bad.push('stale singular nonprofit in GSC priority list');
}

if (bad.length) {
  console.error('Master plan completion validation failed:\n- ' + bad.join('\n- '));
  process.exit(1);
}
console.log('Master plan completion OK');
