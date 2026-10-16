'use strict';
/**
 * Free-only LLM router. Owner policy, 11 Oct 2026: "nothing should be paid".
 *
 * Every model call in this repo goes through here, and here only reaches
 * OpenRouter models priced $0/$0 (config/llm_routing.json, with the pricing
 * snapshot it was chosen from). Three independent guards keep it free:
 *   1. the model list holds only snapshot-priced $0 models (validated in CI);
 *   2. every request carries provider.max_price = 0, so OpenRouter itself
 *      refuses to route to a paid endpoint;
 *   3. usage.cost is read back on every answer and a non-zero cost throws
 *      FREE_ROUTER_COST_VIOLATION (the run fails loudly).
 * When no free model answers it returns a named stop and never falls back to a
 * paid model. A disabled or invalid key is its own named stop, distinct from
 * "no free model answered", so a receipt can never confuse the two.
 *
 * Paid observation lanes (citation probes, live search observers) are off by
 * owner policy; paidProbeGate() is the single switch that lets one run only
 * when a human dispatches it with confirm_paid=true.
 */
const fs = require('fs');
const path = require('path');

const CONFIG_REL = 'config/llm_routing.json';
const KEY_STOP = 'OPENROUTER_KEY_DISABLED_OR_INVALID';
const KEY_STOP_DETAIL = 'OpenRouter key disabled or invalid; free routing needs an enabled key with a $0 limit';

class FreeRouterCostViolation extends Error {}

function loadConfig(root) {
  const base = root || path.resolve(__dirname, '..', '..');
  return JSON.parse(fs.readFileSync(path.join(base, CONFIG_REL), 'utf8'));
}

function assertFreeConfig(cfg) {
  if (!cfg || !cfg.policy || cfg.policy.max_cost_usd !== 0 || cfg.policy.paid_fallback !== false) {
    throw new FreeRouterCostViolation('FREE_ROUTER_COST_VIOLATION: config/llm_routing.json policy must be max_cost_usd 0 and paid_fallback false');
  }
  const snap = (cfg.pricing_snapshot && cfg.pricing_snapshot.models) || {};
  for (const m of cfg.free_models || []) {
    const p = snap[m];
    if (!p || String(p.prompt) !== '0' || String(p.completion) !== '0') {
      throw new FreeRouterCostViolation(`FREE_ROUTER_COST_VIOLATION: ${m} is not priced $0/$0 in the committed snapshot`);
    }
  }
  if (!(cfg.free_models || []).length) throw new FreeRouterCostViolation('FREE_ROUTER_COST_VIOLATION: no free models configured');
}

function emit(receipt) {
  console.log(`FREE_LLM_RECEIPT ${JSON.stringify(receipt)}`);
  if (receipt.stop) console.log(`NAMED_STOP: ${receipt.stop} - ${receipt.stop_detail}`);
}

function isKeyRefusal(status, message) {
  if (status === 401) return true;
  return status === 403 && /key|disabled|limit|credit|unauthori[sz]ed/i.test(String(message || '')) && !/model|provider|region/i.test(String(message || ''));
}

// GET /api/v1/auth/key once per process. Only label, limit, usage,
// is_free_tier and limit_remaining are kept - never the key itself - so every
// receipt names which key (and whose account) answered.
const KEY_FIELDS = ['label', 'limit', 'usage', 'is_free_tier', 'limit_remaining'];
let keyCheck = null;
async function checkKey(key, timeoutMs) {
  if (keyCheck) return keyCheck;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/auth/key', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
    const raw = await r.text().catch(() => '');
    let data = {};
    try { data = (JSON.parse(raw) || {}).data || {}; } catch { data = {}; }
    const info = {};
    for (const f of KEY_FIELDS) info[f] = data[f] === undefined ? null : data[f];
    keyCheck = { ok: !isKeyRefusal(r.status, raw), http_status: r.status, info };
  } catch (e) {
    keyCheck = { ok: true, http_status: null, info: null, note: `key preflight unreachable: ${e.message}` };
  }
  return keyCheck;
}

// Reasoning models (nemotron-3-*) spend completion tokens on a hidden
// reasoning trace before the answer; with a long prompt the trace can use the
// whole max_tokens budget and the answer comes back empty (finish_reason
// "length", message.content null). That was the 13 + 16 Oct 2026
// NO_FREE_MODEL_ANSWERED stops. So the first request asks for low reasoning
// effort with the trace excluded, and an empty answer is retried once on the
// same model with reasoning switched off.
const REASONING_FIRST = { effort: 'low', exclude: true };
const REASONING_OFF = { enabled: false };
const RATE_LIMIT_MAX_WAIT_MS = 30000;
const DEFAULT_TOTAL_BUDGET_MS = 300000; // panel + selftest + the rest must fit the 13-min query-intelligence job timeout

function textOf(content) {
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : (p && p.text) || '')).join('');
  return content == null ? '' : String(content);
}

// Retry-After (seconds or HTTP date), or OpenRouter's X-RateLimit-Reset (epoch ms).
function retryAfterMs(res, data, now = Date.now()) {
  const h = (n) => (res && res.headers && typeof res.headers.get === 'function' ? res.headers.get(n) : null);
  const meta = (data && data.error && data.error.metadata) || {};
  const ra = h('retry-after') || (meta.headers && (meta.headers['Retry-After'] || meta.headers['retry-after']));
  if (ra != null && ra !== '') {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  const reset = h('x-ratelimit-reset') || (meta.headers && meta.headers['X-RateLimit-Reset']);
  if (reset != null && Number.isFinite(Number(reset))) return Math.max(0, Number(reset) - now);
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freeChat({ messages, max_tokens = 1500, temperature = 0.2, purpose = 'unspecified', timeoutMs = 120000, totalBudgetMs = DEFAULT_TOTAL_BUDGET_MS, env = process.env, root, _sleep = sleep } = {}) {
  const cfg = loadConfig(root);
  assertFreeConfig(cfg);
  const receipt = { purpose, policy: 'free_only', max_cost_usd: 0, at: new Date().toISOString(), outcome: null, model: null, cost_usd: null, key_label: null, key_info: null, attempts: [] };
  const key = String(env.OPENROUTER_API_KEY || '').trim();
  const stop = (code, detail, outcome) => { receipt.outcome = outcome; receipt.stop = code; receipt.stop_detail = detail; emit(receipt); return { ok: false, stop: code, receipt }; };
  if (!key) return stop('FREE_ROUTER_NO_KEY', 'OPENROUTER_API_KEY is not set for this step; no model was called and nothing was paid', 'credential_missing');
  const kc = await checkKey(key, Math.min(timeoutMs, 20000));
  receipt.key_label = kc.info ? kc.info.label : null;
  receipt.key_info = kc.info;
  if (!kc.ok) return stop(KEY_STOP, `${KEY_STOP_DETAIL} (GET /api/v1/auth/key HTTP ${kc.http_status})`, 'credential_refused');
  const deadline = Date.now() + totalBudgetMs;
  const call = async (model, reasoning) => {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens, temperature, reasoning, usage: { include: true }, provider: { max_price: { prompt: 0, completion: 0, request: 0 } } }),
      signal: AbortSignal.timeout(Math.max(1000, Math.min(timeoutMs, deadline - Date.now()))),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };
  for (const model of cfg.free_models) {
    let reasoning = REASONING_FIRST;
    let rateWaited = false;
    let emptyRetried = false;
    for (;;) {
      if (Date.now() >= deadline) { receipt.attempts.push({ model, status: 'skipped', error: 'total time budget spent' }); break; }
      let res; let data;
      try {
        ({ res, data } = await call(model, reasoning));
      } catch (e) {
        receipt.attempts.push({ model, status: 'error', error: String(e.message || e).slice(0, 200) });
        break;
      }
      if (!res.ok || data.error) {
        const msg = String((data.error && data.error.message) || '').slice(0, 200);
        const attempt = { model, status: 'refused', http_status: res.status, error: msg };
        if (isKeyRefusal(res.status, msg)) { receipt.attempts.push(attempt); return stop(KEY_STOP, `${KEY_STOP_DETAIL} (HTTP ${res.status} on ${model})`, 'credential_refused'); }
        // 429: wait out Retry-After once, if it fits the per-wait cap and the total budget.
        const waitMs = res.status === 429 ? retryAfterMs(res, data) : null;
        if (res.status === 429 && !rateWaited && waitMs !== null && waitMs <= RATE_LIMIT_MAX_WAIT_MS && Date.now() + waitMs < deadline) {
          attempt.retry_after_ms = waitMs;
          receipt.attempts.push(attempt);
          rateWaited = true;
          await _sleep(waitMs);
          continue;
        }
        receipt.attempts.push(attempt);
        break; // per-model refusal (403 harness-only, 404, 429, 5xx): next model
      }
      const reported = data.usage ? data.usage.cost : undefined;
      if (reported !== undefined && reported !== null && Number(reported) !== 0) {
        receipt.attempts.push({ model, status: 'cost_violation', cost_usd: reported });
        emit(receipt);
        throw new FreeRouterCostViolation(`FREE_ROUTER_COST_VIOLATION: ${model} reported cost ${reported} USD; the free-only policy allows 0`);
      }
      const choice = (data.choices && data.choices[0]) || {};
      const msgObj = choice.message || {};
      const content = textOf(msgObj.content);
      if (!content.trim()) {
        receipt.attempts.push({ model, status: 'empty', finish_reason: choice.finish_reason || null, reasoning_chars: textOf(msgObj.reasoning).length, reasoning: reasoning === REASONING_OFF ? 'off' : 'low' });
        if (!emptyRetried) { emptyRetried = true; reasoning = REASONING_OFF; continue; }
        break;
      }
      receipt.attempts.push({ model, status: 'ok' });
      receipt.outcome = 'free_model_answered';
      receipt.model = data.model || model;
      receipt.cost_usd = reported === undefined ? null : Number(reported);
      emit(receipt);
      return { ok: true, content, model: receipt.model, finish_reason: choice.finish_reason || null, receipt };
    }
  }
  return stop('NO_FREE_MODEL_ANSWERED', `none of ${cfg.free_models.length} free models answered; no paid fallback exists by owner policy`, 'no_free_model_answered');
}

function paidProbeGate(lane, env = process.env) {
  if (String(env.CONFIRM_PAID || '').toLowerCase() === 'true') {
    console.log(`PAID_PROBE_CONFIRMED: ${lane} runs because a human dispatched it with confirm_paid=true`);
    return true;
  }
  console.log(`NAMED_STOP: PAID_PROBE_DISABLED_BY_OWNER_POLICY - ${lane} calls a paid model to observe this loop's own output; off by owner policy (11 Oct 2026). Dispatch its workflow with confirm_paid=true to run it once.`);
  return false;
}

module.exports = { freeChat, paidProbeGate, retryAfterMs, textOf, loadConfig, assertFreeConfig, FreeRouterCostViolation, KEY_STOP };

if (require.main === module && process.argv.includes('--selftest')) {
  freeChat({ messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 200, temperature: 0, purpose: 'selftest', totalBudgetMs: 120000 })
    .then(() => process.exit(0))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
