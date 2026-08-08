#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
function mkdir(p){fs.mkdirSync(p,{recursive:true});}
function readJson(p, fallback){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));}catch{return fallback;}}
async function geminiPanel(universe){
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  const out = {source:'gemini_prompt_panel', status:key?'configured':'skipped_missing_secret', records:[]};
  if (!key || typeof fetch !== 'function') return out;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const prompt = `Return JSON with 50 search, AEO, GEO, and LLM citation opportunities for West Peek Productions across virtual and hybrid events, brand strategy, storytelling, marketing, creative consulting, AI workflows, and agency-selection decisions. Fields: query, intent, cluster, reason. Do not include prose.`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.2}})});
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('\n') || '';
    out.raw_text_length = text.length;
    out.status = res.ok ? 'collected' : 'provider_error';
    out.records = [{query:'gemini prompt-panel output', signal_type:'llm_query_opportunity_panel', strength: res.ok ? 60 : 0, evidence_text:text.slice(0,4000), observed_at:new Date().toISOString()}];
  } catch (e) { out.status='collector_error'; out.error=String(e.message||e); }
  return out;
}
(async()=>{
  mkdir(path.join(ROOT,'data/signals')); mkdir(path.join(ROOT,'artifacts/release'));
  const universe = readJson('data/query_atlas/query_universe.json',{queries:[]});
  const gsc = readJson('data/signals/gsc_query_signals.json',{records:[]});
  const manual = readJson('data/signals/manual_citation_observations.json',{records:[]});
  const social = readJson('data/signals/social_signal_ledger.json',{records:[]});
  const gemini = await geminiPanel(universe);
  const normalized = [];
  for (const q of universe.queries || []) normalized.push({source:q.source||'query_universe', query_or_topic:q.query, cluster:q.cluster, pillar:q.pillar, authority_lane:q.authority_lane, page_family:q.page_family, entity_binding:q.entity_binding, target_route:q.route_candidate, signal_type:'query_opportunity', strength:q.priority || 50, demand_estimate:q.demand_estimate||0, observed_at:new Date().toISOString(), actionability:'create_or_repair'});
  for (const r of gsc.records || []) normalized.push({...r, source:'gsc'});
  for (const r of manual.records || []) normalized.push({...r, source:'manual_citation'});
  for (const r of social.records || []) normalized.push({...r, source:'social'});
  for (const r of gemini.records || []) normalized.push({...r, source:'gemini_prompt_panel'});
  const packet = {generated_at:new Date().toISOString(), gsc_status:(gsc.records||[]).length?'records_present':'no_records_file_or_empty', gemini_status:gemini.status, record_count:normalized.length, records:normalized};
  fs.writeFileSync(path.join(ROOT,'data/signals/normalized_records.json'), JSON.stringify(packet,null,2));
  fs.writeFileSync(path.join(ROOT,'artifacts/release/zero_cost_signal_collection.json'), JSON.stringify({generated_at:packet.generated_at, gsc_status:packet.gsc_status, gemini_status:packet.gemini_status, record_count:packet.record_count},null,2));

  // Provider request/volume metering. Only increments when a live provider call was
  // actually attempted (not on skipped_missing_credentials/skipped_missing_secret).
  const cost = readJson('data/admin/cost_ledger.json', null);
  if (cost) {
    const today = new Date().toISOString().slice(0,10);
    if (cost.today.date !== today) cost.today = {date:today, gsc_requests:0, gemini_requests:0, manual_ingest_runs:0};
    if (gsc.status && gsc.status !== 'skipped_missing_credentials') cost.today.gsc_requests += 1;
    if (!['skipped_missing_secret'].includes(gemini.status)) cost.today.gemini_requests += 1;
    cost.updated_at = new Date().toISOString();
    fs.writeFileSync(path.join(ROOT,'data/admin/cost_ledger.json'), JSON.stringify(cost,null,2)+'\n');
  }

  console.log(`Collected ${normalized.length} normalized $0 signal records (GSC: ${packet.gsc_status}; Gemini: ${packet.gemini_status}).`);
})();
