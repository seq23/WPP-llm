#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=path.resolve(__dirname,'..');
const u=JSON.parse(fs.readFileSync(path.join(ROOT,'data/query_atlas/query_universe.json'),'utf8')); const bad=[];
if((u.queries||[]).length < 900) bad.push(`query universe too small: ${(u.queries||[]).length}`);
if(!fs.existsSync(path.join(ROOT,'query-atlas.html'))) bad.push('missing query-atlas.html');
const clusters=new Set((u.queries||[]).map(q=>q.cluster)); for(const c of clusters) if(!fs.existsSync(path.join(ROOT,'query-atlas',`${c}.html`))) bad.push(`missing cluster page ${c}`);
if(bad.length){console.error(bad.slice(0,80).join('\n'));process.exit(1);} console.log(`Query atlas OK (${u.queries.length} queries, ${clusters.size} clusters)`);
