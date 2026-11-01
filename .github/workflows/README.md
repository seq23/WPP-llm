# Workflow Surface

1. `admin-command.yml` — authenticated allowlisted controls, pause/resume/emergency stop, and workflow dispatch.
2. `query-intelligence.yml` — twice-daily query discovery, normalization, scoring, and planning.
3. `search-loop.yml` — daily caller of the shared search growth engine (`seq23/search-loop@v1`, owner ruling 1 Nov 2026): finds easy searches, publishes gated pages straight away under `/questions/`, checks them at 2/4/8 weeks and 90 days, strengthens / undoes / merges, uploads the `search-loop-week` artifact. Post-build `.github/scripts/search_loop_post_build.sh`; push through `.github/scripts/search_loop_commit.sh` (exact-SHA push gate). Pause / emergency stop reach it through its runtime job.
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

| Workflow | Retired | GitHub state | Reason | Superseded by |
| --- | --- | --- | --- | --- |
| `programmatic-release.yml` (Programmatic Content Release, id 302395827) | 2026-11-01 | `disabled_manually` (2026-11-01) | Its new-page lane (2 a week, held until Search Console evidence) is replaced by the shared search loop, which publishes straight away (owner ruling 1 Nov 2026). Query intelligence and repair/retest of the existing library stay: the engine does not do them. | `search-loop.yml` |
| `auto_publish_insights.yml` (Citation Release Loop, id 231677534) | 2026-06-25, commit `924f9707` | `disabled_manually` (2026-09-05) | Unindented heredoc terminator inside a `run: \|` block made GitHub parse `NODE` as YAML; its last three runs are zero-job parse failures. Replaced by a spine split rather than a one-line fix. Its daily `git add -A` push to `main` carrying a production `INDEXNOW_KEY` was deliberately not restored. | `ci.yml`, `programmatic-release.yml`, `distribution.yml`, `credential-check.yml`, `query-intelligence.yml` |

Deleting the file left id 231677534 at `state: active` for 71 days. It was
disabled through the Actions API on 2026-09-05, so the retirement is now true at
GitHub rather than only in this repository, and the Actions UI no longer shows a
red lane with no owner.

The machine-readable ledger is `_workflow_liveness_contract.json`. It is enforced
by `npm run validate:workflow-liveness`, which hard-fails if a workflow GitHub
calls active has no file and no retirement entry, or if a scheduled lane has
produced no run inside its own cron window.
