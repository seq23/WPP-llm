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
  const prompt = `Return JSON with 25 search and AEO query opportunities for a production company targeting virtual events, hybrid events, webinars, virtual summits, and executive broadcasts. Fields: query, intent, cluster, reason. Do not include prose.`;
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
  for (const q of universe.queries || []) normalized.push({source:q.source||'query_universe', query_or_topic:q.query, cluster:q.cluster, target_route:q.route_candidate, signal_type:'query_opportunity', strength:q.priority || 50, demand_estimate:q.demand_estimate||0, observed_at:new Date().toISOString(), actionability:'create_or_repair'});
  for (const r of gsc.records || []) normalized.push({...r, source:'gsc'});
  for (const r of manual.records || []) normalized.push({...r, source:'manual_citation'});
  for (const r of social.records || []) normalized.push({...r, source:'social'});
  for (const r of gemini.records || []) normalized.push({...r, source:'gemini_prompt_panel'});
  const packet = {generated_at:new Date().toISOString(), gsc_status:(gsc.records||[]).length?'records_present':'no_records_file_or_empty', gemini_status:gemini.status, record_count:normalized.length, records:normalized};
  fs.writeFileSync(path.join(ROOT,'data/signals/normalized_records.json'), JSON.stringify(packet,null,2));
  fs.writeFileSync(path.join(ROOT,'artifacts/release/zero_cost_signal_collection.json'), JSON.stringify({generated_at:packet.generated_at, gsc_status:packet.gsc_status, gemini_status:packet.gemini_status, record_count:packet.record_count},null,2));
  console.log(`Collected ${normalized.length} normalized $0 signal records (GSC: ${packet.gsc_status}; Gemini: ${packet.gemini_status}).`);
})();
