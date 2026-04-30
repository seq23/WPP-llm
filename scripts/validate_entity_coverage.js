#!/usr/bin/env node
const fs=require('fs'); const path=require('path'); const root=path.resolve(__dirname,'..');
const ents=JSON.parse(fs.readFileSync(path.join(root,'data/entities/entities.json'),'utf8')).entities;
const terms=JSON.parse(fs.readFileSync(path.join(root,'data/language/canonical_terms.json'),'utf8')).terms;
let bad=[]; if(!ents.length) bad.push('no entities'); if(ents.length!==terms.length) bad.push('entity/term count mismatch');
for(const e of ents){ if(!e.name||!e.definition||!e.category||!e.canonical_answer) bad.push(`bad entity ${e.id}`);}
if(bad.length){ console.error('ENTITY COVERAGE FAILED'); bad.forEach(x=>console.error('-',x)); process.exit(1);}
console.log(`Entity coverage OK: ${ents.length} entities`);
