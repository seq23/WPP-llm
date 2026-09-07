#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DOMAIN = 'https://virtualagency-os.com';
const SKIP = new Set(['.git','.pages-output', 'node_modules','.build','logs','artifacts']);
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
const pages = walk(ROOT);
for(const rel of pages){
  const html=fs.readFileSync(path.join(ROOT,rel),'utf8');
  const can = html.match(/<link rel="canonical" href="([^"]+)"/);
  if(!can) { bad.push(`missing canonical ${rel}`); continue; }
  const expected = DOMAIN + cleanPath(rel);
  if(can[1] !== expected) bad.push(`canonical mismatch ${rel} -> ${can[1]} expected ${expected}`);
}
if(bad.length){ console.error('Canonical route validation failed:\n- '+bad.slice(0,80).join('\n- ')); process.exit(1); }
// Zero-item floor. This gate walks a corpus that exists only because an earlier
// build stage produced it. If that stage is skipped, moved behind a gitignored
// dist/, or this runs before it, the walk finds nothing, reports no offenders and
// exits 0 - a gate incapable of failing, reporting green over an empty set. That
// is the defect class validate:workflow-liveness caught in itself on 2026-09-04.
// The floor makes "found nothing" loud instead of green.
const MIN_PAGES_EXPECTED = 100;
if (pages.length < MIN_PAGES_EXPECTED) {
  console.error(`CANONICAL ROUTES EXAMINED ONLY ${pages.length} PAGES (floor ${MIN_PAGES_EXPECTED}). A gate that examines nothing cannot fail, so this is reported as a failure rather than a pass. Check that the published HTML surface is present in this checkout and that this gate runs AFTER whatever produces it.`);
  process.exit(1);
}
console.log(`Canonical routes OK (${pages.length} pages; clean URLs, no clean-to-html loop rules)`);
