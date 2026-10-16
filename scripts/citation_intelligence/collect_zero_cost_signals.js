#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { freeChat, FreeRouterCostViolation } = require('../llm/free_router.js');
const ROOT = path.resolve(__dirname, '../..');
function mkdir(p){fs.mkdirSync(p,{recursive:true});}
function readJson(p, fallback){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));}catch{return fallback;}}
// Owner policy, 11 Oct 2026: nothing paid. The prompt panel used Gemini; it
// now asks only $0 OpenRouter models through scripts/llm/free_router.js, and
// its FREE_LLM_RECEIPT line in the log is the proof of what answered.
async function freeModelPanel(universe){
  const out = {source:'free_model_prompt_panel', status:'configured', records:[]};
  const prompt = `Return JSON with 20 search, AEO, GEO, and LLM citation opportunities for West Peek Productions across virtual and hybrid events, brand strategy, storytelling, marketing, creative consulting, AI workflows, and agency-selection decisions. Fields: query, intent, cluster, reason. Do not invent statistics, clients, or results.`;
  let r;
  try { r = await freeChat({messages:[{role:'user',content:prompt}], max_tokens:2500, temperature:0.2, purpose:'collect_zero_cost_signals:prompt_panel', timeoutMs:150000}); }
  catch (e) { if (e instanceof FreeRouterCostViolation) throw e; out.status='collector_error'; out.error=String(e.message||e); return out; }
  if (!r.ok) { out.status = r.stop === 'FREE_ROUTER_NO_KEY' ? 'skipped_missing_secret' : 'skipped_named_stop'; out.stop = r.stop; out.key_label = r.receipt.key_label; return out; }
  out.status = 'collected'; out.model = r.model; out.key_label = r.receipt.key_label; out.raw_text_length = r.content.length;
  out.records = [{query:'free-model prompt-panel output', signal_type:'llm_query_opportunity_panel', strength:60, evidence_text:r.content.slice(0,4000), model:r.model, observed_at:new Date().toISOString()}];
  return out;
}
(async()=>{
  mkdir(path.join(ROOT,'data/signals')); mkdir(path.join(ROOT,'artifacts/release'));
  const universe = readJson('data/query_atlas/query_universe.json',{queries:[]});
  const gsc = readJson('data/signals/gsc_query_signals.json',{records:[]});
  const manual = readJson('data/signals/manual_citation_observations.json',{records:[]});
  const social = readJson('data/signals/social_signal_ledger.json',{records:[]});
  const panel = await freeModelPanel(universe);
  const normalized = [];
  for (const q of universe.queries || []) normalized.push({source:q.source||'query_universe', query_or_topic:q.query, cluster:q.cluster, pillar:q.pillar, authority_lane:q.authority_lane, page_family:q.page_family, entity_binding:q.entity_binding, target_route:q.route_candidate, signal_type:'query_opportunity', strength:q.priority || 50, demand_estimate:q.demand_estimate||0, observed_at:new Date().toISOString(), actionability:'create_or_repair'});
  for (const r of gsc.records || []) normalized.push({...r, source:'gsc'});
  for (const r of manual.records || []) normalized.push({...r, source:'manual_citation'});
  for (const r of social.records || []) normalized.push({...r, source:'social'});
  for (const r of panel.records || []) normalized.push({...r, source:'free_model_prompt_panel'});
  const packet = {generated_at:new Date().toISOString(), gsc_status:(gsc.records||[]).length?'records_present':'no_records_file_or_empty', llm_panel_status:panel.status, llm_panel_model:panel.model||null, record_count:normalized.length, records:normalized};
  fs.writeFileSync(path.join(ROOT,'data/signals/normalized_records.json'), JSON.stringify(packet,null,2));
  fs.writeFileSync(path.join(ROOT,'artifacts/release/zero_cost_signal_collection.json'), JSON.stringify({generated_at:packet.generated_at, gsc_status:packet.gsc_status, llm_panel_status:packet.llm_panel_status, llm_panel_model:packet.llm_panel_model, record_count:packet.record_count},null,2));

  // Provider request/volume metering. Only increments when a live provider call was
  // actually attempted (not on skipped_missing_credentials/skipped_missing_secret).
  const cost = readJson('data/admin/cost_ledger.json', null);
  if (cost) {
    const today = new Date().toISOString().slice(0,10);
    if (cost.today.date !== today) cost.today = {date:today, gsc_requests:0, free_llm_requests:0, manual_ingest_runs:0};
    cost.today.free_llm_requests = cost.today.free_llm_requests || 0; delete cost.today.gemini_requests;
    if (gsc.status && gsc.status !== 'skipped_missing_credentials') cost.today.gsc_requests += 1;
    if (!['skipped_missing_secret'].includes(panel.status)) cost.today.free_llm_requests += 1;
    cost.updated_at = new Date().toISOString();
    fs.writeFileSync(path.join(ROOT,'data/admin/cost_ledger.json'), JSON.stringify(cost,null,2)+'\n');
  }

  console.log(`Collected ${normalized.length} normalized $0 signal records (GSC: ${packet.gsc_status}; free-model panel: ${packet.llm_panel_status}).`);
})();
