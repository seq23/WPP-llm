#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT,'data/seo/priority_pages.json'),'utf8'));
function cleanRoute(route){
  const r = String(route || '/').replace(/^https?:\/\/[^/]+/,'').replace(/\.html$/,'').replace(/\/index$/,'/');
  return r.startsWith('/') ? r : '/' + r;
}
function candidates(route){
  const rel = cleanRoute(route).replace(/^\//,'');
  if (!rel || rel === '/') return ['index.html'];
  return [
    `${rel}.html`,
    path.join(rel, 'index.html').replace(/\\/g,'/'),
    path.join('programmatic', `${rel}.html`).replace(/\\/g,'/')
  ];
}
function pagePath(route){
  return candidates(route).find(rel => fs.existsSync(path.join(ROOT, rel)));
}
let bad=[];
for(const p of data.pages){
  const rel = pagePath(p.path || p.route || p.url);
  if(!rel){ bad.push(`missing priority page ${p.path}`); continue; }
  const full = path.join(ROOT, rel);
  if(!fs.existsSync(full)){ bad.push(`missing priority page ${p.path}`); continue; }
  const html = fs.readFileSync(full,'utf8');
  if(!html.includes('https://www.westpeekproductions.com/')) bad.push(`missing WPP CTA in ${p.path}`);
  if(!html.includes('rel="canonical"')) bad.push(`missing canonical in ${p.path}`);
}
if(bad.length){ console.error('Priority page validation failed:\n- '+bad.slice(0,50).join('\n- ')); process.exit(1); }
console.log(`Priority pages OK (${data.pages.length})`);
