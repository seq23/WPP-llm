# Workflow Spine

This repo intentionally uses five workflows instead of one monolithic YAML:

1. `ci.yml` — hard build/validation gate.
2. `citation-ops.yml` — strategy-gated content/release maintenance.
3. `distribution.yml` — credential-safe IndexNow and Search Console distribution.
4. `credential-check.yml` — secret presence/shape checks without printing secrets.
5. `zero-cost-query-testing.yml` — $0 benchmark query panel and optional GSC reporting.

Do not add ad hoc workflows without registering the reason in `docs/runbooks/GITHUB_ACTIONS_OPERATING_SPINE.md`.
