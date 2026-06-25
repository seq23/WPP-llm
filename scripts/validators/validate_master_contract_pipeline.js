#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const checkId = process.argv[2] || 'all';
function exists(p){ return fs.existsSync(path.join(ROOT,p)); }
function readJson(p,f=null){ try { return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8')); } catch { return f; } }
function fail(msg){ console.error(`${checkId} failed: ${msg}`); process.exit(1); }
function cleanRoute(route){ const r=String(route||'').replace(/^https?:\/\/[^/]+/,'').replace(/\.html$/,'').replace(/\/index$/,'/'); return r.startsWith('/')?r:'/'+r; }
function routeExists(route){ const rel=cleanRoute(route).replace(/^\//,''); return exists((rel||'index') + (rel?'.html':'.html')) || exists(path.join(rel,'index.html')); }
const strategy = readJson('data/strategy/citation_strategy_profile.json', {});
const contentContract = readJson('_content_release_contract.json', {});
const citationContract = readJson('_citation_intelligence_contract.json', {});
const releasePlan = readJson('data/releases/daily_release_plan.json', {units:[]});
const universe = readJson('data/query_atlas/query_universe.json', {queries:[]});
const signals = readJson('data/signals/normalized_records.json', {records:[]});
const opps = readJson('data/opportunities/aeo_geo_opportunities.json', {opportunities:[]});
const admissions = readJson('data/content/page_admission_registry.json', {admissions:[]});
const pageFamilies = readJson('data/page_families/page_family_registry.json', {families:[]});
const atoms = readJson('data/atoms/atom_registry.json', {atoms:[]});

const checks = {
  'citation-goal-sizing': () => {
    const target = strategy.citation_goal?.route_target_6_months || contentContract.cadence?.six_month_route_target || universe.counts?.target_6_month_routes;
    if (Number(target) < 900) fail(`six-month route target too small: ${target}`);
    if ((universe.queries||[]).length < 900) fail(`query universe too small: ${(universe.queries||[]).length}`);
  },
  'free-aeo-mode-contract': () => {
    if (citationContract.zero_paid_provider_default !== true) fail('zero_paid_provider_default must be true');
    const forbidden = citationContract.forbidden_default_dependencies || [];
    if (!forbidden.includes('paid_seo_tools')) fail('paid SEO tools must be forbidden by default');
  },
  'programmatic-release-contract': () => {
    if (!exists('_content_release_contract.json')) fail('missing _content_release_contract.json');
    if ((contentContract.cadence?.max_new_pages_per_day || 0) > 5) fail('controlled max_new_pages_per_day exceeds 5');
    if ((contentContract.cadence?.max_repairs_per_day || 0) > 10) fail('controlled max_repairs_per_day exceeds 10');
  },
  'citation-intelligence-contract': () => {
    if (!exists('_citation_intelligence_contract.json')) fail('missing _citation_intelligence_contract.json');
    const collectors = citationContract.primary_collectors || [];
    for (const c of ['google_search_console','benchmark_query_panel','site_inventory']) if (!collectors.includes(c)) fail(`missing collector ${c}`);
  },
  'agent-run-artifact-intake': () => {
    if (!exists('data/agent_runs/raw_runs')) fs.mkdirSync(path.join(ROOT,'data/agent_runs/raw_runs'), {recursive:true});
    if (!exists('data/agent_runs/normalized_agent_runs.json')) fail('missing normalized agent-run artifact packet; run citation:normalize-artifacts');
  },
  'normalized-agent-run-schema': () => {
    const pkt = readJson('data/agent_runs/normalized_agent_runs.json', null);
    if (!pkt || !Array.isArray(pkt.records) || !pkt.mode) fail('normalized agent-run packet schema invalid');
  },
  'velocity-intake-workflow': () => {
    if (!exists('docs/strategy/CONTENT_GENERATION_CONSOLIDATION_GATE.md')) fail('missing consolidation gate');
    if (!exists('data/content_generation/content_automation_cutover.json')) fail('missing cutover file');
  },
  'release-plan-integrity': () => {
    const units = releasePlan.units || releasePlan.release_units || [];
    if (!units.length) fail('release plan has no units');
    if (units.filter(u=>u.release_action==='create').length > 5) fail('release plan exceeds create cap');
    if (units.filter(u=>u.release_action==='repair').length > 10) fail('release plan exceeds repair cap');
    for (const u of units) if (!u.query || !u.target_route || !u.release_action) fail('release unit missing query/route/action');
  },
  'content-release-trace': () => {
    if (!exists('artifacts/release/apply_release_plan_summary.json')) fail('missing apply release summary');
    if (!exists('artifacts/release/release_plan_distribution_trace.json')) fail('missing release distribution trace');
  },
  'page-release-law': () => {
    if (!Array.isArray(admissions.admissions) || admissions.admissions.length < 5) fail('page admissions are missing or too small');
    const seen = new Set();
    for (const a of admissions.admissions) {
      if (!a.route || !a.query || !a.status) fail('admission missing route/query/status');
      const key = `${a.route}::${a.query}`;
      if (seen.has(key)) fail(`duplicate admission ${key}`);
      seen.add(key);
    }
  },
  'generated-content-gate': () => {
    if (!atoms.atoms || atoms.atoms.length < 3) fail('atom registry too small');
    if (!pageFamilies.families || pageFamilies.families.length < 5) fail('page family registry too small');
  },
  'programmatic-substance': () => {
    const units = releasePlan.units || [];
    for (const u of units.filter(x=>x.release_action==='create')) {
      const rel = cleanRoute(u.target_route).replace(/^\//,'') + '.html';
      if (exists(rel)) {
        const text = fs.readFileSync(path.join(ROOT, rel),'utf8').replace(/<[^>]+>/g,' ');
        if (text.split(/\s+/).filter(Boolean).length < 450) fail(`generated page thin: ${rel}`);
        if (!/West Peek Productions/.test(text)) fail(`generated page lacks WPP entity: ${rel}`);
      }
    }
  },
  'canonical-routing-law': () => {
    const redirects = exists('_redirects') ? fs.readFileSync(path.join(ROOT,'_redirects'),'utf8') : '';
    if (/\s+\/[^\s]+\.html\s+301/.test(redirects)) fail('redirects contain clean-to-html rule risk');
    const sitemap = exists('sitemap.xml') ? fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8') : '';
    if (/<loc>[^<]+\.html<\/loc>/.test(sitemap)) fail('sitemap contains .html canonical URLs');
  },
  'search-quality-basics': () => {
    for (const f of fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')).slice(0,200)) {
      const html = fs.readFileSync(path.join(ROOT,f),'utf8');
      if (!/<title>/.test(html) || !/meta name="description"/.test(html) || !/rel="canonical"/.test(html)) fail(`missing SEO basics: ${f}`);
    }
  },
  'sitemap-parity': () => {
    if (!exists('sitemap.xml')) fail('missing sitemap.xml');
    const sitemap = fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8');
    if (!sitemap.includes('/query-atlas')) fail('sitemap missing query atlas');
    if (!sitemap.includes('/virtual-event-production')) fail('sitemap missing core virtual event production route');
  },
  'content-safety': () => {
    const bad = [];
    for (const f of fs.readdirSync(ROOT).filter(f=>f.endsWith('.html'))) {
      const txt = fs.readFileSync(path.join(ROOT,f),'utf8');
      if (/guaranteed\s+(rankings|citations|AI Overviews)/i.test(txt)) bad.push(f);
      if (/fake rankings|trust us bro/i.test(txt)) bad.push(f);
    }
    if (bad.length) fail('unsafe claims in '+bad.join(', '));
  },
  'strategy-integrity-contract': () => {
    if (!String(strategy.commercial_destination||'').includes('westpeekproductions.com')) fail('commercial destination not locked to WPP');
    if (!JSON.stringify(strategy).includes('virtual event')) fail('strategy does not include virtual event scope');
    if (String(strategy.canonical_policy||'').includes('clean_redirects_to_html')) fail('stale loop-prone canonical policy');
  },
  'deterministic-build': () => {
    if (!exists('package-lock.json')) fail('missing package-lock.json');
    if (!exists('package.json')) fail('missing package.json');
  },
  'repo-hygiene': () => {
    const forbidden = ['.env'];
    for (const f of forbidden) if (exists(f)) fail(`forbidden secret path: ${f}`);
    // node_modules is allowed in local validation after npm ci, but must not be packaged.
    // Packaging checks verify ZIP entries separately.
    const pycache = [];
    function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.name==='__pycache__') pycache.push(path.relative(ROOT,p)); else if (e.isDirectory() && !['.git','node_modules'].includes(e.name)) walk(p); }}
    walk(ROOT); if (pycache.length) fail(`__pycache__ packaged: ${pycache.join(', ')}`);
  }
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
