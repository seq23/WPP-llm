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

1. `nvidia/nemotron-3-ultra-550b-a55b:free` (1M ctx)
2. `nvidia/nemotron-3-super-120b-a12b:free` (262k ctx)
3. `google/gemma-4-31b-it:free` (262k ctx)
4. `openrouter/free` ($0-only meta-router, last resort)

