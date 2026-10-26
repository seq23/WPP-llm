# VirtualAgency OS (WPP-llm) — working rules

This repository publishes `virtualagency-os.com`, the citation-velocity and
buyer-education layer operated for West Peek Productions. `REPO_IDENTITY.md` is the
identity record; `AGENTS.md` carries the Repo Operator bootstrap and the merge law.
Read both before changing anything here.

## Cost: nothing paid

**Nothing paid.** Every model call this repository makes goes through the free
router (`scripts/llm/free_router.js`) on $0 OpenRouter models, with
`policy.max_cost_usd` pinned to `0` and `policy.paid_fallback` pinned to `false`
in `config/llm_routing.json`. No scheduled workflow may carry a paid model, a
non-router model key, or a cost budget.

The one paid lane that still exists — `scripts/llm_citation_probe.mjs` — is
dispatch-only behind a `confirm_paid` input that defaults to `false`, and refuses
with a named stop otherwise. It never runs on a schedule.

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

## Proving a change

`npm run validate:all` is the full gate; `npm run validate:seo-hygiene` covers the
head, schema, redirect and measured-URL validators. Run the validators that cover
what you touched before you push, and say in the PR which ran.
