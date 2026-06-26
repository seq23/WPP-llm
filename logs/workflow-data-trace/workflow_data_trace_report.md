# GitHub Workflow Data Trace

Generated: 2026-06-26T15:28:08.844Z

Workflows: 5

## Required data files
- PASS _citation_intelligence_contract.json
- PASS _content_release_contract.json
- PASS _self_heal_contract.json
- PASS data/query_atlas/query_universe.json
- PASS data/signals/normalized_records.json
- PASS data/opportunities/aeo_geo_opportunities.json
- PASS data/releases/daily_release_plan.json
- PASS artifacts/release/apply_release_plan_summary.json
- PASS .build/indexnow-priority.txt
- PASS .build/indexnow-batch.txt

## Step trace
- ci.yml :: build_validate #1 :: actions/checkout@v4
- ci.yml :: build_validate #2 :: actions/setup-node@v4
- ci.yml :: build_validate #3 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- ci.yml :: build_validate #4 :: npm run actions:validate :: npm:actions:validate
- ci.yml :: build_validate #5 :: npm run release:self-heal :: npm:release:self-heal
- credential-check.yml :: check #1 :: actions/checkout@v4
- credential-check.yml :: check #2 :: actions/setup-node@v4
- credential-check.yml :: check #3 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- credential-check.yml :: check #4 :: export INDEXNOW_KEY="${INDEXNOW_KEY_SECRET:-${INDEXNOW_KEY_VAR:-${INDEXNOW_KEY_SECRET_LOWE :: npm:credentials:check
- distribution.yml :: distribute #1 :: actions/checkout@v4
- distribution.yml :: distribute #2 :: actions/setup-node@v4
- distribution.yml :: distribute #3 :: actions/setup-python@v5
- distribution.yml :: distribute #4 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- distribution.yml :: distribute #5 :: python -m pip install --upgrade pip && python -m pip install google-api-python-client goog
- distribution.yml :: distribute #6 :: npm run release:self-heal :: npm:release:self-heal
- distribution.yml :: distribute #7 :: Recreate GSC credential file when configured
- distribution.yml :: distribute #8 :: Run credential-safe distribution
- distribution.yml :: distribute #9 :: actions/upload-artifact@v4
- programmatic-release.yml :: release #1 :: actions/checkout@v4
- programmatic-release.yml :: release #2 :: actions/setup-node@v4
- programmatic-release.yml :: release #3 :: actions/setup-python@v5
- programmatic-release.yml :: release #4 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- programmatic-release.yml :: release #5 :: python -m pip install --upgrade pip && python -m pip install google-api-python-client goog
- programmatic-release.yml :: release #6 :: Sync latest main before autonomous release
- programmatic-release.yml :: release #7 :: Validate workflow syntax :: npm:actions:validate
- programmatic-release.yml :: release #8 :: Run GSC primary collector :: paths:distribution_scripts/gsc_collect_query_signals.py
- programmatic-release.yml :: release #9 :: Run controlled autonomous content release :: npm:release:autonomous
- programmatic-release.yml :: release #10 :: Commit generated pages and registries
- programmatic-release.yml :: release #11 :: actions/upload-artifact@v4
- query-intelligence.yml :: collect_score #1 :: actions/checkout@v4
- query-intelligence.yml :: collect_score #2 :: actions/setup-node@v4
- query-intelligence.yml :: collect_score #3 :: actions/setup-python@v5
- query-intelligence.yml :: collect_score #4 :: bash scripts/ci_npm_install.sh :: paths:scripts/ci_npm_install.sh
- query-intelligence.yml :: collect_score #5 :: python -m pip install --upgrade pip && python -m pip install google-api-python-client goog
- query-intelligence.yml :: collect_score #6 :: Sync latest main before writing artifacts
- query-intelligence.yml :: collect_score #7 :: Validate workflow syntax :: npm:actions:validate
- query-intelligence.yml :: collect_score #8 :: Generate owned query universe and public atlas :: npm:query:atlas
- query-intelligence.yml :: collect_score #9 :: Collect Search Console query signals :: paths:distribution_scripts/gsc_collect_query_signals.py
- query-intelligence.yml :: collect_score #10 :: Collect normalized $0 signals including optional Gemini prompt panel :: npm:signals:collect
- query-intelligence.yml :: collect_score #11 :: Score AEO and GEO opportunities :: npm:opportunities:score
- query-intelligence.yml :: collect_score #12 :: Build controlled release plan preview :: npm:release:plan
- query-intelligence.yml :: collect_score #13 :: Validate query intelligence :: npm:validate:autonomous
- query-intelligence.yml :: collect_score #14 :: Commit query intelligence artifacts
- query-intelligence.yml :: collect_score #15 :: actions/upload-artifact@v4

## Errors
- none
