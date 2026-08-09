#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const root=path.resolve(__dirname,'..');
const m=JSON.parse(fs.readFileSync(path.join(root,'ARTIFACT_MANIFEST.json'),'utf8'));
const actual=fs.readdirSync(path.join(root,'.github/workflows')).filter(f=>/\.ya?ml$/.test(f)).sort();
const declared=[...(m.workflow_files||[])].sort();
if(JSON.stringify(actual)!==JSON.stringify(declared)){console.error(`artifact manifest workflow drift: declared=${declared.join(',')} actual=${actual.join(',')}`);process.exit(1)}
for(const r of m.included_reports||[]) if(!fs.existsSync(path.join(root,r))){console.error(`artifact manifest missing report ${r}`);process.exit(1)}
if(!m.content_quality?.report||!fs.existsSync(path.join(root,m.content_quality.report))){console.error('artifact manifest missing programmatic quality report');process.exit(1)}
console.log(`Artifact manifest OK workflows=${actual.length} reports=${(m.included_reports||[]).length}`);
