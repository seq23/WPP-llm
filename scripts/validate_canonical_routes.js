#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DOMAIN = 'https://virtualagency-os.com';
const SKIP = new Set(['.git','node_modules','.build','logs','artifacts']);
function walk(dir,out=[]){
  for(const n of fs.readdirSync(dir)){
    if(SKIP.has(n)) continue;
    const f=path.join(dir,n); const s=fs.statSync(f);
    if(s.isDirectory()) walk(f,out); else if(n.endsWith('.html')) out.push(path.relative(ROOT,f).replace(/\\/g,'/'));
  }
  return out;
}
function cleanPath(rel){ if(rel==='index.html') return '/'; if(rel.endsWith('/index.html')) return '/' + rel.slice(0,-'index.html'.length); return '/' + rel.replace(/\.html$/,''); }
const redirects = fs.existsSync(path.join(ROOT,'_redirects')) ? fs.readFileSync(path.join(ROOT,'_redirects'),'utf8') : '';
const loopRules = redirects.split(/\r?\n/).filter(line => {
  const t=line.trim(); if(!t || t.startsWith('#')) return false;
  const parts=t.split(/\s+/); return parts[0] && parts[1] && !parts[0].endsWith('.html') && parts[1].endsWith('.html');
});
let bad=[];
if(loopRules.length) bad.push(`clean-to-html redirect loop risk: ${loopRules.slice(0,10).join(' | ')}`);
for(const rel of walk(ROOT)){
  const html=fs.readFileSync(path.join(ROOT,rel),'utf8');
  const can = html.match(/<link rel="canonical" href="([^"]+)"/);
  if(!can) { bad.push(`missing canonical ${rel}`); continue; }
  const expected = DOMAIN + cleanPath(rel);
  if(can[1] !== expected) bad.push(`canonical mismatch ${rel} -> ${can[1]} expected ${expected}`);
}
if(bad.length){ console.error('Canonical route validation failed:\n- '+bad.slice(0,80).join('\n- ')); process.exit(1); }
console.log('Canonical routes OK (clean URLs, no clean-to-html loop rules)');
