#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Rewrites the body of each kept page (data/seo/prune_ledger.json `kept`, plus
 * /answers/*) into plain, specific content, through the free router only.
 *
 * Output: data/seo/page_rewrites/<route>.json in the data/seo/demand_pages.json
 * page shape, written only when scripts/lib/rewrite_quality.js accepts it. A page
 * the free models cannot bring over the bar gets a `refused` record instead and
 * keeps its old body; scripts/lib/prune.js consumers do not index it until a
 * rewrite exists (owner, 2 Nov 2026: "noindex those rather than ship filler").
 *
 *   node scripts/content/rewrite_kept_pages.js [--limit N] [--only /route] [--retry-refused] [--shard i/n]
 *
 * Needs OPENROUTER_API_KEY (free router, $0 models only). Rule 0: a run that
 * had pages to do and accepted none exits 1.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { freeChat } = require('../llm/free_router.js');
const { check } = require('../lib/rewrite_quality.js');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'data/seo/page_rewrites');
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const LIMIT = Number(arg('--limit')) || Infinity;
const ONLY = arg('--only');
const RETRY_REFUSED = process.argv.includes('--retry-refused');
const ATTEMPTS = 3;
const SHARD = (arg('--shard') || '0/1').split('/').map(Number); // i/n: this process takes every n-th page

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const demand = readJson('data/seo/demand_pages.json');
const demandRoutes = new Set(demand.pages.map((p) => p.route));
const FACTS = [...new Set(demand.pages.flatMap((p) => p.facts || []))].map((f) => f.replace(/&amp;/g, '&'));
const fileFor = (route) => path.join(OUT_DIR, `${route.replace(/^\//, '').replace(/\//g, '__')}.json`);

function targets() {
  const ledger = readJson('data/seo/prune_ledger.json');
  const routes = ledger.kept.map((k) => k.route).filter((r) => r.startsWith('/programmatic/') && !demandRoutes.has(r));
  const answers = fs.readdirSync(path.join(ROOT, 'answers')).filter((n) => n.endsWith('.html') && n !== 'index.html').map((n) => `/answers/${n.replace(/\.html$/, '')}`);
  return [...routes, ...answers].sort();
}

function pageContext(route) {
  const html = fs.readFileSync(path.join(ROOT, `${route.replace(/^\//, '')}.html`), 'utf8');
  const get = (re) => { const m = html.match(re); return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''; };
  const adm = (readJson('data/content/page_admission_registry.json').admissions || []).find((a) => a.route === route) || {};
  return {
    route,
    query: adm.query || route.split('/').pop().replace(/-/g, ' '),
    h1: get(/<h1[^>]*>([\s\S]*?)<\/h1>/),
    description: get(/<meta name="description" content="([^"]*)"/),
  };
}

const SCHEMA = `{
  "title": "search-query-first page title, 30-60 characters, no site name",
  "description": "meta description, 120-155 characters, says what the reader gets",
  "h1": "the reader's question or the query as a plain statement",
  "definition": "40-60 words. Starts with the subject followed by 'is' or 'are'. Self-contained: it must make sense quoted alone.",
  "quick_answer": "1-2 sentences a reader could act on today",
  "sections": [ { "h2": "a question a buyer actually asks, ending in ?", "blocks": [ {"p": "answer sentence first, then detail"}, {"ul": ["specific item", "..."]} | {"ol": ["step", "..."]} | {"table": {"head": ["col", "col"], "rows": [["cell", "cell"]]}} ] } ],
  "faq": [ { "q": "question ending in ?", "a": "40-60 word answer" } ]
}`;

function prompt(ctx, feedback) {
  return [
    { role: 'system', content: 'You write clear, specific, plain-English guides for people buying or planning virtual events, webinars, hybrid conferences, content, creative, community and marketing operations work. You never pad, never repeat a phrase, and never invent statistics, prices, durations or percentages. Output JSON only.' },
    { role: 'user', content: `Write the page for this search: "${ctx.query}".
Current heading (rewrite it if it reads badly): ${ctx.h1}
Current summary: ${ctx.description}

Rules:
- Concrete and useful: real checklist items, real decisions, named tool categories, worked examples a reader would recognise. No filler sentences like "this turns on two decisions".
- 4 to 6 sections. Every h2 is a question a buyer types into a search box. Each section opens with a one-sentence answer, then detail.
- At least two sections use a list ("ul" or "ol") and one uses a "table" when a comparison helps.
- 3 to 5 FAQ items with 40-60 word answers that do not repeat the sections word for word.
- Numbers: write NO digits at all, except figures copied exactly from these approved facts (you may also use none of them):
${FACTS.map((f) => `  * ${f}`).join('\n')}
- You may say once, where it fits, that West Peek Productions produces virtual, hybrid and webinar events and sets up marketing, content and creative operations; never claim results, clients or guarantees.
- Total length 700-1,100 words. No markdown, no HTML except plain text.
${feedback ? `\nYour previous draft was rejected for: ${feedback}. Fix exactly those problems.` : ''}
Return one JSON object with this shape:
${SCHEMA}` },
  ];
}

function parse(content) {
  const s = String(content || '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

const esc = (t) => String(t).replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function escapePage(p) {
  const e = (v) => (typeof v === 'string' ? esc(v) : v);
  const block = (b) => {
    if (b.p) return { p: e(b.p) };
    if (b.ul) return { ul: b.ul.map(e) };
    if (b.ol) return { ol: b.ol.map(e) };
    if (b.table) return { table: { head: (b.table.head || []).map(e), rows: (b.table.rows || []).map((r) => r.map(e)) } };
    return b;
  };
  return {
    title: e(p.title), description: e(p.description), h1: e(p.h1), definition: e(p.definition), quick_answer: e(p.quick_answer),
    sections: (p.sections || []).map((s) => ({ h2: e(s.h2), blocks: (s.blocks || []).map(block) })),
    faq: (p.faq || []).map((f) => ({ q: e(f.q), a: e(f.a) })),
  };
}

async function rewrite(route) {
  const ctx = pageContext(route);
  let feedback = null;
  let last = null;
  for (let i = 0; i < ATTEMPTS; i += 1) {
    const r = await freeChat({ messages: prompt(ctx, feedback), max_tokens: 4000, temperature: 0.4, purpose: `rewrite:${route}`, timeoutMs: 180000 });
    if (!r.ok) { last = { stop: r.stop }; if (r.stop === 'OPENROUTER_KEY_DISABLED_OR_INVALID' || r.stop === 'FREE_ROUTER_NO_KEY') throw new Error(r.stop); continue; }
    const page = parse(r.content);
    if (!page) { feedback = 'the output was not valid JSON'; last = { fails: ['NOT_JSON'], model: r.model }; continue; }
    const q = check(page, { allowedFacts: FACTS });
    if (q.ok) return { ok: true, page: { route, query: ctx.query, ...escapePage(page) }, model: r.model, words: q.words, attempts: i + 1 };
    feedback = q.fails.slice(0, 8).join('; ');
    last = { fails: q.fails, model: r.model };
  }
  return { ok: false, last };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let todo = targets().filter((r) => !ONLY || r === ONLY).filter((r, i) => i % SHARD[1] === SHARD[0]);
  todo = todo.filter((r) => {
    const f = fileFor(r);
    if (!fs.existsSync(f)) return true;
    const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
    return RETRY_REFUSED && cur.status === 'refused';
  }).slice(0, LIMIT);
  let accepted = 0; let refused = 0;
  for (const route of todo) {
    const t0 = Date.now();
    let res;
    try { res = await rewrite(route); } catch (e) { console.error(`NAMED_STOP: ${e.message}`); process.exit(1); }
    const rec = res.ok
      ? { status: 'accepted', generated_at: new Date().toISOString(), model: res.model, words: res.words, attempts: res.attempts, page: res.page }
      : { status: 'refused', generated_at: new Date().toISOString(), route, last: res.last };
    fs.writeFileSync(fileFor(route), `${JSON.stringify(rec, null, 2)}\n`);
    if (res.ok) accepted += 1; else refused += 1;
    console.log(`${res.ok ? 'ACCEPT' : 'REFUSE'} ${route} ${Math.round((Date.now() - t0) / 1000)}s ${res.ok ? `${res.words}w ${res.model}` : JSON.stringify(res.last).slice(0, 200)}`);
  }
  console.log(`rewrite: ${todo.length} due, ${accepted} accepted, ${refused} refused`);
  if (todo.length && !accepted) process.exit(1);
})();
