#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const {
  ROOT, readJson, cleanRoute, governedRoute, analyzeCorpus, listProgrammaticPages,
  candidateQuality, shingleSetFromHtml, wordCountFromHtml,
} = require('./content_quality.js');
const { renderProgrammaticPage } = require('./render_programmatic_page.js');
const demandGate = require('../lib/demand_gate.js');

const DOMAIN = 'https://virtualagency-os.com';
function fileFor(route) {
  const rel = governedRoute(route).replace(/^\//, '');
  if (!rel || rel === '/') return path.join(ROOT, 'index.html');
  return path.join(ROOT, rel + '.html');
}
function existsRoute(route) {
  const f = fileFor(route);
  return fs.existsSync(f) || fs.existsSync(path.join(ROOT, cleanRoute(route).replace(/^\//,''), 'index.html'));
}
function urlFor(route) { const r = cleanRoute(route); return DOMAIN + (r === '/' ? '/' : r); }
function unique(arr) { return [...new Set(arr.filter(Boolean))]; }
function keyFor(o) { return o.opportunity_id || `${o.query}|${o.target_route}`; }

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
if (dailyNewCeiling < 0 || dailyNewCeiling > 200 || dailyRepairCeiling < 0 || dailyRepairCeiling > 250) {
  console.error('Full-flow caps out of governed range.'); process.exit(1);
}
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
  // Ordered by measured volume first. The previous tiebreak was `demand_estimate`,
  // a fabricated priority*3; ordering by it meant a made-up number chose which
  // page got built each day. A candidate with no measurement sorts last and is
  // refused below anyway, so its position is only about report readability.
  .sort((a,b) => (demandGate.measuredVolume(b.query)||0)-(demandGate.measuredVolume(a.query)||0) || (b.score||0)-(a.score||0) || a.target_route.localeCompare(b.target_route));
const byRoute = new Map();
for (const o of normalized) if (!byRoute.has(o.target_route)) byRoute.set(o.target_route, o);

const parity = readJson('data/authority_scale/community_authority_parity.json', { parity_reached:false });
const isCommunity = o => String(o.pillar||'').toLowerCase()==='community' || /community/.test(String(o.cluster||'').toLowerCase()) || /community/.test(String(o.query||'').toLowerCase());
const initialCorpus = listProgrammaticPages();
let stagedCorpus = initialCorpus.map(p => ({ ...p }));
const blocked = [];
function stageCandidate(o, action, qualityReason = null) {
  const html = renderProgrammaticPage(o);
  const quality = candidateQuality(html, o, stagedCorpus);
  if (!quality.ok) {
    blocked.push({ target_route:o.target_route, query:o.query, release_action:action, reason:'quality_preflight_rejected', details:quality.reasons, word_count:quality.word_count, max_similarity:quality.max_similarity, nearest_route:quality.nearest_route });
    return null;
  }
  const unit = { ...o, release_action:action, action:action === 'create' ? 'create' : 'quality_repair', quality_reason:qualityReason, quality_preflight:quality };
  stagedCorpus = stagedCorpus.filter(p => p.route !== o.target_route);
  if (o.target_route.startsWith('/programmatic/')) stagedCorpus.push({ route:o.target_route, cluster:o.cluster || o.target_route, html, word_count:wordCountFromHtml(html), shingles:shingleSetFromHtml(html) });
  return unit;
}

const newCandidates = normalized.filter(o => !o.exists_now);
let orderedCreates = newCandidates;
if (!parity.parity_reached && maxNew > 0) {
  const reserve = Math.min(maxNew, Math.ceil(maxNew * 0.35));
  const community = newCandidates.filter(isCommunity);
  const rest = newCandidates.filter(o => !isCommunity(o));
  orderedCreates = [...community.slice(0,reserve), ...rest, ...community.slice(reserve)];
}
const create = [];
const seenCreate = new Set();
for (const o of orderedCreates) {
  if (create.length >= maxNew) break;
  const key = keyFor(o); if (seenCreate.has(key)) continue; seenCreate.add(key);
  // The demand gate, ahead of the quality gate on purpose. The quality gate
  // asks "is this page well made?"; it has no opinion on whether the query is
  // real, so a fluent 1,500-word answer to a string nobody has ever searched
  // passed it every time. 3,052 programmatic pages exist and the site holds no
  // top-3 position on any mapped head term. Refuse first, then judge quality.
  const record = demandGate.demandRecord(o.query);
  if (!record) {
    blocked.push({ target_route: o.target_route, query: o.query, release_action: 'create', reason: 'no_demand_record', details: ['no row in data/authority_scale/query_atlas.json or data/demand/measured_demand.json'] });
    continue;
  }
  const unit = stageCandidate(o, 'create');
  if (unit) {
    unit.release_order = create.length + 1;
    unit.demand_evidence = { source_type: record.source_type, evidence_tier: record.evidence_tier || null, measured_volume: Number.isFinite(Number(record.volume)) ? Number(record.volume) : null, source_file: record.demand_source_file };
    create.push(unit);
  }
}

const quality = analyzeCorpus();
const issueRows = quality.pages
  .filter(p => p.flags.some(f => ['thin','exact_duplicate','near_duplicate'].includes(f)))
  .sort((a,b) => {
    const at = a.flags.includes('thin') ? 1 : 0; const bt = b.flags.includes('thin') ? 1 : 0;
    if (at !== bt) return bt-at;
    if (a.max_similarity !== b.max_similarity) return b.max_similarity-a.max_similarity;
    return a.route.localeCompare(b.route);
  });
const repairs = [];
for (const issue of issueRows) {
  if (repairs.length >= maxRepairs) break;
  const o = byRoute.get(issue.route);
  if (!o || !o.query) {
    blocked.push({ target_route:issue.route, release_action:'repair', reason:'quality_repair_missing_opportunity_metadata', details:issue.flags });
    continue;
  }
  const unit = stageCandidate(o, 'repair', issue.flags);
  if (unit) { unit.release_order = repairs.length + 1; repairs.push(unit); }
}

const units = [...create, ...repairs];
const plan = {
  schema_version: '2.0-quality-gated',
  generated_at: new Date().toISOString(),
  mode: 'demand_gated_then_quality_gated',
  target_semantics: 'a create requires a demand record before it is judged on quality; ceilings are a safety cap for a bad run, and the run ends when demand-backed candidates are exhausted, not when a count is reached',
  demand_gate: {
    source_files: ['data/authority_scale/query_atlas.json', 'data/demand/measured_demand.json'],
    demand_records_available: demandGate.allRecords().length,
    candidates_considered: newCandidates.length,
    refused_for_no_demand: blocked.filter(b => b.reason === 'no_demand_record').length,
  },
  daily_new_page_ceiling: dailyNewCeiling,
  daily_repair_ceiling: dailyRepairCeiling,
  daily_new_pages_already_used: usedNew,
  daily_repairs_already_used: usedRepairs,
  max_new_pages_this_run: maxNew,
  max_repairs_this_run: maxRepairs,
  max_new_pages_per_day: dailyNewCeiling,
  max_repairs_per_day: dailyRepairCeiling,
  max_route_mutations_per_day: dailyNewCeiling + dailyRepairCeiling,
  quality_snapshot: {
    corpus_fingerprint: quality.corpus_fingerprint,
    legacy_backlog: quality.summary.blocking_legacy_pages,
    thin_pages: quality.summary.thin_pages,
    exact_duplicate_pages: quality.summary.exact_duplicate_pages,
    near_duplicate_pages: quality.summary.near_duplicate_pages,
  },
  units,
  release_units: units,
  blocked,
  status: units.length ? 'READY' : 'COMPLETED_NO_CHANGES',
};

fs.writeFileSync(path.join(ROOT,'data/releases/daily_release_plan.json'),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'releases/citation_release_plan.json'),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'.build/citation_release_trace.json'),JSON.stringify(plan,null,2)+'\n');
const priorityUrls = unique([
  ...units.map(u=>urlFor(u.target_route)),
  ...priority.slice(0,25).map(p=>urlFor(p.path||p.route||p.url||'')),
  urlFor('/query-atlas'), urlFor('/atlas'),
]);
let sitemapUrls=[]; try { const sitemap=fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8'); sitemapUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]); } catch {}
const batchUrls=unique([...priorityUrls,...sitemapUrls]).filter(u=>u.startsWith(DOMAIN));
if (!priorityUrls.length || !batchUrls.length) { console.error('Release plan produced no URLs for distribution.'); process.exit(1); }
fs.writeFileSync(path.join(ROOT,'.build/indexnow-priority.txt'),priorityUrls.join('\n')+'\n');
fs.writeFileSync(path.join(ROOT,'.build/indexnow-batch.txt'),batchUrls.join('\n')+'\n');
fs.writeFileSync(path.join(ROOT,'artifacts/release/release_plan_distribution_trace.json'),JSON.stringify({generated_at:plan.generated_at,units:units.length,creates:create.length,repairs:repairs.length,quality_rejected:blocked.filter(x=>x.reason==='quality_preflight_rejected').length,priority_url_count:priorityUrls.length,batch_url_count:batchUrls.length,files:['.build/indexnow-priority.txt','.build/indexnow-batch.txt','.build/citation_release_trace.json']},null,2)+'\n');
console.log(`Built quality-gated release plan: ${create.length} creates, ${repairs.length} substantive repairs, ${blocked.length} blocked/skipped candidates; distribution URLs priority=${priorityUrls.length}, batch=${batchUrls.length}.`);
