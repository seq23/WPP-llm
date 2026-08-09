#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'ARTIFACT_MANIFEST.json');
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
manifest.github_actions_spine='generated_from_.github/workflows';
manifest.workflow_files=fs.readdirSync(path.join(root,'.github/workflows')).filter(f=>/\.ya?ml$/.test(f)).sort();
manifest.included_reports=[
  'docs/receipts/archive/GITHUB_ACTIONS_OVERHAUL_REPORT.md',
  'docs/receipts/archive/HOSTILE_REVIEW_FIX_REPORT.md',
  'docs/receipts/archive/MASTER_PLAN_COMPLETION_CHECKLIST.md',
  'docs/receipts/archive/GITHUB_ACTIONS_RUNTIME_FIX_REPORT.md',
  'docs/receipts/archive/PROGRAMMATIC_CADENCE_REPAIR_REPORT.md',
  'docs/receipts/archive/EXECUTION_REPORT.md'
].filter(p=>fs.existsSync(path.join(root,p)));
if(manifest.runtime_fix) manifest.runtime_fix.report='docs/receipts/archive/GITHUB_ACTIONS_RUNTIME_FIX_REPORT.md';
manifest.content_quality={
  report:'data/content/programmatic_quality_report.json',
  remediation_manifest:'data/content/programmatic_remediation_manifest.json',
  policy:'new pages preflight substance+similarity before write; legacy quality debt repaired in bounded batches'
};
fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
console.log(`Artifact manifest refreshed: workflows=${manifest.workflow_files.length} reports=${manifest.included_reports.length}`);
