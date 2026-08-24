# Workflow Surface

1. `admin-command.yml` — authenticated allowlisted controls, pause/resume/emergency stop, and workflow dispatch.
2. `query-intelligence.yml` — twice-daily query discovery, normalization, scoring, and planning.
3. `programmatic-release.yml` — twice-daily full-flow create/repair/self-heal/validate/commit lane.
4. `ci.yml` — build and validation.
5. `distribution.yml` — provider-safe IndexNow/Search Console distribution after successful upstream runs.
6. `credential-check.yml` — provider readiness without secret disclosure.
7. `search-repair-retest.yml` — daily evidence-driven diagnosis, bounded repair, and delayed retest.

Writer workflows share concurrency, enforce runtime state, use the Node 24 action generation, and validate the exact candidate commit through the shared push helper before updating `main`.
