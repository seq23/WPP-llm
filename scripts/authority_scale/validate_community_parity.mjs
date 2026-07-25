#!/usr/bin/env node
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const parity=read('data/authority_scale/community_authority_parity.json');
const source=read('data/content/community_authority_foundation.json');
const admissions=read('data/content/page_admission_registry.json').admissions||[];
const frozen=read('data/release/frozen_output_registry.json').pages||[];
const errors=[];
if(parity.community_strategic_layer_coverage!==1)errors.push('missing strategic layer');
if(parity.metrics.community.answers<10)errors.push('community answers <10');
if(parity.metrics.community.learn<6)errors.push('community learn <6');
if(parity.metrics.community.programmatic<50)errors.push('community programmatic <50');
if(parity.metrics.community.query_atlas<20)errors.push('community query atlas <20');
const expected=(source.items||[]).map(i=>i.kind==='answer'?`/answers/${i.slug}`:i.kind==='learn'?`/learn/${i.slug}`:`/programmatic/${i.slug}`);
expected.push('/pillars/community-as-a-service');
const admitted=new Set(admissions.filter(a=>String(a.status).toLowerCase()==='admitted').map(a=>String(a.route||'').replace(/\/$/,'')));
const frozenRoutes=new Set(frozen.map(x=>String(x.route||'').replace(/\/$/,'')));
for(const route of expected){if(!admitted.has(route))errors.push(`community route not admitted:${route}`);if(!frozenRoutes.has(route))errors.push(`community route not frozen:${route}`);}
if(errors.length){console.error('COMMUNITY PARITY FAIL',errors.slice(0,30),parity.metrics);process.exit(1)}
console.log(`COMMUNITY PARITY PASS: answers=${parity.metrics.community.answers} learn=${parity.metrics.community.learn} programmatic=${parity.metrics.community.programmatic} query_atlas=${parity.metrics.community.query_atlas} governed_routes=${expected.length}`);
