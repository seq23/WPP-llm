#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
function readJson(p,f){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));}catch{return f;}}
function existsRoute(route){ const rel=route.replace(/^\//,''); return fs.existsSync(path.join(ROOT, rel+'.html')) || fs.existsSync(path.join(ROOT, rel, 'index.html')); }
fs.mkdirSync(path.join(ROOT,'data/opportunities'),{recursive:true});
const signals = readJson('data/signals/normalized_records.json',{records:[]}).records || [];
const scored = signals.filter(r=>r.query_or_topic && r.target_route).map(r=>{
  const exists = existsRoute(r.target_route);
  const commercial = /cost|pricing|agency|companies|services|best|platform|hire|RFP|vendor/i.test(r.query_or_topic) ? 18 : 0;
  const gscBoost = r.source === 'gsc' ? 30 : 0;
  const createBoost = exists ? 0 : 12;
  const score = Math.min(100, Math.round((r.strength||50) + commercial + gscBoost + createBoost));
  return {opportunity_id:'opp_'+Buffer.from(r.query_or_topic).toString('base64').replace(/[^a-zA-Z0-9]/g,'').slice(0,24), query:r.query_or_topic, cluster:r.cluster||'unclustered', target_route:r.target_route, page_family:r.page_family||'programmatic_opportunity', source:r.source, demand_estimate:r.demand_estimate||0, score, exists, action: exists ? 'repair_or_expand' : 'create', status:'admitted_candidate'};
}).sort((a,b)=>b.score-a.score || b.demand_estimate-a.demand_estimate);
fs.writeFileSync(path.join(ROOT,'data/opportunities/aeo_geo_opportunities.json'), JSON.stringify({generated_at:new Date().toISOString(), count:scored.length, opportunities:scored},null,2));
console.log(`Scored ${scored.length} AEO/GEO opportunities.`);
