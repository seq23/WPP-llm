import fs from 'node:fs';
const bad=[];const p='admin/index.html';
if(!fs.existsSync(p)) bad.push('missing admin'); else {const s=fs.readFileSync(p,'utf8');for(const x of ['FULL FLOW ACTIVE','FULL_SAFE_AUTONOMY','github.com/seq23/WPP-llm/actions/workflows/admin-command.yml','No browser-side secrets','Emergency Stop'])if(!s.includes(x))bad.push('missing '+x)}
for(const x of ['data/admin/runtime_control.json','data/admin/system_health.json','data/admin/growth_health.json','data/admin/provider_health.json','data/admin/admin_action_registry.json','docs/operator/ADMIN_COMMAND_CENTER_RUNBOOK.md'])if(!fs.existsSync(x))bad.push('missing '+x);
const reg=JSON.parse(fs.readFileSync('data/admin/admin_action_registry.json','utf8'));if(reg.arbitrary_inputs_allowed!==false)bad.push('arbitrary inputs not prohibited');
if(bad.length){console.error('Admin command center failed:',bad);process.exit(1)}console.log(`Admin command center OK: GitHub-backed allowlisted operations (${reg.actions.length}), runtime controls, Growth Health, provider truth`);
