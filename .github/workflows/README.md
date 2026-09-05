# Workflow Surface

1. `admin-command.yml` — authenticated allowlisted controls, pause/resume/emergency stop, and workflow dispatch.
2. `query-intelligence.yml` — twice-daily query discovery, normalization, scoring, and planning.
3. `programmatic-release.yml` — twice-daily full-flow create/repair/self-heal/validate/commit lane.
4. `ci.yml` — build and validation.
5. `distribution.yml` — provider-safe IndexNow/Search Console distribution after successful upstream runs.
6. `credential-check.yml` — provider readiness without secret disclosure.
7. `search-repair-retest.yml` — daily evidence-driven diagnosis, bounded repair, and delayed retest.

Writer workflows share concurrency, enforce runtime state, use the Node 24 action generation, and validate the exact candidate commit through the shared push helper before updating `main`.

## Retired

Retirement is recorded, never silent. Deleting a workflow file does not delete
the workflow: GitHub keeps the record at `state: active`, frozen on its last
result, so a removed lane can sit red and unread indefinitely while nothing
alerts, because nothing runs.

| Workflow | Retired | Reason | Superseded by |
| --- | --- | --- | --- |
| `auto_publish_insights.yml` (Citation Release Loop, id 231677534) | 2026-06-25, commit `924f9707` | Unindented heredoc terminator inside a `run: \|` block made GitHub parse `NODE` as YAML; its last three runs are zero-job parse failures. Replaced by a spine split rather than a one-line fix. Its daily `git add -A` push to `main` carrying a production `INDEXNOW_KEY` was deliberately not restored. | `ci.yml`, `programmatic-release.yml`, `distribution.yml`, `credential-check.yml`, `query-intelligence.yml` |

The machine-readable ledger is `_workflow_liveness_contract.json`. It is enforced
by `npm run validate:workflow-liveness`, which hard-fails if a workflow GitHub
calls active has no file and no retirement entry, or if a scheduled lane has
produced no run inside its own cron window.
