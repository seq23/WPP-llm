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

`npm run validate:zero-paid-llm` (in `ci.yml`) enforces it in code: it reads
`config/llm_routing.json`, every script and every workflow, and fails red on a
paid model, a direct provider call or a model key outside the free routes.

## Generated pages are not edited by hand

Published HTML under `answers/`, `learn/`, `pillars/`, `programmatic/` and
`insights/` is build output. Fix the generator, the template or the data file —
never the rendered page. `npm run build` reassembles the site; accepted pages are
hash-locked in `data/release/frozen_output_registry.json` and may only drift when
their route is listed in `data/release/active_mutation_scope.json`
(see `docs/` and `scripts/authority_scale/frozen_outputs.mjs`).

## What is served = committed HTML + the finish (2 Nov 2026)

- **The assembler finishes every page on deploy** (`scripts/lib/page_finish.js`,
  called by `scripts/assemble_pages_output.js`): one header, the "Get a production
  plan" box and sticky button, junk removed, byline and dates, visible FAQ,
  WebPage/Speakable schema, Cloudflare Web Analytics, and the accepted rewrite of
  the page body from `data/seo/page_rewrites/` (free router,
  `scripts/content/rewrite_kept_pages.js`, bar in `scripts/lib/rewrite_quality.js`).
  A refused rewrite makes the page noindex until a retry is accepted. Proof:
  `npm run test:page-finish` (reads the assembled site).
- **Inquiries go through `/go/plan`** (`go/plan.html`): counted by Web Analytics,
  then the West Peek Productions Google Form with source and service pre-filled.
- **The site is ~290 kept pages** (`data/seo/prune_ledger.json`, rule in
  `scripts/lib/prune.js`, re-plan with `npm run seo:plan-prune`). Every other
  /programmatic/, /query-atlas/, /topics/, off-topic /answers/, /insights/ and
  /learn/ page stays in the repo, is left out of the deploy and the sitemap, and
  redirects to its topic's strongest page: `update_redirects_clean_to_html.js`
  writes every redirect to `data/redirects/consolidation_map.json`, puts the
  highest-value ones in `_redirects` as 301s. `functions/_middleware.js` reads
  the complete generated map and answers every retired URL (clean, trailing
  slash or .html) with one HTTP 301 to its final kept page. The assembler omits
  retired HTML and publishes no refresh stubs. **Never put a splat,
  placeholder or 404 line in `_redirects`**: Pages counts every rule after the
  first dynamic one as dynamic and drops all past 100 (deploy log, 2 Nov 2026);
  static rules cap at 2,000. After a re-plan: link architecture
  and relink with `--write-scope`, `npm run build`, freeze, clear scope.
  Proof: `npm run test:prune` (every URL Google ever showed answers a page or one 301).
- **Recovery line**: `data/search_intelligence/daily_totals.json` (impressions and
  clicks per day, refreshed by the query-intelligence job).

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
