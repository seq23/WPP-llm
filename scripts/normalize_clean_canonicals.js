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
    if(s.isDirectory()) walk(f,out); else if(n.endsWith('.html')) out.push(f);
  }
  return out;
}
function cleanPath(rel){
  rel = rel.replace(/\\/g,'/');
  if(rel === 'index.html') return '/';
  if(rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel.replace(/\.html$/,'');
}
function cleanHref(href, existing){
  if (!href || /^(https?:|mailto:|tel:|#|javascript:|\/\/)/i.test(href)) return href;
  if (/\.(css|js|json|txt|jpg|jpeg|png|gif|webp|svg|ico|xml)$/i.test(href)) return href;
  let base=href, frag='', query='';
  if (base.includes('#')) { const parts=base.split('#'); base=parts.shift(); frag='#'+parts.join('#'); }
  if (base.includes('?')) { const parts=base.split('?'); base=parts.shift(); query='?'+parts.join('?'); }
  if (!base) return href;
  if (base.startsWith('/')) {
    let rel=base.slice(1);
    if (rel==='index.html') return '/' + query + frag;
    if (rel.endsWith('/index.html')) return '/' + rel.slice(0,-'index.html'.length) + query + frag;
    if (rel.endsWith('.html') && existing.has(rel)) return '/' + rel.slice(0,-5) + query + frag;
  } else {
    if (base==='index.html') return '/' + query + frag;
    if (base.endsWith('/index.html') && existing.has(base)) return '/' + base.slice(0,-'index.html'.length) + query + frag;
    if (base.endsWith('.html') && existing.has(base)) return '/' + base.slice(0,-5) + query + frag;
  }
  return href;
}
const files=walk(ROOT);
const existing=new Set(files.map(f=>path.relative(ROOT,f).replace(/\\/g,'/')));
let changed=0;
for(const f of files){
  const rel=path.relative(ROOT,f).replace(/\\/g,'/');
  let s=fs.readFileSync(f,'utf8');
  const before=s;
  const canonical=DOMAIN + cleanPath(rel);
  if (s.match(/<link rel="canonical" href="[^"]+"/)) s=s.replace(/<link rel="canonical" href="[^"]+"/g, `<link rel="canonical" href="${canonical}"`);
  else s=s.replace(/<meta name="description" content="[^"]*">/, m => `${m}\n  <link rel="canonical" href="${canonical}">`);
  s=s.replace(/<meta property="og:url" content="[^"]+"/g, `<meta property="og:url" content="${canonical}"`);
  s=s.replace(/href="([^"]+)"/g, (_,href)=>`href="${cleanHref(href, existing)}"`);
  if(s!==before){fs.writeFileSync(f,s); changed++;}
}
console.log(`Normalized clean canonical URLs and internal HTML links in ${changed} files.`);
