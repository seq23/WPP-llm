#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=path.resolve(__dirname,'../..');
const p=path.join(ROOT,'data/atoms/atom_registry.json'); if(!fs.existsSync(p)){console.error('Missing atom registry');process.exit(1);} const data=JSON.parse(fs.readFileSync(p,'utf8'));
const bad=[]; for(const a of data.atoms||[]){ for(const k of ['atom_id','atom_type','vertical','topic','canonical_text','source_ids','claim_ids','allowed_page_families','last_reviewed_at','risk_level','reuse_rules','forbidden_contexts']) if(!(k in a)) bad.push(`${a.atom_id||'unknown'} missing ${k}`); }
if(!(data.atoms||[]).length) bad.push('atom registry empty'); if(bad.length){console.error(bad.join('\n'));process.exit(1);} console.log(`Atom contract OK (${data.atoms.length} atoms)`);
