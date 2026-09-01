# GitHub Workflow Data Trace

Generated: 2026-09-01T10:43:54.860Z

Workflows: 8

## Required persistent data files
- PASS _citation_intelligence_contract.json
- PASS _content_release_contract.json
- PASS _self_heal_contract.json
- PASS data/query_atlas/query_universe.json
- PASS data/signals/normalized_records.json
- PASS data/opportunities/aeo_geo_opportunities.json
- PASS data/releases/daily_release_plan.json
- PASS artifacts/release/apply_release_plan_summary.json

## Runtime-generated data (excluded from baseline ZIP by contract)
- PRESENT .build/indexnow-priority.txt
- PRESENT .build/indexnow-batch.txt

## Step trace
- admin-command.yml :: command #1 :: actions/checkout@v6
- admin-command.yml :: command #2 :: actions/setup-node@v6
- admin-command.yml :: command #3 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- admin-command.yml :: command #4 :: Enforce confirmation
- admin-command.yml :: command #5 :: Apply runtime state command :: npm:actions:validate :: paths:.github/scripts/commit_and_push_if_changed.sh
- admin-command.yml :: command #6 :: Dispatch allowlisted workflow
- admin-command.yml :: command #7 :: Write action receipt
- ci.yml :: build_validate #1 :: actions/checkout@v6
- ci.yml :: build_validate #2 :: actions/setup-node@v6
- ci.yml :: build_validate #3 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- ci.yml :: build_validate #4 :: npm run actions:validate :: npm:actions:validate
- ci.yml :: build_validate #5 :: npm run validate:workflow-data-trace :: npm:validate:workflow-data-trace
- ci.yml :: build_validate #6 :: npm run validate:workflow-faux-trace :: npm:validate:workflow-faux-trace
- ci.yml :: build_validate #7 :: npm run test:push-helper :: npm:test:push-helper
- ci.yml :: build_validate #8 :: npm run test:citation-probe-rate :: npm:test:citation-probe-rate
- ci.yml :: build_validate #9 :: npm run test:retest-loop :: npm:test:retest-loop
- ci.yml :: build_validate #10 :: npm run release:self-heal :: npm:release:self-heal
- ci.yml :: build_validate #11 :: Cadence gate :: npm:validate:cadence-integrity
- credential-check.yml :: check #1 :: actions/checkout@v6
- credential-check.yml :: check #2 :: actions/setup-node@v6
- credential-check.yml :: check #3 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- credential-check.yml :: check #4 :: export INDEXNOW_KEY="${INDEXNOW_KEY_SECRET:-${INDEXNOW_KEY_VAR:-${INDEXNOW_KEY_SECRET_LOWE :: npm:credentials:check
- distribution.yml :: distribute #1 :: actions/checkout@v6
- distribution.yml :: distribute #2 :: actions/setup-node@v6
- distribution.yml :: distribute #3 :: actions/setup-python@v6
- distribution.yml :: distribute #4 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- distribution.yml :: distribute #5 :: python -m pip install --upgrade pip && python -m pip install google-api-python-client goog
- distribution.yml :: distribute #6 :: npm run release:self-heal :: npm:release:self-heal
- distribution.yml :: distribute #7 :: Recreate GSC credential file when configured
- distribution.yml :: distribute #8 :: Restore GSC inspection cache
- distribution.yml :: distribute #9 :: Run credential-safe distribution
- distribution.yml :: distribute #10 :: actions/upload-artifact@v7
- programmatic-release.yml :: release #1 :: actions/checkout@v6
- programmatic-release.yml :: release #2 :: actions/setup-node@v6
- programmatic-release.yml :: release #3 :: actions/setup-python@v6
- programmatic-release.yml :: release #4 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- programmatic-release.yml :: release #5 :: node scripts/runtime_guard.mjs
- programmatic-release.yml :: release #6 :: python -m pip install --upgrade pip && python -m pip install google-api-python-client goog
- programmatic-release.yml :: release #7 :: Sync latest main before autonomous release
- programmatic-release.yml :: release #8 :: Validate workflow syntax :: npm:actions:validate
- programmatic-release.yml :: release #9 :: Run GSC primary collector :: paths:distribution_scripts/gsc_collect_query_signals.py
- programmatic-release.yml :: release #10 :: Ingest measured Search Console queries as T1 atlas evidence :: npm:queries:ingest
- programmatic-release.yml :: release #11 :: Run controlled autonomous content release :: npm:release:autonomous
- programmatic-release.yml :: release #12 :: Commit generated pages and registries :: paths:.github/scripts/commit_and_push_if_changed.sh
- programmatic-release.yml :: release #13 :: actions/upload-artifact@v7
- query-intelligence.yml :: collect_score #1 :: actions/checkout@v6
- query-intelligence.yml :: collect_score #2 :: actions/setup-node@v6
- query-intelligence.yml :: collect_score #3 :: actions/setup-python@v6
- query-intelligence.yml :: collect_score #4 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- query-intelligence.yml :: collect_score #5 :: node scripts/runtime_guard.mjs
- query-intelligence.yml :: collect_score #6 :: python -m pip install --upgrade pip && python -m pip install google-api-python-client goog
- query-intelligence.yml :: collect_score #7 :: Sync latest main before writing artifacts
- query-intelligence.yml :: collect_score #8 :: Validate workflow syntax :: npm:actions:validate
- query-intelligence.yml :: collect_score #9 :: Generate owned query universe and public atlas :: npm:query:atlas
- query-intelligence.yml :: collect_score #10 :: Collect Search Console query signals :: paths:distribution_scripts/gsc_collect_query_signals.py
- query-intelligence.yml :: collect_score #11 :: Ingest measured Search Console queries as T1 atlas evidence :: npm:queries:ingest
- query-intelligence.yml :: collect_score #12 :: Collect normalized $0 signals including optional Gemini prompt panel :: npm:signals:collect
- query-intelligence.yml :: collect_score #13 :: Observe whether answer engines cite us :: npm:citation:probe
- query-intelligence.yml :: collect_score #14 :: Score AEO and GEO opportunities :: npm:opportunities:score
- query-intelligence.yml :: collect_score #15 :: Build controlled release plan preview :: npm:release:plan
- query-intelligence.yml :: collect_score #16 :: Validate query intelligence :: npm:validate:autonomous
- query-intelligence.yml :: collect_score #17 :: Commit query intelligence artifacts :: paths:.github/scripts/commit_and_push_if_changed.sh
- query-intelligence.yml :: collect_score #18 :: actions/upload-artifact@v7
- search-repair-retest.yml :: diagnose_repair_retest #1 :: actions/checkout@v6
- search-repair-retest.yml :: diagnose_repair_retest #2 :: actions/setup-node@v6
- search-repair-retest.yml :: diagnose_repair_retest #3 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- search-repair-retest.yml :: diagnose_repair_retest #4 :: node scripts/runtime_guard.mjs
- search-repair-retest.yml :: diagnose_repair_retest #5 :: Sync latest main before writing artifacts
- search-repair-retest.yml :: diagnose_repair_retest #6 :: Validate workflow syntax :: npm:actions:validate
- search-repair-retest.yml :: diagnose_repair_retest #7 :: Ingest any filled manual query-surface observation log :: npm:query:observe:ingest
- search-repair-retest.yml :: diagnose_repair_retest #8 :: Diagnose pages (evidence + technical) :: npm:repairs:diagnose
- search-repair-retest.yml :: diagnose_repair_retest #9 :: Apply bounded AUTO / AUTO_WATCH repairs (thaw, mutate, validate, refreeze) :: npm:repairs:apply
- search-repair-retest.yml :: diagnose_repair_retest #10 :: Sweep delayed retest queue for real evidence :: npm:repairs:retest
- search-repair-retest.yml :: diagnose_repair_retest #11 :: Commit search repair and retest artifacts :: paths:.github/scripts/commit_and_push_if_changed.sh
- search-repair-retest.yml :: diagnose_repair_retest #12 :: actions/upload-artifact@v7
- self-heal.yml :: self_heal #1 :: actions/checkout@v6
- self-heal.yml :: self_heal #2 :: actions/setup-node@v6
- self-heal.yml :: self_heal #3 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- self-heal.yml :: self_heal #4 :: node scripts/runtime_guard.mjs
- self-heal.yml :: self_heal #5 :: Sync latest main before writing repairs
- self-heal.yml :: self_heal #6 :: Validate workflow syntax :: npm:actions:validate
- self-heal.yml :: self_heal #7 :: Repair until clean :: npm:selfheal
- self-heal.yml :: self_heal #8 :: Commit only validated repair output :: paths:.github/scripts/commit_and_push_if_changed.sh
- self-heal.yml :: self_heal #9 :: actions/upload-artifact@v7

## Errors
- none
