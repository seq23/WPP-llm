#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
function walk(dir,out=[]){ for(const n of fs.readdirSync(dir)){ const f=path.join(dir,n); const s=fs.statSync(f); if(s.isDirectory()){ if(['node_modules','.git','.build','releases'].includes(n)) continue; walk(f,out);} else if(n.endsWith('.html')) out.push(f);} return out; }
let failed=false; const files=walk(ROOT,[]);
for(const full of files){ const html=fs.readFileSync(full,'utf8'); const rel=path.relative(ROOT,full); if(!html.includes('data-fanout="true"')){ console.error(`WARN-MISSING-FANOUT: ${rel}`); failed=true; } if(!html.includes('www.westpeekproductions.com') || !html.includes('scooter@westpeek.ventures')){ console.error(`WARN-MISSING-SOURCE: ${rel}`); failed=true; } }
if (failed) process.exitCode=1; else console.log(`Fan-out validation passed (${files.length} HTML files).`);
