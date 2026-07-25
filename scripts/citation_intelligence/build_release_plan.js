#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const DOMAIN = 'https://virtualagency-os.com';
function readJson(p, f) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return f; } }
function cleanRoute(route) {
  const r = String(route || '/').replace(/^https?:\/\/[^/]+/,'').replace(/\.html$/,'').replace(/\/index$/,'/');
  return r.startsWith('/') ? r : '/' + r;
}
const TOP_LEVEL_ROUTES = new Set([
  '/',
  '/articles',
  '/atlas',
  '/query-atlas',
  '/selected-work',
  '/started-business',
  '/how-west-peek-helps',
  '/community-as-a-service',
  '/ai-helps-breaks',
  '/ai-human-os',
  '/glossary'
]);
function governedRoute(route) {
  const r = cleanRoute(route);
  if (TOP_LEVEL_ROUTES.has(r) || r.startsWith('/answers/') || r.startsWith('/insights/') || r.startsWith('/query-atlas/') || r.startsWith('/pillars/') || r.startsWith('/case-studies/') || r.startsWith('/programmatic/')) return r;
  return '/programmatic' + r;
}
function fileFor(route) {
  const rel = governedRoute(route).replace(/^\//, '');
  if (!rel || rel === '/') return path.join(ROOT, 'index.html');
  return path.join(ROOT, rel + '.html');
}
function existsRoute(route) { return fs.existsSync(fileFor(route)) || fs.existsSync(path.join(ROOT, cleanRoute(route).replace(/^\//,''), 'index.html')); }
function urlFor(route) { const r = cleanRoute(route); return DOMAIN + (r === '/' ? '/' : r); }
function unique(arr) { return [...new Set(arr.filter(Boolean))]; }

fs.mkdirSync(path.join(ROOT, 'data/releases'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'releases'), { recursive: true });
fs.mkdirSync(path.join(ROOT, '.build'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'artifacts/release'), { recursive: true });

const contract = readJson('_content_release_contract.json', { cadence: { max_new_pages_per_day: 50, max_repairs_per_day: 100 } });
const opps = readJson('data/opportunities/aeo_geo_opportunities.json', { opportunities: [] }).opportunities || [];
const priority = readJson('data/seo/priority_pages.json', { pages: [] }).pages || [];
const velocityDecision = readJson('data/authority_scale/velocity_decision.json', {});
const dailyNewCeiling = Number(process.env.MAX_NEW_PAGES_PER_DAY || velocityDecision.recommended_new_url_ceiling_per_day || contract.cadence?.max_new_pages_per_day || 50);
const dailyRepairCeiling = Number(process.env.MAX_REPAIRS_PER_DAY || contract.cadence?.max_repairs_per_day || 100);
if (dailyNewCeiling < 0 || dailyNewCeiling > 200 || dailyRepairCeiling < 0 || dailyRepairCeiling > 250) { console.error('Full-flow caps out of governed range.'); process.exit(1); }
const today = new Date().toISOString().slice(0,10);
const velocityLedger = readJson('data/releases/daily_velocity_ledger.json', { date: today, new_pages_used: 0, repairs_used: 0 });
const sameDay = velocityLedger.date === today;
const usedNew = sameDay ? Number(velocityLedger.new_pages_used || 0) : 0;
const usedRepairs = sameDay ? Number(velocityLedger.repairs_used || 0) : 0;
const maxNew = Math.max(0, dailyNewCeiling - usedNew);
const maxRepairs = Math.max(0, dailyRepairCeiling - usedRepairs);

const normalized = opps
  .filter(o => o && o.query && o.target_route)
  .map(o => ({ ...o, target_route: governedRoute(o.target_route), source_route: cleanRoute(o.target_route), exists_now: existsRoute(o.target_route) }))
  .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.demand_estimate || 0) - (a.demand_estimate || 0) || a.target_route.localeCompare(b.target_route));

const isCommunity = o => String(o.pillar||'').toLowerCase()==='community' || /community/.test(String(o.cluster||'').toLowerCase()) || /community/.test(String(o.query||'').toLowerCase());
const newCandidates = normalized.filter(o => !o.exists_now);
const parity = readJson('data/authority_scale/community_authority_parity.json', { parity_reached:false });
let selectedCreate = [];
if (!parity.parity_reached && maxNew > 0) {
  const reserve = Math.min(maxNew, Math.ceil(maxNew * 0.35));
  const community = newCandidates.filter(isCommunity).slice(0, reserve);
  const used = new Set(community.map(o => o.opportunity_id || `${o.query}|${o.target_route}`));
  const rest = newCandidates.filter(o => !used.has(o.opportunity_id || `${o.query}|${o.target_route}`)).slice(0, maxNew-community.length);
  selectedCreate = [...community, ...rest];
} else selectedCreate = newCandidates.slice(0, maxNew);
const create = selectedCreate.map((o, i) => ({ ...o, release_action: 'create', release_order: i + 1, action: 'create' }));
const repairs = normalized.filter(o => o.exists_now).slice(0, maxRepairs).map((o, i) => ({ ...o, release_action: 'repair', release_order: i + 1, action: 'repair_or_expand' }));
const units = [...create, ...repairs];

const plan = {
  generated_at: new Date().toISOString(),
  mode: 'full_flow_aggressive_90_day',
  daily_new_page_ceiling: dailyNewCeiling,
  daily_repair_ceiling: dailyRepairCeiling,
  daily_new_pages_already_used: usedNew,
  daily_repairs_already_used: usedRepairs,
  max_new_pages_this_run: maxNew,
  max_repairs_this_run: maxRepairs,
  max_new_pages_per_day: dailyNewCeiling,
  max_repairs_per_day: dailyRepairCeiling,
  max_route_mutations_per_day: dailyNewCeiling + dailyRepairCeiling,
  units,
  release_units: units,
  blocked: normalized.filter(o => !o.query || !o.target_route).map(o => ({ reason: 'missing_query_or_route', target_route: o.target_route || null }))
};

fs.writeFileSync(path.join(ROOT, 'data/releases/daily_release_plan.json'), JSON.stringify(plan, null, 2));
fs.writeFileSync(path.join(ROOT, 'releases/citation_release_plan.json'), JSON.stringify(plan, null, 2));
fs.writeFileSync(path.join(ROOT, '.build/citation_release_trace.json'), JSON.stringify(plan, null, 2));

const priorityUrls = unique([
  ...units.map(u => urlFor(u.target_route)),
  ...priority.slice(0, 25).map(p => urlFor(p.path || p.route || p.url || '')),
  urlFor('/query-atlas'),
  urlFor('/atlas')
]);
let sitemapUrls = [];
try {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
} catch {}
const batchUrls = unique([...priorityUrls, ...sitemapUrls]).filter(u => u.startsWith(DOMAIN));
if (!priorityUrls.length || !batchUrls.length) {
  console.error('Release plan produced no URLs for distribution.');
  process.exit(1);
}
fs.writeFileSync(path.join(ROOT, '.build/indexnow-priority.txt'), priorityUrls.join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, '.build/indexnow-batch.txt'), batchUrls.join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'artifacts/release/release_plan_distribution_trace.json'), JSON.stringify({
  generated_at: plan.generated_at,
  units: units.length,
  creates: create.length,
  repairs: repairs.length,
  priority_url_count: priorityUrls.length,
  batch_url_count: batchUrls.length,
  files: ['.build/indexnow-priority.txt', '.build/indexnow-batch.txt', '.build/citation_release_trace.json']
}, null, 2));
console.log(`Built full-flow release plan: ${create.length} creates, ${repairs.length} repairs; distribution URLs priority=${priorityUrls.length}, batch=${batchUrls.length}.`);
