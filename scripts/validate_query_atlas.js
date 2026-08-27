#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=path.resolve(__dirname,'..');
const demandGate=require('./lib/demand_gate.js');
const u=JSON.parse(fs.readFileSync(path.join(ROOT,'data/query_atlas/query_universe.json'),'utf8')); const bad=[];
// This used to read `if(queries.length < 900) bad.push('query universe too
// small')`. A floor on a count is an instruction to manufacture: the only way
// to satisfy it when real queries run out is to invent strings until the number
// is met, which is exactly how the universe reached a round 10,000. What
// matters is not how many candidates were enumerated but whether every record
// tells the truth about its own evidence, so that is what is checked.
for(const q of (u.queries||[])){
  const backed=demandGate.hasDemand(q.query);
  if(q.page_eligible!==backed) bad.push(`${q.query}: page_eligible=${q.page_eligible} but demand gate says ${backed}`);
  // Demand is carried in two named units - `search_volume` (monthly searches, from
  // a keyword tool) and `impressions_90d` (this site's own 90-day impressions) -
  // because one field called `measured_volume` used to hold either, and a row
  // evidenced by 8 of this site's impressions was indistinguishable from one
  // evidenced by 8 monthly searches. `demand_basis` names which unit is populated.
  const value=q.demand_basis==='search_volume'?q.search_volume:q.demand_basis==='impressions_90d'?q.impressions_90d:null;
  if(backed && !(Number(value)>0) && q.demand_evidence!=='owner_approved_seed') bad.push(`${q.query}: marked demand-backed with no demand evidence in either unit`);
  if(!backed && !(q.search_volume===null && q.impressions_90d===null)) bad.push(`${q.query}: carries a demand figure with no demand record behind it`);
  const expected=q.search_volume!==null&&q.search_volume!==undefined?'search_volume':q.impressions_90d!==null&&q.impressions_90d!==undefined?'impressions_90d':'none';
  if(q.demand_basis!==expected) bad.push(`${q.query}: demand_basis=${q.demand_basis} disagrees with the populated fields (expected ${expected})`);
}
if(!fs.existsSync(path.join(ROOT,'query-atlas.html'))) bad.push('missing query-atlas.html');
const clusters=new Set((u.queries||[]).map(q=>q.cluster)); for(const c of clusters) if(!fs.existsSync(path.join(ROOT,'query-atlas',`${c}.html`))) bad.push(`missing cluster page ${c}`);
if(bad.length){console.error(bad.slice(0,80).join('\n'));process.exit(1);} console.log(`Query atlas OK (${u.queries.length} queries, ${clusters.size} clusters)`);
