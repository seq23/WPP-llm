#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const ROOT = path.resolve(__dirname, '../..');
const outDir = path.join(ROOT, 'logs', 'workflow-data-trace');
fs.mkdirSync(outDir, { recursive: true });
function exists(p){ return fs.existsSync(path.join(ROOT,p)); }
function read(p){ return fs.readFileSync(path.join(ROOT,p),'utf8'); }
function pkgScripts(){ return JSON.parse(read('package.json')).scripts || {}; }
function flattenSteps(jobs){ const out=[]; for (const [jobId, job] of Object.entries(jobs||{})) for (const [idx, step] of (job.steps||[]).entries()) out.push({jobId, idx:idx+1, step}); return out; }
function npmScriptName(cmd){ const m = String(cmd).match(/npm\s+run\s+([A-Za-z0-9:_-]+)/); return m && m[1]; }
function directPaths(cmd){
  const s = String(cmd || ''); const paths=[];
  for (const re of [/python(?:3)?\s+([A-Za-z0-9_./-]+\.py)/g, /bash\s+([A-Za-z0-9_./-]+\.sh)/g, /(^|\s)([A-Za-z0-9_./-]+\.sh)(\s|$)/g, /node\s+([A-Za-z0-9_./-]+\.js)/g]) {
    let m; while ((m = re.exec(s))) paths.push(m[1] || m[2]);
  }
  return [...new Set(paths.map(p => String(p || '').trim()).filter(Boolean).filter(p => !p.startsWith('-')) )];
}
const scripts = pkgScripts();
const wfDir = path.join(ROOT,'.github','workflows');
const files = fs.readdirSync(wfDir).filter(f=>/\.ya?ml$/.test(f)).sort();
const docs = {}; const names = {}; const errors=[]; const traces=[];
const lockText = exists('package-lock.json') ? read('package-lock.json') : '';
if (/packages\.applied-caas|artifactory\/api\/npm|internal\.api\.openai/.test(lockText)) errors.push('package-lock.json contains internal/proxy npm registry URL');
if (!exists('.npmrc')) errors.push('missing .npmrc');
else if (!read('.npmrc').includes('registry=https://registry.npmjs.org/')) errors.push('.npmrc does not force public npm registry');
if (!exists('scripts/ci_npm_install.sh')) errors.push('missing scripts/ci_npm_install.sh hardened installer');

for (const file of files) {
  const text = read(path.join('.github','workflows',file));
  let doc; try { doc = YAML.parse(text); } catch(e) { errors.push(`${file}: YAML parse failed: ${e.message}`); continue; }
  docs[file]=doc; names[doc.name]=file;
  if (text.includes('clean-to-html')) errors.push(`${file}: references stale clean-to-html policy`);
  if (/^NODE\s*$/m.test(text) || /^PY\s*$/m.test(text)) errors.push(`${file}: heredoc terminator at column 1`);
  for (const {jobId, idx, step} of flattenSteps(doc.jobs)) {
    const run = step.run || '';
    const npm = npmScriptName(run);
    if (npm && !scripts[npm]) errors.push(`${file}:${jobId}:${idx} calls missing npm script ${npm}`);
    for (const p of directPaths(run)) {
      if (p.includes('distribution_scripts/indexnow_submit.sh') && !run.includes('bash distribution_scripts/indexnow_submit.sh')) errors.push(`${file}:${jobId}:${idx} invokes indexnow_submit.sh without bash`);
      if (!exists(p)) errors.push(`${file}:${jobId}:${idx} references missing path ${p}`);
      if (String(run).includes('npm ci') && !String(run).includes('ci_npm_install.sh')) errors.push(`${file}:${jobId}:${idx} uses raw npm ci instead of hardened installer`);
      if (p.endsWith('.sh')) {
        const st = fs.statSync(path.join(ROOT,p));
        if (!(st.mode & 0o111) && !run.includes(`bash ${p}`)) errors.push(`${file}:${jobId}:${idx} references non-executable shell script ${p}`);
      }
    }
    traces.push({workflow:file, workflow_name:doc.name, job:jobId, step:idx, name:step.name || step.uses || run.split('\n')[0].slice(0,90), npm_script:npm || null, direct_paths:directPaths(run), env_keys:Object.keys(step.env||{})});
  }
}
for (const [file, doc] of Object.entries(docs)) {
  const wr = doc.on?.workflow_run;
  if (wr) {
    const arr = Array.isArray(wr.workflows) ? wr.workflows : [wr.workflows].filter(Boolean);
    for (const n of arr) if (!names[n]) errors.push(`${file}: workflow_run references missing workflow name ${n}`);
  }
}
for (const file of files) {
  const text = read(path.join('.github','workflows',file));
  if (!text.includes("registry-url: 'https://registry.npmjs.org'")) errors.push(`${file}: setup-node missing public registry-url`);
  if (!text.includes('bash scripts/ci_npm_install.sh')) errors.push(`${file}: missing hardened npm install step`);
}
if (exists('.github/workflows/distribution.yml')) {
  const distributionText = read('.github/workflows/distribution.yml');
  if (!distributionText.includes('INDEXNOW_KEY_VAR') || !distributionText.includes('indexnow_key')) errors.push('distribution.yml missing IndexNow secret/variable fallback wiring');
}
const requiredData = ['_citation_intelligence_contract.json','_content_release_contract.json','_self_heal_contract.json','data/query_atlas/query_universe.json','data/signals/normalized_records.json','data/opportunities/aeo_geo_opportunities.json','data/releases/daily_release_plan.json','artifacts/release/apply_release_plan_summary.json','.build/indexnow-priority.txt','.build/indexnow-batch.txt'];
const missing = requiredData.filter(p=>!exists(p));
if (missing.length) errors.push('missing workflow data trace files: '+missing.join(', '));
const flowRequirements = [
  ['ci.yml','release:self-heal'],
  ['query-intelligence.yml','query:atlas'],
  ['query-intelligence.yml','opportunities:score'],
  ['query-intelligence.yml','release:plan'],
  ['programmatic-release.yml','release:autonomous'],
  ['distribution.yml','release:self-heal'],
  ['credential-check.yml','credentials:check']
];
for (const [file, script] of flowRequirements) {
  const text = exists(path.join('.github','workflows',file)) ? read(path.join('.github','workflows',file)) : '';
  if (!text.includes(`npm run ${script}`)) errors.push(`${file}: missing data-flow step npm run ${script}`);
}
const report = {generated_at:new Date().toISOString(), workflow_count:files.length, workflows:files, traces, required_data:requiredData.map(p=>({path:p, exists:exists(p)})), errors};
fs.writeFileSync(path.join(outDir,'workflow_data_trace_report.json'), JSON.stringify(report,null,2));
const md = ['# GitHub Workflow Data Trace', '', `Generated: ${report.generated_at}`, '', `Workflows: ${files.length}`, '', '## Required data files', ...report.required_data.map(x=>`- ${x.exists?'PASS':'FAIL'} ${x.path}`), '', '## Step trace', ...traces.map(t=>`- ${t.workflow} :: ${t.job} #${t.step} :: ${t.name}${t.npm_script?` :: npm:${t.npm_script}`:''}${t.direct_paths.length?` :: paths:${t.direct_paths.join(',')}`:''}`), '', '## Errors', ...(errors.length?errors.map(e=>`- ${e}`):['- none'])].join('\n');
fs.writeFileSync(path.join(outDir,'workflow_data_trace_report.md'), md+'\n');
if (errors.length) { console.error('Workflow data trace failed:\n- '+errors.join('\n- ')); process.exit(1); }
console.log(`Workflow data trace OK (${files.length} workflows, ${traces.length} traced steps)`);
