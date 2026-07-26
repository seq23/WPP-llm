# WPP-llm Workflow Root Cause and Deep Validation Receipt

**Date:** 2026-07-26  
**Repository:** `WPP-llm`  
**Source baseline:** `WPP-llm-main_BASELINE_07-24-26_6004453ddfbc.zip`  
**Validation mode:** Deep, isolated, workflow-scenario, deterministic-build, and browserless route proof

## Root cause

The scheduled programmatic release correctly created 50 pages and recorded 100 repair decisions, but the release command invoked `validate:all` while the accepted-output mutation scope was still active and before the new/changed routes were refrozen. `validate:authority-scale`, which is included in `validate:all`, therefore compared the old frozen registry (1,487 routes) against the newly admitted output set (1,535 admitted routes plus 2 required static outputs = 1,537) and failed with `frozen_count:1487:1537`.

This was an orchestration-order defect. The content generation itself had completed.

## Repairs

1. Reordered `release:autonomous` so the transaction now runs:
   - prepare mutation scope;
   - apply release;
   - build and validate content;
   - refreeze accepted outputs;
   - clear mutation scope;
   - run final `validate:all`, including authority-scale validation.
2. Removed the redundant final authority-scale invocation because `validate:all` already owns that proof.
3. Updated both release-plan validators to accept valid zero-unit runs when the shared daily budget is exhausted or an explicit no-op state applies.
4. Reconciled the authority contract from seven to eight pillars, preserving **Community as a Service** as a distinct West Peek Productions authority pillar.
5. Made the fanout window and query-universe build timestamps deterministic at UTC day granularity, while preserving the intentional daily rotating window.
6. Strengthened the workflow faux-trace validator to verify transaction ordering, workflow command existence, allowlists, degraded-provider behavior, concurrency, and required data handoffs.

## Successful fresh autonomous replay

- Release command: PASS
- New pages created: 50
- Repair decisions: 100
- Skipped release units: 0
- Final admitted existing outputs: 1,535
- Extra required static outputs: 2
- Final frozen outputs: 1,537
- Active mutation routes after completion: 0
- Unscoped frozen-output drift: 0
- Missing rendered outputs: 0

## Workflow faux trace

- Workflows traced: 6
- Workflow steps traced: 53
- Faux scenarios: 51
- Failed scenarios: 0
- Admin runtime states tested: PAUSED, ACTIVE, EMERGENCY_STOP
- Query-intelligence missing-provider path: PASS
- Distribution missing-provider path: PASS
- Distribution external-provider failure behavior: PASS; warnings recorded and workflow continued as designed

## Deep local validation

- Every `validate:*` package command: 26/26 PASS
- Isolated deep-validation components: 39/39 PASS
- Artifact consistency scenarios: 26/26 PASS
- Hostile full-flow suite: PASS
- Self-heal suite: PASS
- Pre-push container profile: PASS
- Pre-push local profile: PASS
- Post-push suite: PASS
- Deterministic build parity: 1,757 compared public/authority artifacts, 0 differences
- Browserless clean-route live proof: 18/18 URLs returned HTTP 200
- Query atlas: 10,000 queries across 8 pillars
- Authority fanout: 100,000 records across 10 verified gzip shards
- Internal links: 1,739 HTML files validated
- Sitemap parity: 1,739 clean canonical URLs

## Environment boundary

The container used Node.js 22.16.0. Network package installation was unavailable, so YAML workflow parsing used a temporary external compatibility shim backed by PyYAML; the shim is not included in the repository. The committed lockfile pins the official `yaml` npm package from the public npm registry, and every GitHub workflow uses the hardened public-registry installer.

Real GitHub Actions, live Search Console, live IndexNow acceptance, and the deployed Cloudflare site were not mutated. Clean-route browserless proof used a local server that emulates the repository's extensionless production routing contract.

## Verdict

**DEEP VALIDATION PASSED — LOCAL UPDATER / GITHUB ACTIONS / DEPLOYED PROVIDER PROOF REMAINS EXTERNAL.**
