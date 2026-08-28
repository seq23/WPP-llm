#!/usr/bin/env node
/**
 * Ask an answer engine a real question and record whether it cites us.
 *
 * This is the measurement the portfolio did not have. The existing
 * query:test:zero-cost task makes no network calls at all - it prints a
 * worksheet and a CSV for a human to fill in by hand - so nothing has ever
 * observed whether these pages are cited. Every statement about AEO progress up
 * to now has been inference from proxies.
 *
 * A grounded answer carries the sources it was actually built from. That is a
 * citation observation: the query, the engine, the domains it cited, and whether
 * any of them are ours.
 *
 * A rate is only ever written when the provider actually answered. This is
 * asserted below, not merely intended: on 2026-08-28 a run recorded
 * "errored: 11 of 11" and published self_cited_rate_pct: 0 anyway. A dead
 * instrument reported as a measurement of zero is worse than no instrument,
 * because it looks like evidence.
 *
 * What this does not claim: one engine is not all engines, grounding metadata is
 * not identical to what a user sees in an AI Overview, and absence on a given
 * day is weak evidence. Runs are recorded individually with timestamps so a
 * trend can be read later rather than a single run being treated as a verdict.
 *
 * Without an API key it exits 0 and records that it was skipped. A measurement
 * tool that fails the build when it cannot measure teaches people to remove it.
 *
 * Usage: node llm_citation_probe.mjs [--queries file] [--limit N] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const DRY = argv.includes('--dry-run');
const MODE = arg('--mode', process.env.CITATION_PROBE_MODE || 'knowledge');
const GROUNDED = MODE === 'grounded';
const LIMIT = Number(arg('--limit', '25'));
// Overridable so the rate-integrity contract test can drive a real run without
// touching the live artifact. Production never sets it.
const OUT = process.env.CITATION_PROBE_OUT || 'data/signals/llm_citation_observations.json';

const CONFIG_PATH = 'data/signals/citation_probe_config.json';
const config = fs.existsSync(path.join(ROOT, CONFIG_PATH))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, CONFIG_PATH), 'utf8'))
  : {};
const OWNED = (config.owned_domains || []).map((d) => d.toLowerCase().replace(/^www\./, ''));
if (!OWNED.length) {
  console.error(`citation probe: no owned_domains in ${CONFIG_PATH} - cannot tell a citation of ours from anyone else's`);
  process.exit(1);
}

function loadQueries() {
  const file = arg('--queries', config.queries_file || 'data/seo/priority_queries.json');
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return [];
  const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  const rows = Array.isArray(raw) ? raw : (raw.queries || raw.priority_queries || raw.entries || []);
  return rows.map((r) => (typeof r === 'string' ? r : r.query || r.text || '')).filter(Boolean).slice(0, LIMIT);
}

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

// Two modes, kept distinct because they measure different things and conflating
// them would overstate what is known.
//
//   knowledge (default) - ask without tools and see whether the model names us
//     unprompted. This measures whether we exist in the model's answer at all.
//     It is free.
//   grounded - ask with a live web search and read the sources the answer was
//     actually built from. This is a real citation observation and the stronger
//     signal. It runs on OpenRouter's web plugin, which bills a fraction of a
//     cent per query. Gemini's grounding is not usable: any request carrying
//     tools:[{google_search:{}}] returns 429 on this key while ungrounded calls
//     succeed, so grounded mode no longer routes there by default.
//
// Default is knowledge, because a probe that cannot run costs more than a weaker
// probe that does.
async function ask(query, key, model, grounded) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: query }] }],
    ...(grounded ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature: 0 },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
  const cand = data?.candidates?.[0] || {};
  const meta = cand.groundingMetadata || {};
  // Grounding chunks carry the pages the answer was actually built from. The
  // redirect wrapper Google returns is resolved where a real URI is present.
  const uris = [];
  for (const c of meta.groundingChunks || []) {
    const w = c.web || {};
    if (w.uri) uris.push(w.uri);
    if (w.domain) uris.push(`https://${w.domain}`);
  }
  for (const q of meta.webSearchQueries || []) void q;
  const answer = (cand.content?.parts || []).map((p) => p.text || '').join('\n');
  return { ok: true, answer, uris };
}

const queries = loadQueries();
if (!queries.length) { console.error('citation probe: no queries found'); process.exit(1); }

// OpenRouter is preferred when a key is present: its :free models cost nothing
// and asking several of them is a better sample than asking one. Gemini remains
// supported because it is the only one of the two that can ground an answer in
// live search, which is the stronger measurement when its quota allows.
const orKey = process.env.OPENROUTER_API_KEY || '';
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
// Pick the provider that can actually do the job asked for.
//
// Grounded mode is pinned to OpenRouter. Gemini's grounded path is hard-blocked
// on this key: plain generateContent returns 200, but any request carrying
// tools:[{google_search:{}}] returns 429 RESOURCE_EXHAUSTED - reproduced across
// three models and persistent over hours, so it is a capability the key does not
// have, not a burst to retry through. Preferring Gemini for grounded runs is what
// produced the 2026-08-28 run of "errored: 11 of 11" that still published a
// self-cited rate of 0. Gemini stays reachable only by an explicit
// --provider gemini, so choosing the blocked path is a deliberate act.
const PROVIDER = arg('--provider', GROUNDED
  ? 'openrouter'
  : (orKey ? 'openrouter' : 'gemini'));
// Three small models rather than one, because a single model's idiosyncrasies
// are not a measurement.
//
// These are the cheapest tier that actually answers, around two to three cents
// per million tokens - a full portfolio run costs roughly a cent. The genuinely
// free tier was tried first and is not usable for this: several :free models are
// agentic-harness only, others return upstream provider errors or hang with no
// response. A probe that silently reports zero because every model failed is
// worse than one that costs a cent and runs, so reliability wins here. Set
// OPENROUTER_MODELS to override, including back to :free variants.
const OR_MODELS = (process.env.OPENROUTER_MODELS || (config.openrouter_models || []).join(',') ||
  'ibm-granite/granite-4.0-h-micro,inclusionai/ling-3.0-flash,mistralai/mistral-nemo')
  .split(',').map((m) => m.trim()).filter(Boolean);

// Free models are heavily shared and some hang. Without a deadline one slow
// model stalls the whole run, which is how a measurement quietly stops being
// taken. A timed-out model is recorded as an error against that model, not as
// an absence of citations.
const REQUEST_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 25000);
async function withTimeout(fn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try { return await fn(ctrl.signal); }
  finally { clearTimeout(t); }
}

// The web plugin runs the model against live web results. The pages it actually
// used come back as url_citation annotations, which is the retrieval observation
// the knowledge-mode call cannot produce - that one only shows whether the model
// memorised us during training, which is not a citation.
//
// Declared as an explicit plugin rather than the ":online" model suffix so the
// result count is ours to set: ":online" defaults to 5 sources, and a citation
// measurement that only ever looks at the top 5 understates presence by
// construction.
// Overridable so the contract test can point the probe at a local endpoint that
// only errors, reproducing an all-errored run offline. Production never sets it.
const OR_BASE_URL = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const WEB_MAX_RESULTS = Number(process.env.PROBE_WEB_MAX_RESULTS || 10);
const WEB_PLUGIN = { id: 'web', max_results: WEB_MAX_RESULTS };

function openRouterCitations(data) {
  const message = data?.choices?.[0]?.message || {};
  const urls = [];
  for (const annotation of message.annotations || []) {
    const url = annotation?.url_citation?.url;
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

async function askOpenRouter(query, model, grounded = false) {
  const res = await withTimeout((signal) => fetch(`${OR_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${orKey}` },
    body: JSON.stringify({
      model, temperature: 0, max_tokens: 400,
      ...(grounded ? { plugins: [WEB_PLUGIN] } : {}),
      messages: [{ role: 'user', content: query }],
    }),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
  const answer = data?.choices?.[0]?.message?.content || '';
  return { ok: true, answer, uris: grounded ? openRouterCitations(data) : [] };
}
const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const now = new Date().toISOString();

const haveKey = PROVIDER === 'openrouter' ? Boolean(orKey) : Boolean(key);
if (!haveKey || DRY) {
  const reason = DRY ? 'dry_run' : `no_api_key_for_${PROVIDER}`;
  // A named legitimate stop: no measurement was attempted, and deliberately no
  // summary is written - the file keeps its last real measurement rather than
  // having it overwritten by the absence of one.
  console.log(`citation probe: NAMED STOP (${reason}); mode=${MODE}; provider=${PROVIDER}; ${queries.length} queries ready, owned domains: ${OWNED.join(', ')}. No rate written.`);
  process.exit(0);
}

const observations = [];
// One model can be idiosyncratic. Asking several and reporting each separately
// says more than averaging them into a single number would.
// Knowledge mode asks several cheap models because one model's idiosyncrasies
// are not a measurement. Grounded mode bills per search - around $0.007 a query
// - and the thing being measured is which pages the retrieval layer returns,
// which does not vary much by model. One model keeps a portfolio-wide run in
// cents. Override with OPENROUTER_GROUNDED_MODELS.
// gpt-4o-mini is the grounded default because it is the shape actually verified
// against the web plugin end to end - ten url_citation annotations returned for a
// real portfolio query. The cheap knowledge-mode models are not reliable here:
// some accept the plugin and return an answer with no annotations at all, which
// is a silent zero of exactly the kind this file exists to prevent.
const GROUNDED_MODELS = (process.env.OPENROUTER_GROUNDED_MODELS || (config.openrouter_grounded_models || []).join(',') || 'openai/gpt-4o-mini')
  .split(',').map((m) => m.trim()).filter(Boolean);
const engines = PROVIDER === 'openrouter' ? (GROUNDED ? GROUNDED_MODELS : OR_MODELS) : [model];
for (const q of queries) {
 for (const engineModel of engines) {
  let r;
  try {
    r = PROVIDER === 'openrouter' ? await askOpenRouter(q, engineModel, GROUNDED) : await ask(q, key, engineModel, GROUNDED);
  } catch (e) { r = { ok: false, error: String(e.message || e) }; }
  if (!r.ok) {
    observations.push({ query: q, engine: `${PROVIDER}:${engineModel}`, mode: MODE, observed_at: now, status: 'provider_error', error: r.error });
    console.log(`  ERROR  ${engineModel} :: ${q} :: ${String(r.error).slice(0, 70)}`);
    continue;
  }
  const domains = [...new Set(r.uris.map(hostOf).filter(Boolean))];
  const ours = domains.filter((d) => OWNED.some((o) => d === o || d.endsWith(`.${o}`)));
  // In knowledge mode there are no grounded sources, so presence means the model
  // named the brand or domain in its own answer.
  const answerLower = (r.answer || '').toLowerCase();
  const named = OWNED.filter((o) => answerLower.includes(o) || answerLower.includes(o.split('.')[0]));
  observations.push({
    query: q, engine: `${PROVIDER}:${engineModel}`, mode: MODE, observed_at: now,
    status: 'observed',
    cited_domains: domains,
    cited_ours: ours,
    self_cited: GROUNDED ? ours.length > 0 : named.length > 0,
    named_in_answer: named,
    answer_mentions_brand: named.length > 0,
  });
  const hit = GROUNDED ? ours.length > 0 : named.length > 0;
  console.log(`  ${hit ? 'PRESENT' : '   --  '} ${engineModel.split('/').pop()} :: ${q}${hit ? ` (${(GROUNDED ? ours : named).join(', ')})` : ''}`);
 }
}

const OUT_PATH = path.resolve(ROOT, OUT);
const prior = fs.existsSync(OUT_PATH)
  ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'))
  : { schema_version: '1.0', runs: [] };
prior.runs = (prior.runs || []).slice(-49);
prior.runs.push({ run_at: now, provider: PROVIDER, engines, mode: MODE, queries: queries.length, observations });

// A rate is a statement about answers. It may only be divided by answers.
//
// The rule this enforces: self_cited_rate_pct exists if and only if the provider
// actually answered at least once, and its denominator is the answered
// observations - never the attempted ones. Both halves matter. On 2026-08-28 a
// run recorded errored: 11 of 11 and still published self_cited_rate_pct: 0,
// because the denominator was the attempt count and zero-over-eleven is a
// perfectly well-formed 0%. A dead instrument was published as a measurement of
// absence. Dividing by attempts would also let a half-failed run silently halve
// the reported rate, which is the same lie in a smaller dose.
const answered = observations.filter((o) => o.status === 'observed');
const cited = answered.filter((o) => o.self_cited).length;
const errored = observations.filter((o) => o.status === 'provider_error').length;
const summary = {
  run_at: now, provider: PROVIDER, engines, mode: MODE,
  queries: queries.length,
  observations: observations.length,
  answered: answered.length,
  self_cited: cited,
  errored,
  _mode_note: GROUNDED
    ? 'grounded: counted when the answer was built from one of our pages'
    : 'knowledge: counted when the model named us unprompted, with no retrieval. Weaker than a citation and must not be reported as one.',
  _rate_rule: 'self_cited_rate_pct is present only when answered > 0, and is always self_cited / answered. Its absence means the probe did not measure, which is not the same as measuring zero.',
};
if (answered.length) {
  summary.status = errored ? 'PARTIAL' : 'MEASURED';
  summary.self_cited_rate_pct = Number(((100 * cited) / answered.length).toFixed(1));
} else {
  // Named, not silent, and carrying no number anyone could mistake for a result.
  summary.status = 'NO_PROVIDER_ANSWER';
  summary.error_state = 'every_call_errored';
  summary.error_sample = [...new Set(observations.map((o) => String(o.error || '')).filter(Boolean))].slice(0, 3);
}

// Asserted, not commented. A comment cannot fail a run; this can. It guards both
// directions so neither a fabricated rate nor a dropped one can be written.
function assertRateIntegrity(s) {
  const hasRate = Object.prototype.hasOwnProperty.call(s, 'self_cited_rate_pct');
  if (hasRate && !(s.answered > 0)) {
    throw new Error(`citation probe: refusing to write self_cited_rate_pct with answered=${s.answered}. A rate over zero answers is not a measurement of zero.`);
  }
  if (!hasRate && s.answered > 0) {
    throw new Error(`citation probe: answered=${s.answered} but no self_cited_rate_pct was computed; a real measurement must not be dropped.`);
  }
  if (hasRate && s.self_cited > s.answered) {
    throw new Error(`citation probe: self_cited=${s.self_cited} exceeds answered=${s.answered}.`);
  }
  if (s.answered + s.errored !== s.observations) {
    throw new Error(`citation probe: observation accounting does not balance (answered=${s.answered} + errored=${s.errored} != observations=${s.observations}).`);
  }
  return s;
}
prior.latest_summary = assertRateIntegrity(summary);

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(prior, null, 2) + '\n');

if (!answered.length) {
  // Rule 0: a stage may not exit 0 having done nothing. Nothing was measured, so
  // this run is a broken instrument, not a result. The workflow step is
  // continue-on-error, so this is visible without breaking the daily loop.
  console.error(`citation probe [${PROVIDER}/${MODE}]: NO_PROVIDER_ANSWER - ${errored}/${observations.length} calls errored, no rate written. ${summary.error_sample.join(' | ').slice(0, 200)}`);
  process.exit(1);
}
console.log(`citation probe [${PROVIDER}/${MODE}]: ${cited}/${answered.length} answered observations named one of our domains (${summary.self_cited_rate_pct}%); ${errored} provider error(s) excluded from the rate. Recorded in ${OUT}`);
