#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
const redirects = fs.readFileSync(path.join(ROOT,'_redirects'),'utf8');
const SKIP = new Set(['.git','node_modules','.build','releases']);
function walk(dir,out=[]){ for(const n of fs.readdirSync(dir)){ if(SKIP.has(n)) continue; const f=path.join(dir,n); const s=fs.statSync(f); if(s.isDirectory()) walk(f,out); else if(n.endsWith('.html')) out.push(path.relative(ROOT,f).replace(/\\/g,'/')); } return out; }
let bad=[];
for(const rel of walk(ROOT)){
  const html=fs.readFileSync(path.join(ROOT,rel),'utf8');
  const can = html.match(/<link rel="canonical" href="([^"]+)"/);
  if(!can) { bad.push(`missing canonical ${rel}`); continue; }
  if(rel !== 'index.html' && !can[1].endsWith('/'+rel)) bad.push(`canonical mismatch ${rel} -> ${can[1]}`);
  if(rel !== 'index.html' && !rel.endsWith('/index.html')) {
    const clean='/' + rel.replace(/\.html$/,''); const target='/' + rel;
    if(!redirects.includes(`${clean} ${target} 301`)) bad.push(`missing clean redirect ${clean} -> ${target}`);
  }
}
if(bad.length){ console.error('Canonical route validation failed:\n- '+bad.slice(0,80).join('\n- ')); process.exit(1); }
console.log('Canonical routes OK');
