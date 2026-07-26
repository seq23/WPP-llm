#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const ROOT=path.resolve(__dirname,'../..');
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
function add(query,pillar,head,mod,priority=80){if(seen.has(query))return;seen.add(query);qs.push({id:'q_'+slug(query).slice(0,78),query,pillar,cluster:slug(head),page_family:/cost|pricing/.test(mod)?'cost_scope':/vs |comparison/.test(mod)?'comparison':/checklist|template/.test(mod)?'template_checklist':/what is/.test(mod)?'definition':'operational_guide',intent:intents(mod),priority,demand_estimate:Math.max(10,priority*3),route_candidate:'/'+slug(query),source:'full_flow_strategy_seed',authority_lane:pillar==='experiences'?'CORE':pillar==='ai-workflows'?'ADJACENT':'CORE',entity_binding:'west_peek_productions',action_options:['CREATE','EXPAND','MERGE','REFRESH','ANSWER_CARD','ENTITY_SURFACE','EXPERIMENT','DEFER','REJECT'],status:'candidate'});}
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
    qs.push({id:'q_'+slug(query).slice(0,78),query,pillar,cluster:slug(head),page_family:String(r.format||r.page_family||'operational_guide'),intent:String(r.intent||r.intent_pattern||'informational'),priority:Number(r.priority||80),demand_estimate:Number(r.demand_estimate||240),route_candidate:r.route_candidate||('/'+slug(query)),source:'max_fanout_window',authority_lane:r.authority_lane||'ADJACENT',entity_binding:'west_peek_productions',action_options:['CREATE','EXPAND','MERGE','REFRESH','ANSWER_CARD','ENTITY_SURFACE','EXPERIMENT','DEFER','REJECT'],status:'candidate',source_opportunity_id:r.opportunity_id||r.id||null});
  }
}

const strategy={updated:'2026-07-10',goal:'Full-flow citation-velocity program: 10,000 actively tracked query records backed by a rotating >=100K planning runway, with a shared ceiling of 50 new pages/day and 100 repairs/day across two scheduled runs.',commercial_destination:'https://www.westpeekproductions.com/',stretch_target_observed_external_citations:100000,guaranteed:false};
const deterministicGeneratedAt=fanoutWindowPacket.generated_at||`${process.env.BUILD_DATE||new Date().toISOString().slice(0,10)}T00:00:00.000Z`;
const out={strategy,counts:{total_queries:qs.length,target_90_day_routes:4500,max_new_pages_per_day:50,max_repairs_per_day:100,scheduled_runs_per_day:2,daily_ceiling_shared_across_runs:true},generated_at:deterministicGeneratedAt,queries:qs.slice(0,10000)};
fs.mkdirSync(path.join(ROOT,'data/query_atlas'),{recursive:true});fs.writeFileSync(path.join(ROOT,'data/query_atlas/query_universe.json'),JSON.stringify(out,null,2));console.log(`Generated full-flow query universe with ${out.queries.length} opportunities across ${Object.keys(pillars).length} pillars.`);
