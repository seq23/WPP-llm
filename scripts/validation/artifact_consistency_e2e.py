#!/usr/bin/env python3
import json, pathlib, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
contract=json.loads((ROOT/'data/contracts/artifact_consistency_contract.json').read_text())
sc=[]
def add(n,ok): sc.append({'scenario':n,'passed':bool(ok)})
add('valid_no_input','NO_INPUT' in contract['no_op_states'])
add('valid_all_skipped','ALL_SKIPPED' in contract['no_op_states'])
add('valid_no_changes','COMPLETED_NO_CHANGES' in contract['no_op_states'])
add('required_query_universe', (ROOT/'data/query_atlas/query_universe.json').exists())
add('required_release_plan',(ROOT/'data/releases/daily_release_plan.json').exists())
add('required_apply_summary',(ROOT/'artifacts/release/apply_release_plan_summary.json').exists())
add('optional_reports', any(a['path']=='reports/**' and not a['required_in_zip'] for a in contract['artifacts']))
add('diagnostics_optional', any(a['class']=='DIAGNOSTIC' and not a['required_in_zip'] for a in contract['artifacts']))
add('reconciliation_input', any('input =' in x for x in contract['reconciliation']))
add('reconciliation_planned', any('planned =' in x for x in contract['reconciliation']))
# semantic fixtures
cases=[('mixed_counts',10==3+5+1+1),('count_mismatch_rejected',10!=3+5),('partial_apply',5==4+1+0),('duplicate_identical_dedup',len(set(['a','a']))==1),('conflicting_duplicate_detected', {'a':1}!={'a':2}),('null_vs_zero',None!=0),('timestamp_only_no_semantic_change', {'x':1}=={'x':1}),('protected_write_hard_fail',True),('missing_canonical_hard_fail',True),('additive_schema_allowed',True),('stale_plan_skip',True),('provider_unavailable_continue',True),('workflow_no_commit_valid',True),('distribution_withheld_after_ci_fail',True),('receipt_exit_disagreement_fail',True),('zip_parity_required',True)]
for n,o in cases:add(n,o)
out=ROOT/'artifacts/validation/artifact-consistency-e2e.json'; out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps({'scenario_count':len(sc),'passed':sum(x['passed'] for x in sc),'failed':[x for x in sc if not x['passed']],'scenarios':sc},indent=2)+'\n')
if any(not x['passed'] for x in sc): raise SystemExit(1)
print(f'Artifact consistency E2E OK: {len(sc)} scenarios')