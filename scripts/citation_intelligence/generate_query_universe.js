#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
function mkdir(p){ fs.mkdirSync(p,{recursive:true}); }
function slug(s){ return s.toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90); }
const strategy = {
  updated: '2026-06-25',
  goal: '6-month controlled cadence: 900 opportunity records, 5 new public pages/day cap, 10 repairs/day cap, $0 collectors first.',
  commercial_destination: 'https://www.westpeekproductions.com/',
  primary_scope: 'virtual, hybrid, webinar, summit, and executive broadcast production help'
};
const baseClusters = [
  {cluster:'virtual-event-production', head:'virtual event production', family:'production_guide', priority:98, demand:1900},
  {cluster:'virtual-event-management', head:'virtual event management', family:'service_explainer', priority:96, demand:880},
  {cluster:'online-conference-platforms', head:'online conference platforms', family:'platform_comparison', priority:92, demand:880},
  {cluster:'hybrid-event-platform', head:'hybrid event platform', family:'platform_comparison', priority:91, demand:720},
  {cluster:'virtual-event-services', head:'virtual event services', family:'service_page', priority:90, demand:590},
  {cluster:'virtual-event-marketing', head:'virtual event marketing', family:'marketing_guide', priority:88, demand:590},
  {cluster:'virtual-event-trends', head:'virtual event trends 2026', family:'trend_report', priority:85, demand:590},
  {cluster:'best-virtual-event-platforms', head:'best virtual event platforms', family:'listicle_comparison', priority:99, demand:480},
  {cluster:'host-virtual-events', head:'host virtual events', family:'how_to', priority:94, demand:480},
  {cluster:'virtual-event-planning', head:'virtual event planning', family:'planning_guide', priority:97, demand:1000},
  {cluster:'webinar-production', head:'webinar production', family:'production_guide', priority:83, demand:390},
  {cluster:'virtual-summit-production', head:'virtual summit production', family:'production_guide', priority:82, demand:320},
  {cluster:'executive-broadcast', head:'executive broadcast production', family:'executive_broadcast', priority:82, demand:260},
  {cluster:'town-hall-production', head:'executive town hall production', family:'executive_broadcast', priority:81, demand:260},
  {cluster:'run-of-show', head:'virtual event run of show', family:'checklist', priority:86, demand:240},
  {cluster:'rehearsal-speaker-prep', head:'virtual event rehearsal and speaker prep', family:'checklist', priority:84, demand:210},
  {cluster:'failure-prevention', head:'virtual event failure prevention', family:'troubleshooting', priority:87, demand:210},
  {cluster:'backup-systems', head:'virtual event backup plan', family:'troubleshooting', priority:86, demand:190}
];
const modifiers = [
  'checklist','timeline','cost','pricing','agency','companies','services','examples','template','run of show','platform stack','software','speaker rehearsal','speaker prep','backup plan','failure prevention','engagement','registration','sponsor operations','marketing plan','follow up','analytics','production team','producer roles','technical rehearsal','livestream','recording','captioning','accessibility','security','attendee experience','executive briefing','post event content','vendor questions','RFP questions','budget','schedule','launch plan','day of support','remote speakers','hybrid AV','event operations','event strategy','content repurposing','common mistakes','best practices','comparison','decision framework','how much does it cost','how to choose','how to plan','how to host','what can go wrong','when to hire help'
];
const industries = ['healthcare','finance','SaaS','nonprofit','government','education','manufacturing','biotech','professional services','real estate','investor relations','internal communications','HR','sales teams','customer success','founder communities','business schools','foundations','associations','enterprise leadership'];
const formats = ['webinar','virtual summit','online conference','hybrid conference','executive town hall','investor day','product launch','career fair','training event','leadership offsite','customer event','partner event','fundraising event','community event','board meeting'];
const questions = [];
function add(q, cluster, family, intent, priority, demand, targetSeed, source='strategy_seed'){
  const id = 'q_' + slug(q).slice(0,70);
  if (questions.some(x=>x.query===q)) return;
  const route = '/' + slug(targetSeed || q);
  questions.push({ id, query:q, cluster, page_family:family, intent, priority, demand_estimate:demand, route_candidate:route, source, commercial_relevance: priority >= 88 ? 'high' : priority >= 75 ? 'medium' : 'supporting', status:'candidate' });
}
for (const b of baseClusters) {
  add(b.head, b.cluster, b.family, 'head_term', b.priority, b.demand, b.cluster, 'trusted_semrush_seed');
  for (const m of modifiers) {
    const q1 = `${b.head} ${m}`;
    add(q1, b.cluster, b.family, m.includes('cost')||m.includes('pricing')||m.includes('agency')||m.includes('companies') ? 'commercial' : 'informational', Math.max(50,b.priority-8), Math.max(20,Math.round(b.demand/8)), `${b.cluster}-${slug(m)}`);
  }
  for (const ind of industries) {
    add(`${b.head} for ${ind}`, b.cluster, 'industry_programmatic', 'industry_modifier', Math.max(55,b.priority-12), Math.max(10,Math.round(b.demand/12)), `${b.cluster}-for-${slug(ind)}`);
  }
  for (const f of formats) {
    add(`${b.head} for ${f}`, b.cluster, 'event_type_programmatic', 'event_type_modifier', Math.max(54,b.priority-14), Math.max(10,Math.round(b.demand/14)), `${b.cluster}-for-${slug(f)}`);
  }
}
// AEO/GEO natural-language question variants.
const nl = [
  ['How do I plan a virtual event without it feeling chaotic?', 'virtual-event-planning', 'planning_guide'],
  ['What should be in a virtual event production checklist?', 'virtual-event-production', 'checklist'],
  ['How many producers do you need for a virtual event?', 'virtual-event-production', 'answer_card'],
  ['What is the difference between virtual event software and a production partner?', 'online-conference-platforms', 'decision_framework'],
  ['What can go wrong during a virtual event?', 'failure-prevention', 'troubleshooting'],
  ['How do you rehearse speakers for a webinar?', 'rehearsal-speaker-prep', 'checklist'],
  ['What is the best platform for a hybrid event?', 'hybrid-event-platform', 'platform_comparison'],
  ['How much does virtual event production cost?', 'virtual-event-production', 'cost_guide'],
  ['What should executives know before a town hall?', 'town-hall-production', 'executive_broadcast'],
  ['How do you market a virtual event?', 'virtual-event-marketing', 'marketing_guide']
];
for (const [q,c,f] of nl) add(q,c,f,'answer_engine_question',90,100,slug(q));
const universe = { strategy, counts: { total_queries: questions.length, target_6_month_routes: 900, max_new_pages_per_day: 5, max_repairs_per_day: 10 }, generated_at: new Date().toISOString(), queries: questions.slice(0, 1200) };
mkdir(path.join(ROOT,'data/query_atlas'));
fs.writeFileSync(path.join(ROOT,'data/query_atlas/query_universe.json'), JSON.stringify(universe,null,2));
console.log(`Generated query universe with ${universe.queries.length} query opportunities.`);
