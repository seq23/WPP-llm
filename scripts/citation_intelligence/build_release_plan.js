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
const { QUALITY_REJECTION_REASONS } = require('./quality_rejection_reasons.js');

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

const contract = readJson('_content_release_contract.json', { cadence: { max_new_pages_per_day: 2, max_repairs_per_day: 100 } });
const opps = readJson('data/opportunities/aeo_geo_opportunities.json', { opportunities: [] }).opportunities || [];
const priority = readJson('data/seo/priority_pages.json', { pages: [] }).pages || [];
const velocityDecision = readJson('data/authority_scale/velocity_decision.json', {});

// Every declared new-page ceiling is a SAFETY CAP, and a safety cap can only ever
// lower the allowance. This was previously a `||` chain, which is first-wins, not
// lowest-wins: the velocity governor's `recommended_new_url_ceiling_per_day` sat at
// the front of it and was 50, so once the contract was throttled to 2 the contract's
// number was never read at all. The published plan therefore recorded
// `max_new_pages_per_day: 50` while `_content_release_contract.json` declared 2 - the
// contract and the publisher stating different things about the same governed number.
// Lowest-wins makes the contract binding and keeps every other source able to
// throttle further but never to buy headroom.
const declaredNewCeilings = [
  process.env.MAX_NEW_PAGES_PER_DAY,
  velocityDecision.recommended_new_url_ceiling_per_day,
  contract.cadence?.max_new_pages_per_day,
].map(Number).filter((n) => Number.isFinite(n) && n >= 0);
const dailyNewCeiling = declaredNewCeilings.length ? Math.min(...declaredNewCeilings) : 2;
const dailyRepairCeiling = Number(process.env.MAX_REPAIRS_PER_DAY || contract.cadence?.max_repairs_per_day || 100);
if (dailyNewCeiling < 0 || dailyNewCeiling > 200 || dailyRepairCeiling < 0 || dailyRepairCeiling > 250) {
  console.error('Full-flow caps out of governed range.'); process.exit(1);
}
const today = process.env.CADENCE_TODAY || new Date().toISOString().slice(0,10);
const velocityLedger = readJson('data/releases/daily_velocity_ledger.json', { date: today, new_pages_used: 0, repairs_used: 0 });
const sameDay = velocityLedger.date === today;
const usedNew = sameDay ? Number(velocityLedger.new_pages_used || 0) : 0;
const usedRepairs = sameDay ? Number(velocityLedger.repairs_used || 0) : 0;

// ---------------------------------------------------------------------------
// The weekly cadence allowance, consulted BEFORE anything is generated.
//
// data/cadence/policy.json declared new_pages_per_week: 2 and scripts/cadence_gate.js
// enforced it, while this planner's only ceiling was a per-DAY number that defaulted
// to 50 and was set to 50 in the release workflow, which runs on `35 8,20 * * *` -
// twice a day. Nothing in the publishing path ever read the weekly policy, so the
// declared rate and the actual rate had no relationship at all: 52 new editorial
// URLs accumulated against a cap of 2, roughly 26x, and the gate's only remaining
// job was to report the gap after the fact.
//
// A cap enforced only downstream of the thing it governs is not a cap, it is a
// complaint. The allowance is therefore read here, from the same policy file the
// gate reads, and applied to the plan before candidates are staged. The per-day
// ceiling is kept as what it was always described as - "a safety cap for a bad
// run" - and can only ever LOWER the allowance, never raise it. Env and contract
// values likewise cannot exceed policy; MAX_NEW_PAGES_PER_DAY can throttle a run
// further but cannot buy headroom the policy has not granted.
//
// Usage is measured over a trailing 7-day window from the same per-day ledger the
// planner already keeps, so a run at 08:35 and a run at 20:35 draw on one weekly
// budget rather than a fresh one each midnight. Most runs will now legitimately
// create zero pages. That is the ordinary success state of a governed publisher,
// not a fault - it is recorded as WEEKLY_CADENCE_ALLOWANCE_EXHAUSTED below so it
// can never be mistaken for a broken upstream stage.
// ---------------------------------------------------------------------------
const CADENCE_POLICY_REL = 'data/cadence/policy.json';
const cadencePolicy = readJson(CADENCE_POLICY_REL, {});
const declaredWeekly = Number(cadencePolicy.new_pages_per_week);
if (!Number.isFinite(declaredWeekly) || declaredWeekly < 0) {
  console.error(`Cadence policy missing a usable new_pages_per_week in ${CADENCE_POLICY_REL}. Refusing to publish against an unknown allowance - a publisher with no declared rate is exactly the state this gate exists to prevent.`);
  process.exit(1);
}

const WEEK_DAYS = 7;
function trailingWeekDates(endDate) {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const out = [];
  for (let i = 0; i < WEEK_DAYS; i += 1) out.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
  return out;
}
// Per-date new-page counts. The daily ledger holds today; the weekly ledger holds
// the history the daily one overwrites each midnight.
const weeklyLedgerRel = 'data/releases/weekly_velocity_ledger.json';
const weeklyLedger = readJson(weeklyLedgerRel, { days: {} });
const weekDays = weeklyLedger && typeof weeklyLedger.days === 'object' && weeklyLedger.days ? weeklyLedger.days : {};
const window = trailingWeekDates(today);
let usedThisWeek = 0;
for (const d of window) {
  const fromWeekly = Number(weekDays[d] || 0);
  const fromDaily = d === today ? usedNew : 0;
  usedThisWeek += Math.max(fromWeekly, fromDaily);
}
const weeklyHeadroom = Math.max(0, declaredWeekly - usedThisWeek);

const dailyHeadroom = Math.max(0, dailyNewCeiling - usedNew);
const maxNew = Math.min(dailyHeadroom, weeklyHeadroom);
const maxRepairs = Math.max(0, dailyRepairCeiling - usedRepairs);
const newPageGovernor = weeklyHeadroom <= dailyHeadroom ? 'weekly_cadence_policy' : 'daily_safety_ceiling';
console.log(`[cadence] new-page allowance: ${maxNew} (weekly policy ${declaredWeekly}/wk, ${usedThisWeek} used in trailing ${WEEK_DAYS}d -> headroom ${weeklyHeadroom}; daily safety ceiling ${dailyNewCeiling}, ${usedNew} used -> headroom ${dailyHeadroom}; governed by ${newPageGovernor})`);

// Demand comes in two units that must never be compared: `search_volume` counts
// searches the whole market runs, `impressions_90d` counts times this one site was
// shown. Ordering is therefore band-major - all the market-volume candidates, then
// all the own-impressions candidates, then the unmeasured - and the magnitude
// comparison only ever happens inside a band.
const DEMAND_BANDS = { search_volume: 0, impressions_90d: 1, none: 2 };
const releaseBand = (o) => DEMAND_BANDS[(demandGate.demandSignal(o.query) || {}).demand_basis || 'none'];
const demandWithinBand = (o) => {
  const s = demandGate.demandSignal(o.query);
  if (!s) return 0;
  return (s.demand_basis === 'search_volume' ? s.search_volume : s.impressions_90d) || 0;
};

const normalized = opps
  .filter(o => o && o.query && o.target_route)
  .map(o => ({ ...o, target_route: governedRoute(o.target_route), source_route: cleanRoute(o.target_route), exists_now: existsRoute(o.target_route) }))
  // Ordered by measured demand, BAND-MAJOR. The previous tiebreak was
  // `demand_estimate`, a fabricated priority*3; ordering by it meant a made-up
  // number chose which page got built each day. Its replacement then sorted every
  // candidate on one `volume` field that held monthly search volume for some rows
  // and this site's own 90-day impressions for others, so 1,300 searches and 8
  // impressions sorted as peers. Candidates with a keyword-tool search_volume are
  // ordered among themselves first, then candidates evidenced only by this site's
  // own impressions, then the unmeasured - which are refused below anyway, so
  // their position is only about report readability. Two numbers in different
  // units are never subtracted from each other.
  .sort((a,b) => (releaseBand(a)-releaseBand(b)) || (demandWithinBand(b)-demandWithinBand(a)) || (b.score||0)-(a.score||0) || a.target_route.localeCompare(b.target_route));
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
    blocked.push({ target_route:o.target_route, query:o.query, release_action:action, reason:QUALITY_REJECTION_REASONS.PREFLIGHT, details:quality.reasons, word_count:quality.word_count, max_similarity:quality.max_similarity, nearest_route:quality.nearest_route });
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
// Two different notions of "already planned" have to agree here.
//
// keyFor() identifies an *opportunity*, so a synonym cluster - "virtual event
// production", "virtual conference production", "online event production" and
// three more - passes it as six distinct rows while every one of them resolves
// to the same canonical route. validate_release_plan.js dedupes on
// route|action, which is the thing that actually gets written, so a plan built
// this way failed its own validator with "duplicate unit". A route can only be
// created once; the extra queries are not lost, they are what that one page is
// for. Keeping the first also keeps the highest-ranked, because orderedCreates
// is already sorted.
const seenCreateRoute = new Set();
let collapsedSynonymCandidates = 0;
for (const o of orderedCreates) {
  if (create.length >= maxNew) break;
  const key = keyFor(o); if (seenCreate.has(key)) continue; seenCreate.add(key);
  const routeKey = `${o.target_route}|create`;
  if (seenCreateRoute.has(routeKey)) { collapsedSynonymCandidates++; continue; }
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
    const units = demandGate.demandUnits(record);
    unit.demand_evidence = {
      source_type: record.source_type,
      evidence_tier: record.evidence_tier || null,
      // Both units, named. A single `measured_volume` here reported this site's own
      // impression count as though it were market search volume.
      search_volume: units.search_volume,
      impressions_90d: units.impressions_90d,
      demand_basis: units.demand_basis,
      source_file: record.demand_source_file
    };
    create.push(unit);
    seenCreateRoute.add(`${o.target_route}|create`);
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
    collapsed_synonym_candidates: collapsedSynonymCandidates,
  },
  cadence: {
    policy_file: CADENCE_POLICY_REL,
    authority: 'data/cadence/policy.json is the single source of truth for publishing rate. The per-day ceiling is a safety cap on one bad run and can only lower this allowance, never raise it.',
    new_pages_per_week: declaredWeekly,
    window_days: WEEK_DAYS,
    window_dates: window,
    new_pages_used_this_week: usedThisWeek,
    weekly_headroom: weeklyHeadroom,
    daily_headroom: dailyHeadroom,
    new_page_allowance_this_run: maxNew,
    governed_by: newPageGovernor,
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

// Rule 0: a stage may not finish having done nothing without naming why.
//
// Zero creates is this repo's correct terminal state, not a failure - the demand
// gate is doing its job and the demand-backed pool is exhausted. But
// COMPLETED_NO_CHANGES alone cannot tell that apart from a run where the
// candidate list was empty because an upstream stage broke, or where every
// candidate was rejected on quality. Those need different responses, so the plan
// names which one happened rather than leaving all three looking identical.
if (!create.length) {
  const refusedNoDemand = blocked.filter((b) => b.release_action === 'create' && b.reason === 'no_demand_record').length;
  const rejectedOnQuality = blocked.filter((b) => b.release_action === 'create' && b.reason !== 'no_demand_record').length;
  // The weekly allowance and the daily safety cap are separated here on purpose.
  // Both produce zero creates, but they mean different things: the weekly one is
  // the declared editorial rate working exactly as intended and is the expected
  // outcome on most of the fourteen scheduled runs a week; the daily one means a
  // single day tried to burn its whole safety margin.
  plan.create_stop_reason = !newCandidates.length
    ? 'NO_CANDIDATES_UPSTREAM'
    : (weeklyHeadroom <= 0
      ? 'WEEKLY_CADENCE_ALLOWANCE_EXHAUSTED'
      : (maxNew <= 0
        ? 'DAILY_CEILING_ALREADY_USED'
        : (refusedNoDemand && !rejectedOnQuality
          ? 'DEMAND_BACKED_POOL_EXHAUSTED'
          : (rejectedOnQuality ? 'ALL_CANDIDATES_REJECTED_ON_QUALITY' : 'DEMAND_BACKED_POOL_EXHAUSTED'))));
  plan.create_stop_detail = `${newCandidates.length} candidate(s) considered, ${refusedNoDemand} refused for no demand record, ${rejectedOnQuality} rejected downstream, allowance this run ${maxNew} (weekly headroom ${weeklyHeadroom} of ${declaredWeekly}/wk, daily headroom ${dailyHeadroom})`;
  plan.create_stop_is_legitimate = ['DEMAND_BACKED_POOL_EXHAUSTED', 'DAILY_CEILING_ALREADY_USED', 'WEEKLY_CADENCE_ALLOWANCE_EXHAUSTED'].includes(plan.create_stop_reason);
}

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
fs.writeFileSync(path.join(ROOT,'artifacts/release/release_plan_distribution_trace.json'),JSON.stringify({generated_at:plan.generated_at,units:units.length,creates:create.length,repairs:repairs.length,quality_rejected:blocked.filter(x=>x.reason===QUALITY_REJECTION_REASONS.PREFLIGHT).length,priority_url_count:priorityUrls.length,batch_url_count:batchUrls.length,files:['.build/indexnow-priority.txt','.build/indexnow-batch.txt','.build/citation_release_trace.json']},null,2)+'\n');
console.log(`Built quality-gated release plan: ${create.length} creates, ${repairs.length} substantive repairs, ${blocked.length} blocked/skipped candidates; distribution URLs priority=${priorityUrls.length}, batch=${batchUrls.length}.`);
if (plan.create_stop_reason) {
  const verdict = plan.create_stop_is_legitimate ? 'NAMED STOP' : 'NEEDS ATTENTION';
  console.log(`Creates: ${verdict} (${plan.create_stop_reason}) - ${plan.create_stop_detail}.`);
}
