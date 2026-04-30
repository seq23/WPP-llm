#!/usr/bin/env node
const fs=require('fs'); const path=require('path'); const root=path.resolve(__dirname,'..');
const idx=JSON.parse(fs.readFileSync(path.join(root,'data/answers/answers-index.json'),'utf8'));
let bad=[]; for (const a of idx){ for (const k of ['id','query','direct_answer','entity','canonical_page','json_url','primary_cta']) if(!a[k]) bad.push(`${a.id||'unknown'} missing ${k}`); for (const p of [a.canonical_page,a.json_url]) if(!fs.existsSync(path.join(root,p))) bad.push(`${a.id} missing file ${p}`); if(a.direct_answer.length<80) bad.push(`${a.id} direct answer too short`);}
for (const f of ['llms-answers.txt','llms-entities.txt','llms-services.txt','llms-full.txt']) if(!fs.existsSync(path.join(root,f))) bad.push(`missing ${f}`);
if(bad.length){ console.error('ANSWER COVERAGE FAILED'); bad.forEach(x=>console.error('-',x)); process.exit(1);}
console.log(`Answer coverage OK: ${idx.length} answer cards`);
