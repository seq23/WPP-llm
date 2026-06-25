#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=path.resolve(__dirname,'../..');
const p=path.join(ROOT,'data/content/page_admission_registry.json'); if(!fs.existsSync(p)){console.error('Missing page admission registry');process.exit(1);} const data=JSON.parse(fs.readFileSync(p,'utf8'));
const seen=new Set(), bad=[]; for(const a of data.admissions||[]){ if(!a.route||!a.query||!a.page_family||!a.status) bad.push(`bad admission ${JSON.stringify(a).slice(0,100)}`); if(a.route && seen.has(a.route+'|'+a.query)) bad.push(`duplicate admission ${a.route}`); seen.add(a.route+'|'+a.query); }
if(bad.length){console.error(bad.join('\n'));process.exit(1);} console.log(`Page admission OK (${(data.admissions||[]).length} records)`);
