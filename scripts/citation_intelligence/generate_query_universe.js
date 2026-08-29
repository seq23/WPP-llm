#!/usr/bin/env node
/**
 * Enumerates candidate queries. Enumerating is cheap and harmless; what was not
 * harmless was calling the result "demand".
 *
 * This file used to stamp every record with `demand_estimate`, computed as
 * `Math.max(10, priority*3)` for seeds and a flat literal `240` for fan-out
 * rows. Across 10,000 records that field held five distinct values. Downstream,
 * `build_release_plan.js` sorted by it and published the top 50 every day, so a
 * number nobody had measured chose which pages got built. `virtual event
 * production` (measured 2,900/mo) and a cartesian string like `community
 * moderation strategy for foundations` (measured: nothing, because nobody has
 * measured it) were separated by 48 points of a made-up scale.
 *
 * Records now carry `search_volume`, `impressions_90d`, `demand_basis` and
 * `demand_evidence`, all sourced from scripts/lib/demand_gate.js. A candidate
 * with no record gets both units null and `demand_evidence: 'NONE'` - an absence,
 * stated as an absence, which the release planner refuses to build on.
 */
const fs=require('fs'),path=require('path'); const ROOT=path.resolve(__dirname,'../..');
const demandGate=require('../lib/demand_gate.js');
const slug=s=>String(s).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
const pillars={
 experiences:['virtual event production','hybrid event production','webinar production','executive broadcast production','virtual summit production','event content repurposing','event audience engagement','event run of show'],
 brand:['brand strategy consulting','brand positioning strategy','brand messaging architecture','brand narrative strategy','startup brand strategy','rebrand strategy'],
 storytelling:['brand storytelling','founder storytelling','corporate storytelling','investor storytelling','presentation storytelling','campaign narrative strategy'],
 community:['community as a service','brand community strategy','customer community strategy','community building for brands','community launch strategy','community operations','community management services','outsourced community management','community engagement strategy','community platform selection','community moderation strategy','community programming','community member experience','community monetization strategy','community-led growth','community metrics and measurement','community staffing model'],
 marketing:['marketing strategy consulting','audience growth strategy','content marketing operations','launch marketing strategy','community marketing','event marketing strategy'],
 creative:['creative strategy consulting','creative direction agency','branded content development','podcast strategy consulting','video content strategy','creative operations'],
 'ai-workflows':['AI workflow consulting','AI marketing workflows','AI content operations','AI creative workflows','human in the loop AI systems','AI knowledge systems for marketing'],
 'agency-decisions':['how to choose a creative agency','brand agency vs marketing agency','creative agency vs production company','AI consultant vs automation agency','integrated agency vs specialist agencies','agency RFP questions']
};
const modifiers=['what is','how to choose','cost','pricing','services','agency','consultant','companies','best practices','checklist','template','examples','workflow','process','timeline','mistakes','red flags','questions to ask','comparison','vs in house team','for startups','for nonprofits','for enterprise teams','for founders','for marketing teams','for small teams','strategy framework','implementation guide','audit','operating model','measurement','ROI factors','when to hire','scope of work','deliverables','case pattern','common failure points','2026'];
const intents=m=>/cost|pricing|agency|consultant|companies|when to hire|scope|deliverables/.test(m)?'commercial':/vs |comparison|how to choose|questions/.test(m)?'decision':'informational';
let qs=[]; const seen=new Set();
/** The only source of a demand number on any record. Returns an absence as an
 *  absence: both units null and `demand_evidence: 'NONE'`. Nothing here invents a
 *  figure to stand in for one.
 *
 *  These records used to carry a single `measured_volume`, copied straight out of
 *  the demand record's `volume`. That field held monthly search volume on
 *  keyword-tool rows and this domain's own 90-day impressions on GSC rows, so
 *  `virtual event production cost` shipped as `measured_volume: 17` and the
 *  cluster pages printed it as "17/mo" - 17 impressions of this site, published to
 *  the open web as a search-volume figure. The two units are now separate fields
 *  and `demand_basis` says which one a consumer may score on. */
function demandFields(query){
  const rec=demandGate.demandRecord(query);
  if(!rec) return {search_volume:null,impressions_90d:null,demand_basis:'none',keyword_difficulty:null,demand_evidence:'NONE',page_eligible:false};
  const units=demandGate.demandUnits(rec);
  return {
    search_volume:units.search_volume,
    impressions_90d:units.impressions_90d,
    demand_basis:units.demand_basis,
    keyword_difficulty:Number.isFinite(Number(rec.keyword_difficulty))?Number(rec.keyword_difficulty):null,
    demand_evidence:rec.source_type,
    demand_evidence_tier:rec.evidence_tier||null,
    page_eligible:true
  };
}
function add(query,pillar,head,mod,priority=80){if(seen.has(query))return;seen.add(query);qs.push({id:'q_'+slug(query).slice(0,78),query,pillar,cluster:slug(head),page_family:/cost|pricing/.test(mod)?'cost_scope':/vs |comparison/.test(mod)?'comparison':/checklist|template/.test(mod)?'template_checklist':/what is/.test(mod)?'definition':'operational_guide',intent:intents(mod),priority,...demandFields(query),route_candidate:'/'+slug(query),source:'full_flow_strategy_seed',authority_lane:pillar==='experiences'?'CORE':pillar==='ai-workflows'?'ADJACENT':'CORE',entity_binding:'west_peek_productions',action_options:['CREATE','EXPAND','MERGE','REFRESH','ANSWER_CARD','ENTITY_SURFACE','EXPERIMENT','DEFER','REJECT'],status:'candidate'});}
for(const [pillar,heads] of Object.entries(pillars))for(const head of heads){add(head,pillar,head,'head',96);for(const m of modifiers){add(m.startsWith('what is')?`what is ${head}`:`${head} ${m}`,pillar,head,m,88);} }
const audiences=['venture backed companies','professional services firms','universities','foundations','associations','investor communities','healthcare organizations','financial services teams','SaaS companies','creative teams','executive leadership teams','community organizations'];
for(const [pillar,heads] of Object.entries(pillars))for(const head of heads)for(const a of audiences)add(`${head} for ${a}`,pillar,head,'audience',82);
const patterns=['why it fails','how to brief a partner','what to prepare before kickoff','how to measure success','how to avoid scope creep','how to build an internal workflow','how to compare vendors','what a good engagement includes'];
for(const [pillar,heads] of Object.entries(pillars))for(const head of heads)for(const p of patterns)add(`${head}: ${p}`,pillar,head,p,84);

const fanoutWindowPath=path.join(ROOT,'data/query_atlas/max_fanout_window.json');
let fanoutWindowPacket={queries:[],generated_at:null};
if(fs.existsSync(fanoutWindowPath)){
  fanoutWindowPacket=JSON.parse(fs.readFileSync(fanoutWindowPath,'utf8'));
  const window=fanoutWindowPacket.queries||[];
  for(const r of window){
    const query=String(r.query||'').trim(); if(!query||seen.has(query)) continue;
    const head=String(r.topic||r.entity||r.pillar||'authority opportunity');
    const pillar=String(r.pillar||r.category||'authority');
    seen.add(query);
    qs.push({id:'q_'+slug(query).slice(0,78),query,pillar,cluster:slug(head),page_family:String(r.format||r.page_family||'operational_guide'),intent:String(r.intent||r.intent_pattern||'informational'),priority:Number(r.priority||80),...demandFields(query),route_candidate:r.route_candidate||('/'+slug(query)),source:'max_fanout_window',authority_lane:r.authority_lane||'ADJACENT',entity_binding:'west_peek_productions',action_options:['CREATE','EXPAND','MERGE','REFRESH','ANSWER_CARD','ENTITY_SURFACE','EXPERIMENT','DEFER','REJECT'],status:'candidate',source_opportunity_id:r.opportunity_id||r.id||null});
  }
}

// Seed a candidate for every query that HAS demand evidence.
//
// Everything above enumerates templates and then asks the gate whether each one
// happens to be real. That is the join in the wrong direction, and the numbers
// showed it: 10,099 candidates, 37 of them demand-backed. The 37 was not a
// measure of how much demand this property has evidence for. It was a measure of
// how often a cartesian expansion of eight pillars by thirty-seven modifiers
// coincidentally produced the exact string a real person typed.
//
// The gate holds 523 queries measured in Search Console and 7 from the Semrush
// packet. Before this block, 486 of them had no candidate row at all - no id, no
// route_candidate, no way to reach the release planner - so the one thing the
// repo could prove people search for was the one thing it could not build for.
//
// This does not weaken the gate; it feeds the gate what it already holds. A row
// seeded here is page_eligible because a demand record exists for it, which is
// the same test every other row passes. Nothing is invented: pillar and cluster
// are inherited from the nearest enumerated head by token overlap, and where
// nothing matches the row says so rather than guessing.
const heads=Object.entries(pillars).flatMap(([pillar,hs])=>hs.map(h=>({pillar,head:h,tokens:new Set(String(h).toLowerCase().match(/[a-z0-9]+/g)||[])})));
function nearestHead(query){
  const qt=new Set(String(query).toLowerCase().match(/[a-z0-9]+/g)||[]);
  let best=null,bestScore=0;
  for(const h of heads){
    let hit=0; for(const t of h.tokens) if(qt.has(t)) hit++;
    const score=h.tokens.size?hit/h.tokens.size:0;
    if(score>bestScore){bestScore=score;best=h;}
  }
  // Half the head's own tokens must appear, or the match is noise. "livekit"
  // sharing no token with any head must not be filed under brand strategy.
  return bestScore>=0.5?{...best,confidence:Number(bestScore.toFixed(3))}:null;
}
let demandSeeded=0;
for(const rec of demandGate.allRecords()){
  const query=String(rec.query||'').trim();
  if(!query||seen.has(query)) continue;
  seen.add(query);
  const match=nearestHead(query);
  const mod=query.toLowerCase();
  qs.push({
    id:'q_'+slug(query).slice(0,78),
    query,
    pillar:match?match.pillar:'unclustered',
    // An unmatched row joins the one `unclustered` bucket. It must NOT get
    // `slug(query)`: `cluster` is not a label, it is the grouping key that
    // generate_query_atlas_pages.js turns into one indexable page per distinct
    // value. A per-query cluster therefore mints a per-query page, and 120
    // unmatched rows minted 117 new clusters and 116 new `index,follow` pages
    // in a single build - 114 of them listing exactly one query. The cadence
    // gate caught it: 117 new editorial URLs against a cap of 2 per week.
    //
    // Those pages were never content decisions. Nothing routed them through the
    // demand gate, the release plan or the noindex policy; they appeared because
    // a JSON grouping key changed. The row already says `pillar:'unclustered'`
    // and `cluster_confidence:0` - saying so once, in one bucket, is the whole
    // point. Every seeded row keeps its demand evidence and its route_candidate,
    // so the release planner still reaches all 491 of them; only the atlas's
    // grouping changes.
    cluster:match?slug(match.head):'unclustered',
    cluster_confidence:match?match.confidence:0,
    page_family:/cost|pricing|budget/.test(mod)?'cost_scope':/ vs |comparison|compare/.test(mod)?'comparison':/checklist|template/.test(mod)?'template_checklist':/^what is/.test(mod)?'definition':'operational_guide',
    intent:intents(mod),
    // No priority integer. The enumerated rows carry one because a human typed
    // it into a seed list; inventing one here would put a made-up number beside
    // a measured record, which is the exact defect demand_gate.js was written to
    // end. Rank these on demand_basis and the units beside it.
    priority:null,
    ...demandFields(query),
    route_candidate:'/'+slug(query),
    source:'measured_demand_seed',
    demand_source_file:rec.demand_source_file||null,
    authority_lane:match&&match.pillar==='ai-workflows'?'ADJACENT':'CORE',
    entity_binding:'west_peek_productions',
    action_options:['CREATE','EXPAND','MERGE','REFRESH','ANSWER_CARD','ENTITY_SURFACE','EXPERIMENT','DEFER','REJECT'],
    status:'candidate'
  });
  demandSeeded++;
}

const strategy={updated:'2026-08-27',goal:'Publish a page for every query with measured demand evidence, and for no query without it. The enumeration below is an index of candidates, not a queue: a candidate becomes publishable only when scripts/lib/demand_gate.js finds a demand record for it.',commercial_destination:'https://www.westpeekproductions.com/',demand_source:'data/authority_scale/query_atlas.json (GSC, T1) + data/demand/measured_demand.json (Semrush, T2b, and owner-approved seeds)',guaranteed:false};
const deterministicGeneratedAt=fanoutWindowPacket.generated_at||`${process.env.BUILD_DATE||new Date().toISOString().slice(0,10)}T00:00:00.000Z`;
// `qs.slice(0,10000)` used to live here, and `counts.target_90_day_routes` was
// 4500. Both were round numbers chosen first and then filled: the enumeration
// happens to produce a little over 10,000 rows, so the slice existed only to
// make the count report as exactly the target. A number that is true because it
// was truncated to be true tells you nothing. The universe is now however large
// the enumeration is, and the only figure that governs publication is
// `demand_backed`, which is a count of evidence and cannot be padded.
const demandBacked=qs.filter(q=>q.page_eligible).length;
// The cadence figures below are READ from the governing contract, never restated.
// They were literals (50/100/2) that generate_query_atlas_pages.js renders onto the
// public query-atlas page as "capped at N new pages/day". When the contract was
// throttled to 2 this literal stayed at 50, so the site published a cadence claim
// that was 25x the governed rate. A number a page states about the system must come
// from the system.
const cadenceContract=JSON.parse(fs.readFileSync(path.join(ROOT,'_content_release_contract.json'),'utf8')).cadence||{};
const out={strategy,counts:{total_queries:qs.length,demand_backed_queries:demandBacked,demand_seeded_candidates:demandSeeded,unbacked_candidates:qs.length-demandBacked,max_new_pages_per_day:Number(cadenceContract.max_new_pages_per_day),max_repairs_per_day:Number(cadenceContract.max_repairs_per_day),scheduled_runs_per_day:Number(cadenceContract.scheduled_runs_per_day),daily_ceiling_shared_across_runs:true,ceiling_semantics:'safety capacity for a bad run, never a number to reach'},generated_at:deterministicGeneratedAt,queries:qs};
fs.mkdirSync(path.join(ROOT,'data/query_atlas'),{recursive:true});fs.writeFileSync(path.join(ROOT,'data/query_atlas/query_universe.json'),JSON.stringify(out,null,2));console.log(`Generated query universe: ${out.queries.length} candidates, of which ${demandBacked} are backed by a demand record and may become pages (${demandSeeded} seeded directly from the demand gate rather than found by coincidence). ${qs.length-demandBacked} are unbacked and are index-only.`);
