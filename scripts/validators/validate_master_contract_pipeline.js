#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const checkId = process.argv[2] || 'all';
function exists(p){ return fs.existsSync(path.join(ROOT,p)); }
function readJson(p,f=null){ try { return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8')); } catch { return f; } }
function fail(msg){ console.error(`${checkId} failed: ${msg}`); process.exit(1); }
function cleanRoute(route){ const r=String(route||'').replace(/^https?:\/\/[^/]+/,'').replace(/\.html$/,'').replace(/\/index$/,'/'); return r.startsWith('/')?r:'/'+r; }
function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git','.pages-output', 'node_modules','.build','logs','artifacts','admin','data'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}
function fileForRoute(route){
  const rel=cleanRoute(route).replace(/^\//,'');
  const candidates = [
    (rel||'index') + (rel?'.html':'.html'),
    path.join(rel,'index.html'),
    path.join('programmatic', `${rel}.html`)
  ];
  return candidates.find(exists);
}
function routeExists(route){ return Boolean(fileForRoute(route)); }
const strategy = readJson('data/strategy/citation_strategy_profile.json', {});
const contentContract = readJson('_content_release_contract.json', {});
const citationContract = readJson('_citation_intelligence_contract.json', {});
const releasePlan = readJson('data/releases/daily_release_plan.json', {units:[]});
const applySummary = readJson('artifacts/release/apply_release_plan_summary.json', null);
const releasePlanApplied = Boolean(applySummary && releasePlan.generated_at && applySummary.plan_generated_at === releasePlan.generated_at && Number(applySummary.total || 0) === (releasePlan.units || []).length);
const universe = readJson('data/query_atlas/query_universe.json', {queries:[]});
const signals = readJson('data/signals/normalized_records.json', {records:[]});
const opps = readJson('data/opportunities/aeo_geo_opportunities.json', {opportunities:[]});
const admissions = readJson('data/content/page_admission_registry.json', {admissions:[]});
const pageFamilies = readJson('data/page_families/page_family_registry.json', {families:[]});
const atoms = readJson('data/atoms/atom_registry.json', {atoms:[]});

const checks = {
  'free-aeo-mode-contract': () => {
    if (citationContract.zero_paid_provider_default !== true) fail('zero_paid_provider_default must be true');
    const forbidden = citationContract.forbidden_default_dependencies || [];
    if (!forbidden.includes('paid_seo_tools')) fail('paid SEO tools must be forbidden by default');
  },
  'content-safety': () => {
    const bad = [];
    for (const f of walkHtml(ROOT)) {
      const txt = fs.readFileSync(path.join(ROOT,f),'utf8');
      if (/guaranteed\s+(rankings|citations|AI Overviews)/i.test(txt)) bad.push(f);
      if (/fake rankings|trust us bro/i.test(txt)) bad.push(f);
    }
    if (bad.length) fail('unsafe claims in '+bad.join(', '));
  },
};

if (checkId === 'all') {
  for (const id of Object.keys(checks)) checks[id]();
  console.log(`Master contract pipeline OK (${Object.keys(checks).length} checks)`);
} else if (checks[checkId]) {
  checks[checkId]();
  console.log(`${checkId} OK`);
} else {
  fail(`unknown check id`);
}
