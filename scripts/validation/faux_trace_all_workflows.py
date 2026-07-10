#!/usr/bin/env python3
import pathlib,json,re,sys
try: import yaml
except Exception: yaml=None
R=pathlib.Path(__file__).resolve().parents[2]; W=R/'.github/workflows'; errs=[]; traces=[]
scenarios={'admin-command.yml':['pause-confirmed','pause-unconfirmed','resume-confirmed','emergency-stop','run-query','run-release-confirmed','run-distribution','reject-arbitrary-action'],'ci.yml':['push','pull_request','manual'],'credential-check.yml':['manual'],'distribution.yml':['workflow-success','workflow-failure','missing-provider'],'programmatic-release.yml':['manual','scheduled-active','no-input','all-skipped','no-changes','provider-degraded'],'query-intelligence.yml':['manual','scheduled-active','missing-gsc','missing-gemini','no-signals']}
pkg=json.loads((R/'package.json').read_text()).get('scripts',{})
for f in sorted(W.glob('*.yml')):
 text=f.read_text();
 if yaml:
  try: doc=yaml.safe_load(text)
  except Exception as e: errs.append(f'{f.name}: yaml {e}'); doc={}
 else: doc={}
 for cmd in re.findall(r'npm run ([A-Za-z0-9:_-]+)',text):
  if cmd not in pkg: errs.append(f'{f.name}: missing npm script {cmd}')
 for s in scenarios.get(f.name,['default']): traces.append({'workflow':f.name,'scenario':s,'trace_only':True})
out=R/'artifacts/validation/workflow-faux-trace-all.json'; out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps({'workflow_count':len(list(W.glob('*.yml'))),'scenario_count':len(traces),'errors':errs,'traces':traces},indent=2)+'\n')
if errs: print('\n'.join(errs));sys.exit(1)
print(f"Workflow faux trace OK: {len(list(W.glob('*.yml')))} workflows, {len(traces)} scenarios")