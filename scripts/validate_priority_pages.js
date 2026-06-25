#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT,'data/seo/priority_pages.json'),'utf8'));
let bad=[];
for(const p of data.pages){
  const rel = p.path.replace(/^\//,'');
  const full = path.join(ROOT, rel);
  if(!fs.existsSync(full)){ bad.push(`missing priority page ${p.path}`); continue; }
  const html = fs.readFileSync(full,'utf8');
  if(!html.includes('https://www.westpeekproductions.com/')) bad.push(`missing WPP CTA in ${p.path}`);
  if(!html.includes('rel="canonical"')) bad.push(`missing canonical in ${p.path}`);
}
if(bad.length){ console.error('Priority page validation failed:\n- '+bad.slice(0,50).join('\n- ')); process.exit(1); }
console.log(`Priority pages OK (${data.pages.length})`);
