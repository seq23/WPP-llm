#!/usr/bin/env node
/**
 * Close the discovery gap: score the 523 observed queries by openness and lead
 * intent, and pick the bounded set worth spending a probe call on.
 *
 * The gap
 * -------
 * `data/query_atlas/query_universe.json` enumerates 10,099 candidates and 37 of
 * them are demand-backed. That 37 is not a measure of how much demand this
 * property has evidence for - it is a measure of how often a template expansion
 * in `scripts/citation_intelligence/generate_query_universe.js` happens to
 * produce the exact string a real searcher typed.
 *
 * The evidence file holds 523 queries measured in Search Console. The generator
 * only ever JOINED against them; it never SEEDED from them. So 486 queries with
 * real measured demand had no candidate row, no route_candidate, and therefore
 * no way to reach the release planner at all. That is fixed in the generator;
 * this script is the scoring half.
 *
 * What this adds
 * --------------
 *   OPENNESS. `scripts/llm_citation_probe.mjs` in grounded mode reads back the
 *   hosts an answer engine built its answer from. Which hosts occupy an answer
 *   is a measurement. A query answered out of forum threads is winnable by a
 *   real page; one answered out of .gov is not.
 *
 *   LEAD INTENT. Tiered by how close the searcher is to converting.
 *
 * What it does not add
 * --------------------
 * No search volume. There is no live paid keyword source on this account. GSC
 * rows keep `impressions_90d` with `search_volume: null` where no keyword tool
 * has been joined; impressions are this domain's own demand, never market volume.
 *
 * The probe queue is bounded on purpose. Probing all 523 costs real money and
 * ~90 minutes of wall clock for a reading that is most valuable on the rows a
 * lead actually comes from, so the queue is the T1-T3 lead-intent rows plus the
 * highest-impression informational rows, capped.
 *
 * Usage
 * -----
 *   node scripts/queries/score_discovery_gap.mjs            # score + build queue
 *   node scripts/llm_citation_probe.mjs --mode grounded \
 *        --queries data/queries/discovery_probe_queue.json --limit 60
 *   node scripts/queries/score_discovery_gap.mjs            # attach observations
 *
 * A row the probe has not reached is `UNMEASURED`, never a zero.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };
const write = (p, v) => { fs.mkdirSync(path.join(ROOT, path.dirname(p)), { recursive: true }); fs.writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 2) + '\n'); };

const EVIDENCE = 'data/queries/evidence/evidence_queries.json';
const OBSERVATIONS = 'data/signals/llm_citation_observations.json';
const QUEUE = 'data/queries/discovery_probe_queue.json';
const QUEUE_CAP = Number(process.env.DISCOVERY_PROBE_CAP || 60);

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- lead intent
//
// Word boundaries throughout. `\bfee` alone matches "feel"; `\bfees?\b` does not.
const T1_LOCAL_READY = [
  /\bnear me\b/,
  /\bopen now\b/,
  /\bin[- ]network\b/,
  /\bin [a-z]+(?: [a-z]+)?,? (?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/,
];
const T2_COST_IN_MARKET = [
  /\bhow much\b/, /\bcosts?\b/, /\bprice(?:s|d|ing)?\b/, /\bfees?\b/,
  /\bworth it\b/, /\bout of pocket\b/, /\bcheap(?:est|er)?\b/, /\baffordable\b/,
  /\brates?\b/, /\bbudget\b/,
];
const T3_SELECTION = [
  /\bhow to (?:choose|compare|find|pick|select)\b/, /\bred flags?\b/, /\bvs\.?\b/,
  /\bversus\b/, /\bwhich is better\b/, /\bwhat to ask\b/, /\bquestions to ask\b/,
  /\bcompare\b/, /\bcomparison\b/, /\bdifference between\b/, /\bbest\b/,
];
const LEAD_TIER_ORDER = ['T1_LOCAL_READY', 'T2_COST_IN_MARKET', 'T3_SELECTION', 'T4_INFORMATIONAL'];

function leadIntentTier(query) {
  const q = norm(query);
  if (T1_LOCAL_READY.some((re) => re.test(q))) return 'T1_LOCAL_READY';
  if (T2_COST_IN_MARKET.some((re) => re.test(q))) return 'T2_COST_IN_MARKET';
  if (T3_SELECTION.some((re) => re.test(q))) return 'T3_SELECTION';
  return 'T4_INFORMATIONAL';
}

// -------------------------------------------------------------------- openness
const PLATFORM_HOSTS = new Set([
  'reddit.com', 'quora.com', 'youtube.com', 'facebook.com', 'instagram.com',
  'tiktok.com', 'pinterest.com', 'linkedin.com', 'medium.com', 'x.com',
  'twitter.com', 'yelp.com', 'wikihow.com', 'answers.com', 'tripadvisor.com',
  'nextdoor.com', 'stackexchange.com', 'stackoverflow.com', 'substack.com',
  'g2.com', 'capterra.com', 'producthunt.com', 'trustradius.com', 'getapp.com',
]);
const isPlatform = (h) => PLATFORM_HOSTS.has(h) || [...PLATFORM_HOSTS].some((p) => h.endsWith(`.${p}`));
const isInstitutional = (h) => /\.(gov|edu|mil)$/.test(h) || h === 'wikipedia.org' || h.endsWith('.wikipedia.org');

const OPENNESS_METHOD = {
  input: 'cited_hosts from a grounded run of scripts/llm_citation_probe.mjs (OpenRouter web plugin, engine=parallel, mode=turbo)',
  formula: 'openness_score = clamp(0.5 + 0.5*platform_share - 0.5*institutional_share, 0, 1)',
  platform_share: 'share of distinct cited hosts that are user-generated, aggregator or software-review platforms',
  institutional_share: 'share of distinct cited hosts on .gov/.edu/.mil or wikipedia',
  verdicts: {
    HELD_BY_US: 'the engine already cited one of our own domains - not an opportunity, a position to defend',
    OPEN: 'openness_score >= 0.6 - the answer is assembled from platforms and no authoritative page owns it',
    CONTESTED: '0.4 <= openness_score < 0.6',
    HELD: 'openness_score < 0.4 - institutions or established publishers occupy the answer',
    UNMEASURED: 'the probe has not answered for this query; NOT a zero and never to be read as one',
  },
  not_measured: 'search volume, keyword difficulty, organic rank. None are inferable from a citation observation and none are written.',
};

function occupancyFor(query, observationsByQuery) {
  const obs = observationsByQuery.get(norm(query));
  if (!obs) return { verdict: 'UNMEASURED', reason: 'NO_GROUNDED_OBSERVATION', openness_score: null, cited_hosts: [], observed_at: null, engine: null };
  if (obs.status !== 'observed') return { verdict: 'UNMEASURED', reason: 'PROVIDER_ERROR', openness_score: null, cited_hosts: [], observed_at: obs.observed_at || null, engine: obs.engine || null };
  const hosts = [...new Set(obs.cited_domains || [])];
  const ours = obs.cited_ours || [];
  if (!hosts.length) return { verdict: 'UNMEASURED', reason: 'PROVIDER_ANSWERED_WITHOUT_RETRIEVING', openness_score: null, cited_hosts: [], observed_at: obs.observed_at, engine: obs.engine };
  const platform = hosts.filter(isPlatform).length / hosts.length;
  const institutional = hosts.filter(isInstitutional).length / hosts.length;
  const score = Math.max(0, Math.min(1, 0.5 + 0.5 * platform - 0.5 * institutional));
  const verdict = ours.length ? 'HELD_BY_US' : score >= 0.6 ? 'OPEN' : score >= 0.4 ? 'CONTESTED' : 'HELD';
  return {
    verdict, reason: 'GROUNDED_CITATION_OBSERVATION',
    openness_score: Number(score.toFixed(3)),
    platform_share: Number(platform.toFixed(3)),
    institutional_share: Number(institutional.toFixed(3)),
    distinct_cited_hosts: hosts.length,
    cited_hosts: hosts, cited_ours: ours,
    observed_at: obs.observed_at, engine: obs.engine,
  };
}

// ----------------------------------------------------------------- the scoring
const doc = read(EVIDENCE, null);
if (!doc) { console.error(`score_discovery_gap: missing ${EVIDENCE}`); process.exit(1); }

const observations = read(OBSERVATIONS, { runs: [] });
const grounded = (observations.runs || []).filter((r) => r.mode === 'grounded');
const observationsByQuery = new Map();
// Merge every grounded run, newest last, so an earlier reading is not thrown away
// just because a later bounded run did not include that query.
for (const run of grounded) for (const o of run.observations || []) observationsByQuery.set(norm(o.query), o);

let scored = 0;
for (const row of doc.queries || []) {
  row.lead_intent_tier = leadIntentTier(row.query);
  row.lead_intent_method = 'regex_classifier_on_query_string, scripts/queries/score_discovery_gap.mjs';
  row.occupancy = occupancyFor(row.query, observationsByQuery);
  if (row.occupancy.openness_score !== null) scored++;
}

const tiers = {}; const verdicts = {};
for (const q of doc.queries || []) {
  tiers[q.lead_intent_tier] = (tiers[q.lead_intent_tier] || 0) + 1;
  verdicts[q.occupancy.verdict] = (verdicts[q.occupancy.verdict] || 0) + 1;
}

doc.discovery_gap_pass = {
  at: new Date().toISOString(),
  by: 'scripts/queries/score_discovery_gap.mjs',
  why: '523 queries measured in Search Console carried demand and nothing else. Demand says how many people ask; it does not say whether the answer is winnable or whether the asker is near converting.',
  companion_fix: 'scripts/citation_intelligence/generate_query_universe.js now SEEDS a candidate from every demand record instead of only joining against them. Before that change, 486 of these 523 measured queries had no candidate row and could not reach the release planner at all.',
  expansion_sources: ['data/queries/evidence/evidence_queries.json - already current with the last Search Console ingest; no observed source on disk has phrasing it lacks.'],
  refused_sources: [
    'data/query_atlas/query_universe.json - a template x taxonomy expansion. Generated phrasing, not observed demand.',
    'data/query_atlas/max_fanout_window.json - synthetic permutations, a hypothesis reserve.',
    'any modelled or estimated search volume - no live paid keyword source exists on this account.',
  ],
  lead_intent_classifier: {
    T1_LOCAL_READY: 'near me / open now / in <City ST> / in-network',
    T2_COST_IN_MARKET: 'how much / cost / price / fee / rate / budget / worth it / affordable',
    T3_SELECTION: 'how to choose|compare|find / red flags / vs / comparison / which is better / what to ask / best',
    T4_INFORMATIONAL: 'everything else - definitions, lists, process explanations',
    note: 'Word-boundary anchored. `\\bfees?\\b` deliberately does not match "feel".',
  },
  openness_method: OPENNESS_METHOD,
  counts: { total_queries: (doc.queries || []).length, added_this_pass: 0, with_openness_reading: scored, lead_intent: tiers, occupancy: verdicts },
};

write(EVIDENCE, doc);

// ------------------------------------------------------------- the probe queue
//
// Bounded on purpose. A grounded call costs money and about forty seconds, and
// the reading is worth most on the rows a lead actually arrives through. Rows
// already carrying a reading are skipped so a re-run spends nothing twice.
const impressionsOf = (q) => Number(q.impressions_90d ?? q.impressions ?? 0);
const candidates = (doc.queries || [])
  .filter((q) => q.occupancy.openness_score === null)
  .sort((a, b) => (
    LEAD_TIER_ORDER.indexOf(a.lead_intent_tier) - LEAD_TIER_ORDER.indexOf(b.lead_intent_tier)
    || impressionsOf(b) - impressionsOf(a)
    || a.query.localeCompare(b.query)
  ))
  .slice(0, QUEUE_CAP);

write(QUEUE, {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  by: 'scripts/queries/score_discovery_gap.mjs',
  purpose: 'The next bounded set of measured queries to spend a grounded citation call on: every row that still has no openness reading, in the order this pass would probe them. Recorded so the selection is auditable rather than implicit - lead-intent tier first, then this domain own impressions. Rows that already carry a reading are absent because they have been measured, not because they were skipped.',
  selection_rule: 'unscored rows only, ordered by lead_intent_tier (T1 > T2 > T3 > T4) then impressions_90d, capped at DISCOVERY_PROBE_CAP',
  cap: QUEUE_CAP,
  truth_boundary: 'A row in this queue is a query chosen for observation. It is not evidence of rank, citation or volume.',
  queries: candidates.map((q) => ({ query: q.query, lead_intent_tier: q.lead_intent_tier, impressions_90d: q.impressions_90d ?? null, evidence_tier: q.evidence_tier })),
});

console.log(`[discovery-gap] ${(doc.queries || []).length} observed evidence queries, ${scored} with an openness reading.`);
console.log(`  lead intent: ${LEAD_TIER_ORDER.filter((t) => tiers[t]).map((t) => `${t}=${tiers[t]}`).join(' ')}`);
console.log(`  occupancy:   ${Object.entries(verdicts).sort().map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`  probe queue: ${candidates.length} unscored rows written to ${QUEUE} (cap ${QUEUE_CAP}).`);
