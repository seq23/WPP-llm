#!/usr/bin/env node
'use strict';
/**
 * Behaviour pins for scripts/llm/free_router.js, against a mocked fetch (no
 * network, no key). Written after the 13 + 16 Oct 2026 NO_FREE_MODEL_ANSWERED
 * stops in query-intelligence.yml, whose receipts were:
 *   13 Oct: ultra empty, super empty, gemma-4-31b 429, openrouter/free empty
 *   16 Oct: ultra timeout, super empty, gemma-4-31b 429, openrouter/free empty
 * Each case below replays one of those failure modes and requires the route to
 * answer (or move on) while every $0 guarantee still holds.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROUTER = path.resolve(__dirname, 'free_router.js');
const REPO = path.resolve(__dirname, '..', '..');
const ENV = { OPENROUTER_API_KEY: 'sk-or-v1-test' };

function tmpRoot(models) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-router-'));
  fs.mkdirSync(path.join(dir, 'config'));
  const snap = {};
  for (const m of models) snap[m] = { prompt: '0', completion: '0', request: '0', context_length: 262144 };
  fs.writeFileSync(path.join(dir, 'config', 'llm_routing.json'), JSON.stringify({
    policy: { max_cost_usd: 0, paid_fallback: false }, endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    free_models: models, pricing_snapshot: { fetched_at: '2026-10-16', models: snap },
  }));
  return dir;
}

const json = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n) => headers[n.toLowerCase()] ?? null }, json: async () => body, text: async () => JSON.stringify(body) });
const answer = (content, extra = {}) => json(200, { model: extra.model, choices: [{ finish_reason: extra.finish_reason || 'stop', message: { content, reasoning: extra.reasoning } }], usage: { cost: 0 } });

// handler(model, body, n) -> response; n counts calls to that model
function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts) => {
    if (String(url).includes('/auth/key')) return json(200, { data: { label: 'sk-or-v1-tes...est', limit: 0, usage: 0, is_free_tier: false, limit_remaining: 0 } });
    const body = JSON.parse(opts.body);
    calls.push(body);
    const n = calls.filter((c) => c.model === body.model).length;
    return handler(body.model, body, n);
  };
  return calls;
}

function fresh() { delete require.cache[ROUTER]; return require(ROUTER); }
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
const run = (opts) => quiet(() => fresh().freeChat({ messages: [{ role: 'user', content: 'x' }], max_tokens: 6000, env: ENV, ...opts }));

const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test('every request is capped at $0 (provider.max_price 0) and names only configured models', async () => {
  const models = ['a/one:free', 'b/two:free'];
  const calls = mockFetch((m) => (m === 'b/two:free' ? answer('fine') : json(503, { error: { message: 'down' } })));
  const r = await run({ root: tmpRoot(models) });
  assert.ok(r.ok);
  assert.ok(calls.length >= 2);
  for (const c of calls) {
    assert.deepStrictEqual(c.provider.max_price, { prompt: 0, completion: 0, request: 0 });
    assert.ok(models.includes(c.model), `called unlisted model ${c.model}`);
  }
});

test('13/16 Oct replay: reasoning model spends max_tokens on its trace (empty content) -> retried with reasoning off and answers', async () => {
  const calls = mockFetch((m, body) => (body.reasoning && body.reasoning.enabled === false
    ? answer('the panel')
    : answer(null, { finish_reason: 'length', reasoning: 'thinking '.repeat(500) })));
  const r = await run({ root: tmpRoot(['nvidia/nemotron-3-super-120b-a12b:free']) });
  assert.ok(r.ok, `expected an answer, got stop ${r.stop}`);
  assert.strictEqual(r.content, 'the panel');
  assert.strictEqual(calls[0].reasoning.effort, 'low', 'first request must ask for low reasoning effort');
  const empty = r.receipt.attempts.find((a) => a.status === 'empty');
  assert.strictEqual(empty.finish_reason, 'length', 'an empty attempt must record finish_reason so the receipt explains itself');
  assert.ok(empty.reasoning_chars > 0);
});

test('empty twice on one model -> next model, not a stop', async () => {
  mockFetch((m) => (m === 'b/two:free' ? answer('ok') : answer('')));
  const r = await run({ root: tmpRoot(['a/one:free', 'b/two:free']) });
  assert.ok(r.ok);
  assert.strictEqual(r.receipt.attempts.filter((a) => a.model === 'a/one:free').length, 2, 'one bounded retry, no more');
});

test('content returned as an array of parts is read, not counted empty', async () => {
  mockFetch(() => answer([{ type: 'text', text: 'part one ' }, { type: 'text', text: 'two' }]));
  const r = await run({ root: tmpRoot(['a/one:free']) });
  assert.ok(r.ok);
  assert.strictEqual(r.content, 'part one two');
});

test('429 with a short Retry-After is waited out once on the same model', async () => {
  const waits = [];
  mockFetch((m, b, n) => (n === 1 ? json(429, { error: { message: 'Provider returned error' } }, { 'retry-after': '2' }) : answer('after wait')));
  const r = await run({ root: tmpRoot(['google/gemma-4-31b-it:free']), _sleep: async (ms) => { waits.push(ms); } });
  assert.ok(r.ok, `expected an answer after Retry-After, got ${r.stop}`);
  assert.deepStrictEqual(waits, [2000]);
});

test('429 Retry-After in OpenRouter error metadata is honoured', async () => {
  const waits = [];
  mockFetch((m, b, n) => (n === 1 ? json(429, { error: { message: 'Provider returned error', metadata: { headers: { 'X-RateLimit-Reset': String(Date.now() + 5000) } } } }) : answer('ok')));
  const r = await run({ root: tmpRoot(['a/one:free']), _sleep: async (ms) => { waits.push(ms); } });
  assert.ok(r.ok);
  assert.strictEqual(waits.length, 1);
  assert.ok(waits[0] > 3000 && waits[0] <= 5000);
});

test('429 with a long Retry-After (or a second 429) does not wait: next model', async () => {
  const waits = [];
  mockFetch((m) => (m === 'b/two:free' ? answer('ok') : json(429, { error: { message: 'rate' } }, { 'retry-after': '600' })));
  const r = await run({ root: tmpRoot(['a/one:free', 'b/two:free']), _sleep: async (ms) => { waits.push(ms); } });
  assert.ok(r.ok);
  assert.deepStrictEqual(waits, []);
  const waits2 = [];
  mockFetch((m) => (m === 'b/two:free' ? answer('ok') : json(429, { error: { message: 'rate' } }, { 'retry-after': '1' })));
  const r2 = await run({ root: tmpRoot(['a/one:free', 'b/two:free']), _sleep: async (ms) => { waits2.push(ms); } });
  assert.ok(r2.ok);
  assert.deepStrictEqual(waits2, [1000], 'at most one wait per model');
});

test('per-model 403 ("only available on agentic harnesses") falls through; it is not a key stop', async () => {
  mockFetch((m) => (m === 'thinkingmachines/inkling:free' ? json(403, { error: { message: 'This model is only available on agentic harnesses' } }) : answer('ok')));
  const r = await run({ root: tmpRoot(['thinkingmachines/inkling:free', 'b/two:free']) });
  assert.ok(r.ok, `403 per-model refusal stopped the route: ${r.stop}`);
});

test('401 is still the named key stop', async () => {
  mockFetch(() => json(401, { error: { message: 'User not found' } }));
  const r = await run({ root: tmpRoot(['a/one:free', 'b/two:free']) });
  assert.strictEqual(r.stop, 'OPENROUTER_KEY_DISABLED_OR_INVALID');
});

test('total time budget bounds the run; a spent budget is the named stop, never a paid model', async () => {
  const calls = mockFetch(async () => { await new Promise((res) => setTimeout(res, 30)); throw new Error('The operation was aborted due to timeout'); });
  const r = await run({ root: tmpRoot(['a/one:free', 'b/two:free', 'c/three:free']), totalBudgetMs: 40 });
  assert.strictEqual(r.stop, 'NO_FREE_MODEL_ANSWERED');
  assert.ok(calls.length < 3, 'models past the budget must not be called');
  assert.ok(r.receipt.attempts.some((a) => a.status === 'skipped'));
});

test('non-zero reported cost still throws FREE_ROUTER_COST_VIOLATION', async () => {
  mockFetch(() => json(200, { choices: [{ message: { content: 'x' } }], usage: { cost: 0.0001 } }));
  await assert.rejects(() => run({ root: tmpRoot(['a/one:free']) }), /FREE_ROUTER_COST_VIOLATION/);
});

test('committed config: $0 only, no never-answering models, sibling-proven gemma-4-26b present', async () => {
  const { loadConfig, assertFreeConfig } = fresh();
  const cfg = loadConfig(REPO);
  assertFreeConfig(cfg);
  for (const bad of ['thinkingmachines/inkling:free', 'openrouter/free']) assert.ok(!cfg.free_models.includes(bad), `${bad} never answered this route`);
  assert.ok(cfg.free_models.includes('google/gemma-4-26b-a4b-it:free'));
  for (const m of cfg.free_models) assert.ok(m.endsWith(':free'), `${m} is not a :free variant`);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of cases) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
  }
  if (!cases.length) { console.error('free-router tests: zero cases'); process.exit(1); }
  console.log(`free-router tests: ${cases.length - failed}/${cases.length} passed`);
  process.exit(failed ? 1 : 0);
})();
