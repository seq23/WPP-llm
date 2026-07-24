#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const idx=JSON.parse(fs.readFileSync(path.join(ROOT,'data/authority_scale/fanout_100k/index.json'),'utf8'));
const hash=(b)=>crypto.createHash('sha256').update(b).digest('hex');
const errors=[]; let count=0; const ids=new Set(); const queries=new Set(); const agg=[];
for(const s of idx.shards||[]){
 const p=path.join(ROOT,s.path); if(!fs.existsSync(p)){errors.push(`missing:${s.path}`);continue;}
 const gz=fs.readFileSync(p); if(hash(gz)!==s.sha256)errors.push(`hash:${s.path}`);
 let raw; try{raw=zlib.gunzipSync(gz);}catch(e){errors.push(`gzip:${s.path}:${e.message}`);continue;}
 const lines=raw.toString('utf8').trim().split('\n').filter(Boolean); if(lines.length!==Number(s.record_count))errors.push(`count:${s.path}`);
 for(const line of lines){const r=JSON.parse(line);count++;if(ids.has(r.opportunity_id))errors.push(`duplicate_id:${r.opportunity_id}`);ids.add(r.opportunity_id);if(queries.has(r.query))errors.push(`duplicate_query:${r.query}`);queries.add(r.query);if(r.disposition!=='OPPORTUNITY_ONLY')errors.push(`bad_disposition:${r.opportunity_id}`);}
 agg.push(`${s.part}:${s.record_count}:${s.sha256}:${s.first_id}:${s.last_id}`);
}
if(count!==Number(idx.materialized_reference_runway)||count<100000)errors.push(`runway_count:${count}`);
if(hash(Buffer.from(agg.join('\n')))!==idx.aggregate_sha256)errors.push('aggregate_hash');
if(idx.page_quota!==false)errors.push('fanout_misclassified_as_page_quota');
console.log(JSON.stringify({ok:!errors.length,record_count:count,shard_count:(idx.shards||[]).length,theoretical_combinations:idx.theoretical_combinations,errors:errors.slice(0,20)},null,2));
if(errors.length)process.exit(1);
