#!/usr/bin/env python3
"""Deterministic, non-mutating workflow scenario trace.

This does not call GitHub or external providers. It proves that each workflow's
control flow, npm commands, allowlists, degraded-provider behavior, and data
handoffs are internally coherent. Real workflow runs remain the live proof.
"""
from __future__ import annotations
import json
import pathlib
import re
import sys

R = pathlib.Path(__file__).resolve().parents[2]
W = R / '.github' / 'workflows'
P = json.loads((R / 'package.json').read_text())
SCRIPTS = P.get('scripts', {})
ERRORS: list[str] = []
TRACES: list[dict] = []

REQUIRED = {
    'admin-command.yml', 'ci.yml', 'credential-check.yml',
    'distribution.yml', 'programmatic-release.yml', 'query-intelligence.yml'
}


def require(cond: bool, msg: str) -> None:
    if not cond:
        ERRORS.append(msg)


def text(name: str) -> str:
    p = W / name
    require(p.exists(), f'missing workflow: {name}')
    return p.read_text() if p.exists() else ''


def trace(workflow: str, scenario: str, expected: str, passed: bool, detail: str = '') -> None:
    TRACES.append({
        'workflow': workflow,
        'scenario': scenario,
        'expected': expected,
        'passed': bool(passed),
        'detail': detail,
        'trace_only': True,
    })
    if not passed:
        ERRORS.append(f'{workflow}:{scenario}: {detail or expected}')


files = sorted(p.name for p in W.glob('*.yml'))
require(set(files) == REQUIRED, f'workflow set mismatch: {files}')

# Universal command/path checks.
for name in files:
    body = text(name)
    for cmd in re.findall(r'npm run ([A-Za-z0-9:_-]+)', body):
        require(cmd in SCRIPTS, f'{name}: missing npm script {cmd}')
    for path in re.findall(r'(?<![A-Za-z0-9_./-])((?:scripts|distribution_scripts)/[A-Za-z0-9_./-]+\.(?:js|mjs|py|sh))', body):
        require((R / path).exists(), f'{name}: missing referenced path {path}')
    require("registry-url: 'https://registry.npmjs.org'" in body, f'{name}: public npm registry not pinned')
    require('bash scripts/ci_npm_install.sh' in body, f'{name}: hardened npm install missing')

# Autonomous transaction ordering: validate content first, then refreeze and
# clear the scope, then run authority-scale-inclusive validate:all.
auto = SCRIPTS.get('release:autonomous', '')
order = [
    'authority:scale:prepare-scope', 'release:content', 'npm run build',
    'validate:release', 'authority:scale:freeze', 'authority:scale:clear-scope',
    'validate:all'
]
pos = [auto.find(x) for x in order]
trace('programmatic-release.yml', 'autonomous-transaction-order',
      'prepare -> mutate -> build -> validate release -> refreeze -> clear -> final validation',
      all(x >= 0 for x in pos) and pos == sorted(pos), str(dict(zip(order, pos))))
pre_clear = auto[:auto.find('authority:scale:clear-scope')] if 'authority:scale:clear-scope' in auto else auto
trace('programmatic-release.yml', 'no-authority-validation-while-thawed',
      'authority-scale validation cannot run before refreeze/clear',
      'validate:authority-scale' not in pre_clear and 'validate:all' not in pre_clear,
      'validate:authority-scale/validate:all found before clear-scope' if ('validate:authority-scale' in pre_clear or 'validate:all' in pre_clear) else 'clean')
trace('programmatic-release.yml', 'final-authority-proof',
      'validate:all runs after clear-scope and includes validate:authority-scale',
      'validate:all' in auto and 'validate:authority-scale' in SCRIPTS.get('validate:all', ''),
      SCRIPTS.get('validate:all', ''))

# Admin command scenarios.
admin = text('admin-command.yml')
admin_map = {
    'run_query_intelligence': 'query-intelligence.yml',
    'run_full_release': 'programmatic-release.yml',
    'run_distribution': 'distribution.yml',
    'run_validation': 'ci.yml',
    'check_credentials': 'credential-check.yml',
}
for action in ('pause', 'resume', 'emergency_stop', 'run_full_release'):
    trace('admin-command.yml', f'{action}-requires-confirmation', 'CONFIRM required',
          'pause|resume|emergency_stop|run_full_release' in admin and '[ "$CONFIRMATION" = "CONFIRM" ]' in admin)
for action, wf in admin_map.items():
    trace('admin-command.yml', f'dispatch-{action}', wf,
          action in admin and f'wf={wf}' in admin)
trace('admin-command.yml', 'reject-arbitrary-action', 'unknown actions exit 1',
      'Action not allowlisted' in admin and 'exit 1' in admin)
trace('admin-command.yml', 'runtime-state-receipt', 'state mutation is committed and receipt written',
      'runtime_control.json' in admin and 'artifacts/admin-receipts/latest.json' in admin)

# CI scenarios.
ci = text('ci.yml')
for event in ('push', 'pull_request', 'workflow_dispatch'):
    trace('ci.yml', event, 'actions validation + self heal',
          event in ci and 'npm run actions:validate' in ci and 'npm run release:self-heal' in ci)

# Credential workflow: missing credentials are a supported skip, not a failure.
cred = text('credential-check.yml')
cred_script = (R / 'scripts/check_github_action_credentials.js').read_text()
trace('credential-check.yml', 'manual', 'credential checker runs', 'npm run credentials:check' in cred)
trace('credential-check.yml', 'missing-provider', 'missing credentials produce SKIP states',
      'missing_skip_indexnow' in cred_script and 'missing_skip_gsc' in cred_script)
trace('credential-check.yml', 'no-secret-echo', 'secrets are not echoed',
      'never writes secret values' in cred_script and not re.search(r'echo\s+.*\$\{\{\s*secrets\.', cred))

# Distribution workflow scenarios.
dist = text('distribution.yml')
deploy = (R / 'distribution_scripts/deploy_distribution.sh').read_text()
trace('distribution.yml', 'workflow-success', 'runs after successful upstream workflow',
      "workflow_run.conclusion == 'success'" in dist)
trace('distribution.yml', 'workflow-failure', 'does not distribute after failed upstream workflow',
      "workflow_run.conclusion == 'success'" in dist and 'workflow_dispatch' in dist)
trace('distribution.yml', 'manual', 'manual dispatch allowed', 'workflow_dispatch' in dist)
trace('distribution.yml', 'missing-provider', 'provider steps skip or warn and continue',
      'credential_safe_best_effort' in deploy and 'SKIP: GSC' in deploy and 'SKIP: IndexNow' in deploy)
trace('distribution.yml', 'required-artifact-boundary', 'missing .build URL lists hard fail',
      'missing $PRIORITY_FILE' in deploy and 'missing $BATCH_FILE' in deploy)

# Programmatic workflow scenarios.
prog = text('programmatic-release.yml')
trace('programmatic-release.yml', 'scheduled-active', 'runtime guard gates release',
      'node scripts/runtime_guard.mjs' in prog and "steps.runtime.outputs.allowed == 'true'" in prog)
trace('programmatic-release.yml', 'manual-inputs', 'manual daily ceilings are passed to release',
      'github.event.inputs.max_new_pages' in prog and 'github.event.inputs.max_repairs' in prog)
trace('programmatic-release.yml', 'provider-degraded', 'missing GSC/Gemini does not block internal release',
      'GSC_SERVICE_ACCOUNT_JSON' in prog and 'GEMINI_API_KEY' in prog and 'npm run release:autonomous' in prog)
trace('programmatic-release.yml', 'no-changes', 'empty git status is a valid completion',
      'No programmatic release changes.' in prog)
trace('programmatic-release.yml', 'serialized-writes', 'writer workflows share one concurrency group',
      'group: wpp-autonomous-writer-main' in prog and 'cancel-in-progress: false' in prog)

# Query intelligence scenarios.
qi = text('query-intelligence.yml')
for cmd in ('query:atlas', 'signals:collect', 'opportunities:score', 'release:plan', 'validate:autonomous'):
    trace('query-intelligence.yml', f'command-{cmd}', f'npm run {cmd}', f'npm run {cmd}' in qi)
trace('query-intelligence.yml', 'missing-gsc', 'GSC collector may produce an empty/skip artifact',
      'GSC_SERVICE_ACCOUNT_JSON' in qi and 'gsc_collect_query_signals.py' in qi)
trace('query-intelligence.yml', 'missing-gemini', 'Gemini is optional',
      'GEMINI_API_KEY' in qi and 'signals:collect' in qi)
trace('query-intelligence.yml', 'no-signals', 'owned query universe still scores and plans',
      qi.find('query:atlas') < qi.find('signals:collect') < qi.find('opportunities:score') < qi.find('release:plan'))
trace('query-intelligence.yml', 'serialized-writes', 'shares writer concurrency group',
      'group: wpp-autonomous-writer-main' in qi)

# Required data handoffs used across the workflow spine.
required_data = [
    '_citation_intelligence_contract.json', '_content_release_contract.json',
    '_self_heal_contract.json', 'data/query_atlas/query_universe.json',
    'data/signals/normalized_records.json', 'data/opportunities/aeo_geo_opportunities.json',
    'data/releases/daily_release_plan.json', 'artifacts/release/apply_release_plan_summary.json',
    '.build/indexnow-priority.txt', '.build/indexnow-batch.txt',
    'data/release/accepted_output_freeze_contract.json',
    'data/release/frozen_output_registry.json'
]
for p in required_data:
    trace('workflow-spine', f'data:{p}', 'required handoff exists', (R / p).exists(), p)

out = R / 'artifacts/validation/workflow-faux-trace-all.json'
out.parent.mkdir(parents=True, exist_ok=True)
report = {
    'schema_version': '2.0',
    'workflow_count': len(files),
    'scenario_count': len(TRACES),
    'passed': sum(1 for x in TRACES if x['passed']),
    'failed': [x for x in TRACES if not x['passed']],
    'errors': ERRORS,
    'traces': TRACES,
}
out.write_text(json.dumps(report, indent=2) + '\n')
if ERRORS:
    print('Workflow faux trace failed:\n- ' + '\n- '.join(ERRORS))
    sys.exit(1)
print(f"Workflow faux trace OK: {len(files)} workflows, {len(TRACES)} scenarios")
