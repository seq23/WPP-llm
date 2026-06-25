#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
const files=['seo/disavow/virtualagency-os-disavow.txt','seo/disavow/westpeekproductions-disavow.txt','data/seo/backlink_remediation_ledger.json','data/seo/earned_citation_targets.json'];
let bad=[];
for(const rel of files){ if(!fs.existsSync(path.join(ROOT,rel))) bad.push(`missing ${rel}`); }
for(const rel of files.filter(f=>f.endsWith('.txt'))){
  const s = fs.existsSync(path.join(ROOT,rel)) ? fs.readFileSync(path.join(ROOT,rel),'utf8') : '';
  for(const d of ['fiverr-seo-for-business-growth.site','fiverr-seo-for-small-businesses.site','buzzshrink.website']) if(!s.includes(`domain:${d}`)) bad.push(`${rel} missing domain:${d}`);
}
const earned = fs.existsSync(path.join(ROOT,'data/seo/earned_citation_targets.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT,'data/seo/earned_citation_targets.json'),'utf8')) : {};
if((earned.existing_citations||[]).length < 7) bad.push('earned citation ledger must include 7 existing citations');
if((earned.net_new_targets||[]).length < 5) bad.push('earned citation ledger must include 5 net-new targets');
if(bad.length){ console.error('Backlink remediation validation failed:\n- '+bad.join('\n- ')); process.exit(1); }
console.log('Backlink remediation packet OK');
