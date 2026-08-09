# GitHub Actions Overhaul Report

Date: 2026-06-25
Status: STRUCTURALLY CHECKED — LOCAL VALIDATION REQUIRED

## Defect found

GitHub rejected `.github/workflows/auto_publish_insights.yml` because the shell heredoc terminator was not indented inside the YAML `run: |` block. That made GitHub parse `NODE` as YAML instead of shell.

## Hostile review conclusion

A one-line YAML fix was insufficient because the repo now performs hands-off release, SEO, citation, distribution, and query-testing work. A monolithic workflow would create a single failure point.

## Replacement Actions spine

1. `.github/workflows/ci.yml` — hard build and validation gate.
2. `.github/workflows/citation-ops.yml` — strategy-gated maintenance and artifact regeneration.
3. `.github/workflows/distribution.yml` — credential-safe IndexNow and Search Console distribution.
4. `.github/workflows/credential-check.yml` — secret presence/shape checks without printing secrets.
5. `.github/workflows/zero-cost-query-testing.yml` — $0 query packet and optional GSC performance pull.

## New scripts

- `scripts/validate_workflows.js`
- `scripts/check_github_action_credentials.js`
- `scripts/generate_zero_cost_query_report.js`
- `scripts/live_proof.js`
- `scripts/cleanup_release_artifacts.js`
- `distribution_scripts/gsc_query_performance.py`

## Package scripts added

- `npm run actions:validate`
- `npm run credentials:check`
- `npm run query:test:zero-cost`
- `npm run distribution:deploy`
- `npm run release:postpush`
- `npm run release:live-proof`
- `npm run release:cleanup`

## Query testing status

The $0 query-testing lane is now implemented as a repo-native system:

- `data/seo/benchmark_query_panel.json` contains the benchmark panel.
- `npm run query:test:zero-cost` generates the manual citation log packet.
- `zero-cost-query-testing.yml` runs monthly and manually.
- If GSC credentials exist, the workflow pulls Search Console query performance through the Search Console API.

This does not claim paid AI citation telemetry. ChatGPT/Perplexity/Gemini citation checks remain manual unless an external tool/API is later connected.

## Credential checks

Credential checks are not disavow upload or account setup. They verify whether GitHub Actions has enough secrets to run the automated lanes.

Checked secrets:

- `INDEXNOW_KEY`
- `GSC_SERVICE_ACCOUNT_JSON`
- `GSC_SITE_URL`

Checked variable:

- `PUBLIC_SITE_URL`

Missing credentials cause safe SKIP behavior for credential-bound steps. Repo defects still fail hard.

## Validation run

Passed in container:

- `npm ci --no-audit --no-fund`
- `npm run actions:validate`
- `npm run build`
- `npm run release:deep-validate:isolated`
- `npm run validate:all`
- `npm run query:test:zero-cost`
- `npm run release:prepush:container`
- `npm run release:postpush`
- shell syntax checks
- Python compile checks
- JSON parse checks

## Remaining external boundary

Actual live GitHub Actions execution must run after applying and pushing this ZIP. Actual GSC / IndexNow automation requires GitHub secrets.
