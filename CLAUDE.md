# VirtualAgency OS (WPP-llm) — working rules

This repository publishes `virtualagency-os.com`, the citation-velocity and
buyer-education layer operated for West Peek Productions. `REPO_IDENTITY.md` is the
identity record; `AGENTS.md` carries the Repo Operator bootstrap and the merge law.
Read both before changing anything here.

## Company brain

Read `~/Brains/west-peek.md` before any work (business facts, priorities, voice, settled decisions). New business facts go to the brain via Boss OS, not into this repo or memory. Repo how-tos stay in `docs/`.

## Cost: nothing paid

**Nothing paid.** Every model call this repository makes goes through the free
router (`scripts/llm/free_router.js`) on $0 OpenRouter models, with
`policy.max_cost_usd` pinned to `0` and `policy.paid_fallback` pinned to `false`
in `config/llm_routing.json`. No scheduled workflow may carry a paid model, a
non-router model key, or a cost budget.

The one paid lane that still exists — `scripts/llm_citation_probe.mjs` — is
dispatch-only behind a `confirm_paid` input that defaults to `false`, and refuses
with a named stop otherwise. It never runs on a schedule.

The shared search loop (`.github/workflows/search-loop.yml`, engine
`seq23/search-loop@v1`) is the other $0 route: its model lanes are free tiers only
(`max_cost_usd: 0`, no paid fallback, a non-zero `usage.cost` fails loud), and
`validate:zero-paid-llm` lets `OPENROUTER_API_KEY` reach only that pinned engine
or a free-router step.

`docs/cost/zero-paid-llm.md` is the full record: what used to be paid, what it
costs now, and why each lane is shaped the way it is.

`npm run validate:zero-paid-llm` reads this file, that document and
`config/llm_routing.json`, and fails red if any of the three stops saying it.
A rule no code reads is a wish, so the rule is pinned by that validator and the
validator runs in `ci.yml`.

## Generated pages are not edited by hand

Published HTML under `answers/`, `learn/`, `pillars/`, `programmatic/` and
`insights/` is build output. Fix the generator, the template or the data file —
never the rendered page. `npm run build` reassembles the site; accepted pages are
hash-locked in `data/release/frozen_output_registry.json` and may only drift when
their route is listed in `data/release/active_mutation_scope.json`
(see `docs/` and `scripts/authority_scale/frozen_outputs.mjs`).

## Search loop pages (`questions/`)

Pages under `questions/` are published by the shared search loop (owner ruling
1 Nov 2026: publish straight away, every page ends in an inquiry with West Peek
Productions). Change them through `search-loop.config.json` or the engine, never
by hand. `.github/scripts/search_loop_post_build.sh` folds them into the site
(build, CTA attribution, cadence record as `search_loop`); the weekly report is
the `search-loop-week` artifact of each Search Loop run, the ledger is
`data/search-loop/`.

## Proving a change

`npm run validate:all` is the full gate; `npm run validate:seo-hygiene` covers the
head, schema, redirect and measured-URL validators. Run the validators that cover
what you touched before you push, and say in the PR which ran.
