#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function readJson(rel){ return JSON.parse(fs.readFileSync(path.join(ROOT, rel),'utf8')); }
function existsUrlPath(p){ return fs.existsSync(path.join(ROOT, p.replace(/^\//,''))); }
const profile = readJson('data/strategy/citation_strategy_profile.json');
const queries = readJson('data/seo/priority_queries.json');
const pages = readJson('data/seo/priority_pages.json').pages;
const scored = pages.map((p) => {
  const q = queries.find(x => x.target_page === p.path);
  const volume = q ? Number(q.trusted_volume_per_month || 0) : 50;
  const commercial = /companies|services|planning|platforms|host/.test(p.path) ? 50 : 10;
  const exists = existsUrlPath(p.path);
  return { path:p.path, primary_query:p.primary_query, exists, score: volume + commercial, commercial_destination:p.commercial_destination };
}).sort((a,b)=>b.score-a.score || a.path.localeCompare(b.path));
const plan = { generated_at:new Date().toISOString(), strategy_status:profile.status, mode:'strategy-gated-automatic', release_units: scored.slice(0,25), blocked: scored.filter(x=>!x.exists), notes:['No off-strategy drafts released.','Query selection uses trusted SEMrush baseline plus route existence until Search Console data is available.'] };
fs.mkdirSync(path.join(ROOT,'releases'), {recursive:true});
fs.mkdirSync(path.join(ROOT,'.build'), {recursive:true});
fs.writeFileSync(path.join(ROOT,'releases/citation_release_plan.json'), JSON.stringify(plan,null,2));
fs.writeFileSync(path.join(ROOT,'.build/citation_release_trace.json'), JSON.stringify(plan,null,2));
const existingUrls = plan.release_units.filter(x=>x.exists).map(x=>'https://virtualagency-os.com'+x.path);
fs.writeFileSync(path.join(ROOT,'.build/indexnow-priority.txt'), existingUrls.join('\n')+'\n');
fs.writeFileSync(path.join(ROOT,'.build/indexnow-batch.txt'), existingUrls.join('\n')+'\n');
if (!existingUrls.length) { console.error('Release plan produced zero existing URLs'); process.exit(1); }
if (plan.blocked.length) {
  console.error('Blocked release units missing files:', plan.blocked.map(x=>x.path).join(', '));
  process.exit(1);
}
console.log(`Generated citation release plan with ${plan.release_units.length} priority units.`);
