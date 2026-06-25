#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=path.resolve(__dirname,'../..');
const p=path.join(ROOT,'data/page_families/page_family_registry.json'); if(!fs.existsSync(p)){console.error('Missing page family registry');process.exit(1);} const data=JSON.parse(fs.readFileSync(p,'utf8'));
const req=['family_id','purpose','allowed_verticals','route_pattern','intended_query_types','required_sections','required_atom_types','required_schema','canonical_rules','internal_link_rules','CTA_rules','min_substance_threshold','dedupe_rules','noindex_rules','validation_ids']; const bad=[];
for(const f of data.families||[]) for(const k of req) if(!(k in f)) bad.push(`${f.family_id||'unknown'} missing ${k}`);
if((data.families||[]).length<10) bad.push('expected at least 10 page families'); if(bad.length){console.error(bad.join('\n'));process.exit(1);} console.log(`Page family contract OK (${data.families.length} families)`);
