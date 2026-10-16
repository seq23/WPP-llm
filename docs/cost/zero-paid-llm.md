# Zero paid LLM calls

Owner instruction, 11 Oct 2026: "nothing should be paid … cut the probes and make them free."

## What was paid, and what it is now

| Call site | Ran | Model / provider | What it did | Now |
|---|---|---|---|---|
| `scripts/llm_citation_probe.mjs` (`npm run citation:probe`) in `query-intelligence.yml` | twice daily 07:10 + 19:10 UTC | OpenRouter grounded models (plus Gemini when keyed) | asked 25 queries, checked whether answers cite virtualagency-os.com | **Off.** `paid-citation-probe.yml`, dispatch only, `confirm_paid` (default false) |
| `scripts/citation_intelligence/collect_zero_cost_signals.js` (`npm run signals:collect`) in `query-intelligence.yml` | twice daily | Gemini `gemini-1.5-flash` prompt panel | 50 AEO/GEO query opportunities as one signal record | **Free.** $0 models via `scripts/llm/free_router.js`; source `free_model_prompt_panel`; ledger counts `free_llm_requests` |
| `GEMINI_API_KEY` passed to `programmatic-release.yml` (`release:autonomous`) and `credential-check.yml` | twice daily / weekly | none (no script read it) | nothing | **Removed.** |

`search-repair-retest.yml` makes no model call (checked: no provider URL or model key in it or the scripts it runs), so it is unchanged.

Validators touched: `faux_trace_all_workflows.py` was brittle (it required `GEMINI_API_KEY` in two workflows) and now requires the opposite: no Gemini key, and only the OpenRouter key on the free-router panel. `validate_workflows.js` and `ARTIFACT_MANIFEST.json` admit the new probe workflow, and `validate_workflows.js` now also requires the zero-paid gate in `ci.yml`. `test_citation_probe_rate_integrity.mjs` was strengthened: it now also proves the probe makes no call, writes nothing and names the stop when `CONFIRM_PAID` is unset.

## How free is enforced

- `config/llm_routing.json`: ordered $0/$0 model list, pricing snapshot (fetched 2026-10-11 from the unauthenticated `https://openrouter.ai/api/v1/models`), `policy.max_cost_usd: 0`, `paid_fallback: false`.
- `scripts/llm/free_router.*`: the only code allowed to call a model. Every request carries `provider.max_price = 0` (OpenRouter refuses paid endpoints), `usage.cost` is read back and a non-zero cost throws `FREE_ROUTER_COST_VIOLATION` (the run fails). Every call prints `FREE_LLM_RECEIPT {...}` with `outcome`, `model`, `cost_usd`, `key_label` and `key_info` (label, limit, usage, is_free_tier, limit_remaining from `GET /api/v1/auth/key`; never the key).
- Named stops, exit 0: `FREE_ROUTER_NO_KEY`, `OPENROUTER_KEY_DISABLED_OR_INVALID` ("OpenRouter key disabled or invalid; free routing needs an enabled key with a $0 limit"), `NO_FREE_MODEL_ANSWERED`. There is no paid fallback.
- Paid probe lanes call `paidProbeGate()` and stop with `PAID_PROBE_DISABLED_BY_OWNER_POLICY` unless `CONFIRM_PAID=true`, which only `.github/workflows/paid-citation-probe.yml` sets, and only when dispatched with `confirm_paid: true` (default false). That workflow has no schedule.
- Guard: `validate_zero_paid_llm.js` (`npm run validate:zero-paid-llm`, in the `ci.yml` merge gate). It fails on a non-$0 model or undated snapshot, any script calling a provider outside the router, a probe lane with a schedule or without `confirm_paid`, a scheduled workflow passing a non-router model key or naming a paid model, or `OPENROUTER_API_KEY` given to a step that runs no registered free-router consumer. Each check was proven to fail once against a mutated copy.

## Free models (ordered fallback)

Re-ordered 2026-10-16 after `NO_FREE_MODEL_ANSWERED` stopped the prompt panel on 13 and 16 Oct (receipts: nemotron ultra/super `empty`, ultra timeout, gemma-4-31b 429, `openrouter/free` `empty`).

1. `nvidia/nemotron-3-super-120b-a12b:free` (262k ctx; answers at cost 0)
2. `google/gemma-4-26b-a4b-it:free` (262k ctx; non-reasoning, sibling-proven)
3. `nvidia/nemotron-3-ultra-550b-a55b:free` (1M ctx; slow, timed out at 120s on 16 Oct)
4. `google/gemma-4-31b-it:free` (262k ctx; often upstream 429)

Dropped: `openrouter/free` (empty in both stops). Excluded: `thinkingmachines/inkling:free` (403 "only available on agentic harnesses").

## How the route keeps answering

- **Reasoning models:** nemotron spends `max_tokens` on a hidden trace and can return empty content (`finish_reason: length`). The first request asks `reasoning: {effort: low, exclude: true}`; an empty answer is retried once on the same model with `reasoning: {enabled: false}`. Empty attempts record `finish_reason` and `reasoning_chars` in the receipt.
- **429:** `Retry-After` (header, or OpenRouter's error metadata) is waited out once per model when it is 30s or less; otherwise the next model.
- **Per-model refusals** (403 harness-only, 404, 5xx) fall through to the next model; only 401 or a key-worded 403 is the key stop.
- **Bounded:** one total budget (default 5 min, selftest 2 min, so both fit the 13-min job timeout); models past it are `skipped` and the run ends in the named stop.
- **Pinned by** `scripts/llm/test_free_router.js` (`npm run test:free-router`, in the `ci.yml` merge gate): replays each 13/16 Oct failure mode against a mocked fetch. A body read that times out after the headers is an `error`, never `empty` (the post-#42 dispatch showed super \"empty\" with no choices: a swallowed 120s body timeout on a 6000-token answer); the panel now asks 20 opportunities at `max_tokens` 2500 (only 4000 chars were ever stored).

