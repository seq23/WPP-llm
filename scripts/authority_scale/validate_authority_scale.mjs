#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const errors=[];
const index=read('data/authority_scale/fanout_100k/index.json');
if(Number(index.materialized_reference_runway)<100000)errors.push('fanout_reference_runway_below_100k');
if(index.page_quota!==false)errors.push('fanout_is_page_quota');
if(BigInt(index.theoretical_combinations||0)<100000n)errors.push('fanout_theoretical_capacity_below_100k');
let count=0,community=0;const ids=new Set(),queries=new Set();const sha=(b)=>crypto.createHash('sha256').update(b).digest('hex');
for(const s of index.shards||[]){const p=path.join(ROOT,s.path);if(!fs.existsSync(p)){errors.push(`missing_shard:${s.path}`);continue;}const gz=fs.readFileSync(p);if(sha(gz)!==s.sha256)errors.push(`shard_hash:${s.path}`);const raw=zlib.gunzipSync(gz);for(const line of raw.toString('utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(line);count++;if(ids.has(r.opportunity_id))errors.push(`duplicate_id:${r.opportunity_id}`);ids.add(r.opportunity_id);if(queries.has(r.query))errors.push(`duplicate_query:${r.query}`);queries.add(r.query);if(/community/i.test(`${r.topic} ${r.query}`))community++;}}
if(count!==Number(index.materialized_reference_runway))errors.push(`fanout_count:${count}`);
if(community<1000)errors.push(`community_fanout_too_shallow:${community}`);
const admissions=read('data/content/page_admission_registry.json').admissions||[];
const frozen=read('data/release/frozen_output_registry.json').pages||[];
const admittedExisting=admissions.filter(a=>['admitted','ADMITTED'].includes(a.status)).filter(a=>{const r=String(a.route||'').replace(/^\//,'').replace(/\/$/,'');return fs.existsSync(path.join(ROOT,r+'.html'))||fs.existsSync(path.join(ROOT,r,'index.html'));});
const freezeContract=read('data/release/accepted_output_freeze_contract.json');
const expectedFrozen=admittedExisting.length+(freezeContract.extra_static_files||[]).length;
if(frozen.length!==expectedFrozen)errors.push(`frozen_count:${frozen.length}:${expectedFrozen}`);
for(const p of frozen){const cache=path.join(ROOT,p.cache_file||'');const rendered=path.join(ROOT,p.rendered_file||'');if(!fs.existsSync(cache))errors.push(`missing_cache:${p.route}`);if(!fs.existsSync(rendered))errors.push(`missing_rendered:${p.route}`);else if(sha(fs.readFileSync(rendered))!==p.accepted_sha256)errors.push(`frozen_drift:${p.route}`);}
if(!fs.existsSync(path.join(ROOT,'community-as-a-service.html')))errors.push('community_service_page_missing');
const entities=read('data/entities/entities.json').entities||[];if(!entities.some(e=>e.id==='community-as-a-service'))errors.push('community_entity_missing');
const strategy=read('data/strategy/citation_strategy_profile.json');if(!(strategy.scope||[]).includes('community as a service'))errors.push('community_scope_missing');
const window=read('data/query_atlas/max_fanout_window.json');if((window.queries||[]).length<6000)errors.push('fanout_window_not_operational');const universe=read('data/query_atlas/query_universe.json');if((universe.queries||[]).filter(q=>q.source==='max_fanout_window').length<5000)errors.push('fanout_window_not_consumed_by_query_atlas');const governor=read('data/authority_scale/velocity_governor.json');if(governor.per_run_budget_rule?.includes('remaining daily budget')!==true)errors.push('daily_budget_not_shared_across_runs');if(strategy.cadence?.max_new_pages_per_run||strategy.cadence?.max_repairs_per_run)errors.push('strategy_still_declares_per_run_publication_caps');if(Number(strategy.cadence?.max_new_pages_per_day)!==Number(governor.daily_ceiling?.new_pages))errors.push('strategy_governor_daily_ceiling_mismatch');
const releaseCode=fs.readFileSync(path.join(ROOT,'scripts/citation_intelligence/build_release_plan.js'),'utf8');if(!releaseCode.includes('daily_velocity_ledger.json'))errors.push('daily_velocity_ledger_not_enforced');
console.log(JSON.stringify({ok:errors.length===0,fanout_records:count,theoretical_capacity:index.theoretical_combinations,community_fanout_records:community,frozen_outputs:frozen.length,admitted_existing_outputs:admittedExisting.length,extra_static_frozen:(freezeContract.extra_static_files||[]).length,errors:errors.slice(0,50)},null,2));
if(errors.length)process.exit(1);
