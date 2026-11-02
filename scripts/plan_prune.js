#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Writes data/seo/prune_ledger.json: which /programmatic/, /query-atlas/ and
 * /topics/ pages stay, and where every other one 301s. The rule and its reason
 * are in scripts/lib/prune.js. Deterministic: committed evidence in, ledger out.
 *
 *   node scripts/plan_prune.js           write the ledger
 *   node scripts/plan_prune.js --check   exit 1 if the committed ledger is stale
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, LEDGER, LEDGER_REL, KEEP_MIN_IMPRESSIONS, norm } = require('./lib/prune.js');
const demandGate = require('./lib/demand_gate.js');

const readJson = (rel, fb) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf8')) : fb;
};
const slugOf = (r) => norm(r).split('/').pop();

// Evidence: impressions by trailing slug, the larger of each source.
const imp = new Map();
const bump = (url, n) => {
  const s = slugOf(url);
  if (!s || s === '/') return;
  imp.set(s, Math.max(imp.get(s) || 0, Number(n) || 0));
};
const lifetimeBySlug = new Map();
for (const p of readJson('data/search_intelligence/page_impressions_lifetime.json', { pages: [] }).pages || []) {
  const s = slugOf(p.page);
  lifetimeBySlug.set(s, (lifetimeBySlug.get(s) || 0) + (Number(p.impressions) || 0));
}
for (const [s, n] of lifetimeBySlug) bump(`/${s}`, n);
for (const p of readJson('data/search_intelligence/gsc_truth.json', {}).page_history || []) bump(p.page, p.impressions_best_window);
const sig = new Map();
for (const r of readJson('data/signals/gsc_query_signals.json', { records: [] }).records || []) {
  const s = slugOf(r.target_route);
  sig.set(s, (sig.get(s) || 0) + (Number(r.impressions) || 0));
}
for (const [s, n] of sig) bump(`/${s}`, n);

const admissions = new Map();
for (const a of readJson('data/content/page_admission_registry.json', { admissions: [] }).admissions || []) {
  if (!admissions.has(norm(a.route))) admissions.set(norm(a.route), a);
}
const demandFiles = new Set((readJson('data/seo/demand_pages.json', { pages: [] }).pages || []).map((p) => norm(p.route)));

function pagesIn(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((n) => n.endsWith('.html') && n !== 'index.html').sort()
    .map((n) => ({ route: `/${dir}/${n.replace(/\.html$/, '')}`, file: `${dir}/${n}` }));
}

function clusterOf(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const crumb = html.match(/<!--link-arch:breadcrumb-->([\s\S]*?)<!--\/link-arch:breadcrumb-->/);
  const scope = crumb ? crumb[1] : html;
  const m = scope.match(/href="\/topics\/([a-z0-9-]+)"/);
  // "unclustered" is the link architecture's bucket for pages it could not
  // place: not a topic, so it never decides where a page folds.
  return m && m[1] !== 'unclustered' ? m[1] : null;
}

// Pillar hubs: pillars/<p>.html answers at /pillars/<p>; pillars/<p>/index.html
// at /pillars/<p>/ (Pages 308s the slashless form, so the target carries it).
const PILLAR_ALIAS = { community: 'community-as-a-service', authority: 'agency-decisions' };
function pillarRoute(p) {
  const key = PILLAR_ALIAS[p] || p;
  if (!key) return null;
  if (fs.existsSync(path.join(ROOT, 'pillars', `${key}.html`))) return `/pillars/${key}`;
  if (fs.existsSync(path.join(ROOT, 'pillars', key, 'index.html'))) return `/pillars/${key}/`;
  return null;
}

// The site is about virtual and hybrid event production (owner review, 2 Nov
// 2026). Answer, insight and learn pages stay when they are on that subject or
// carry evidence; an off-topic one with neither folds into its topic like the rest.
const ON_TOPIC = /virtual|hybrid|webinar|event|summit|conference|broadcast|town-?hall|speaker|livestream|stream|production|run-of-show|rehears|platform|moderat|backup/;
const SECONDARY = new Set(['answers', 'insights', 'learn']);
const candidates = [...pagesIn('programmatic'), ...pagesIn('query-atlas'), ...pagesIn('answers'), ...pagesIn('insights'), ...pagesIn('learn')].map((p) => {
  const a = admissions.get(p.route) || admissions.get(`/programmatic/${slugOf(p.route)}`) || {};
  const query = a.query || slugOf(p.route).replace(/-/g, ' ');
  const impressions = imp.get(slugOf(p.route)) || 0;
  const demand = !!(demandGate.hasDemand(query) || (a.query && demandGate.hasDemand(a.query)));
  const reasons = [];
  if (impressions >= KEEP_MIN_IMPRESSIONS) reasons.push(`impressions:${impressions}`);
  if (demand) reasons.push('measured_demand');
  if (demandFiles.has(p.route)) reasons.push('demand_page');
  if (SECONDARY.has(p.route.split('/')[1]) && ON_TOPIC.test(slugOf(p.route))) reasons.push('on_topic');
  return { ...p, query, impressions, demand, cluster: clusterOf(p.file), pillar: a.pillar || null, keep: reasons.length > 0, reasons };
});

// A query-atlas page whose /programmatic/ twin is kept is the same topic in a
// thinner format: fold it into the twin rather than keep two pages.
const keptProg = new Set(candidates.filter((c) => c.keep && c.route.startsWith('/programmatic/')).map((c) => c.route));
for (const c of candidates) {
  if (c.keep && c.route.startsWith('/query-atlas/') && keptProg.has(`/programmatic/${slugOf(c.route)}`)) {
    c.keep = false;
    c.twin = `/programmatic/${slugOf(c.route)}`;
  }
}

const strength = (c) => [c.reasons.includes('demand_page') ? 1 : 0, c.impressions, c.demand ? 1 : 0, -c.route.length];
const stronger = (a, b) => {
  const x = strength(a); const y = strength(b);
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] > y[i] ? a : b;
  return a.route < b.route ? a : b;
};
const keeperOfCluster = new Map();
const pillarOfCluster = new Map();
// A cluster's pillar is the one most of its pages were admitted under;
// "authority" is the catch-all admission label, so it only counts when nothing
// else does.
const pillarVotes = new Map();
for (const c of candidates) {
  if (!c.cluster || !c.pillar) continue;
  const v = pillarVotes.get(c.cluster) || {};
  v[c.pillar] = (v[c.pillar] || 0) + (c.pillar === 'authority' ? 0.001 : 1);
  pillarVotes.set(c.cluster, v);
}
for (const [cl, v] of pillarVotes) pillarOfCluster.set(cl, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]);
for (const c of candidates) {
  if (!c.keep || !c.cluster || !c.route.startsWith('/programmatic/')) continue;
  const cur = keeperOfCluster.get(c.cluster);
  keeperOfCluster.set(c.cluster, cur ? stronger(cur, c) : c);
}

// No keeper in the topic cluster: the kept page sharing the longest run of
// leading slug words (at least three) is the same subject.
const keptList = candidates.filter((c) => c.keep && c.route.startsWith('/programmatic/'));
function nearestKept(c) {
  const words = slugOf(c.route).split('-');
  for (let n = words.length - 1; n >= 2; n -= 1) {
    const prefix = words.slice(0, n).join('-');
    // Two words are a topic only when a kept page is exactly that topic
    // (webinar-production-services -> webinar-production).
    const hits = keptList.filter((k) => slugOf(k.route) === prefix || (n >= 3 && slugOf(k.route).startsWith(`${prefix}-`)));
    const exact = hits.find((k) => slugOf(k.route) === prefix);
    if (hits.length) return { route: (exact || hits.reduce(stronger)).route, prefix: prefix.replace(/-/g, ' ') };
  }
  return null;
}

const kept = [];
const redirects = [];
const noindex = [];
for (const c of candidates) {
  if (c.keep) { kept.push({ route: c.route, reasons: c.reasons }); continue; }
  if (c.twin) { redirects.push({ from: c.route, to: c.twin, reason: 'query-atlas twin of a kept page' }); continue; }
  const keeper = c.cluster && keeperOfCluster.get(c.cluster);
  if (keeper && keeper.route !== c.route) { redirects.push({ from: c.route, to: keeper.route, reason: `topic ${c.cluster}: strongest kept page` }); continue; }
  const near = nearestKept(c);
  if (near) { redirects.push({ from: c.route, to: near.route, reason: `shares the topic words "${near.prefix}" with a kept page` }); continue; }
  const pillar = pillarRoute(pillarOfCluster.get(c.cluster) || c.pillar);
  if (pillar) { redirects.push({ from: c.route, to: pillar, reason: `no kept page in topic ${c.cluster || '(none)'}: pillar hub` }); continue; }
  if (/community/.test(slugOf(c.route)) && pillarRoute('community')) { redirects.push({ from: c.route, to: pillarRoute('community'), reason: 'community topic: community pillar hub' }); continue; }
  const section = c.route.split('/')[1];
  if (section !== 'query-atlas' && fs.existsSync(path.join(ROOT, section, 'index.html'))) { redirects.push({ from: c.route, to: `/${section}/`, reason: `off-topic, no evidence, no topic match: the ${section} index` }); continue; }
  noindex.push({ route: c.route, reason: 'no kept page in its topic and no pillar' });
}

// Topic hubs whose topic kept nothing: fold into the pillar.
for (const t of pagesIn('topics')) {
  const c = slugOf(t.route);
  if (keeperOfCluster.has(c)) continue;
  const pillar = pillarRoute(pillarOfCluster.get(c));
  if (pillar) redirects.push({ from: t.route, to: pillar, reason: 'topic with no kept page: pillar hub' });
}

const ledger = {
  schema_version: '1.0',
  rule: `Kept: >= ${KEEP_MIN_IMPRESSIONS} lifetime Search Console impressions (slug-joined), measured demand, or a demand page. ` +
    'Everything else 301s to the strongest kept page of its topic, else its pillar hub; noindex only with neither. See scripts/lib/prune.js.',
  evidence: ['data/search_intelligence/page_impressions_lifetime.json', 'data/search_intelligence/gsc_truth.json',
    'data/signals/gsc_query_signals.json', 'data/authority_scale/query_atlas.json + data/demand/measured_demand.json (demand_gate)',
    'data/seo/demand_pages.json'],
  counts: { candidates: candidates.length, kept: kept.length, redirects: redirects.length, noindex: noindex.length },
  kept: kept.sort((a, b) => a.route.localeCompare(b.route)),
  redirects: redirects.sort((a, b) => a.from.localeCompare(b.from)),
  noindex: noindex.sort((a, b) => a.route.localeCompare(b.route)),
};
const out = `${JSON.stringify(ledger, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8') : '';
  if (cur !== out) { console.error(`${LEDGER_REL} is stale: run node scripts/plan_prune.js`); process.exit(1); }
  console.log(`${LEDGER_REL} current: ${JSON.stringify(ledger.counts)}`);
} else {
  if (kept.length < 50) { console.error(`plan_prune: only ${kept.length} kept pages; refusing to write a ledger that empties the site`); process.exit(1); }
  fs.writeFileSync(LEDGER, out);
  console.log(`${LEDGER_REL}: ${JSON.stringify(ledger.counts)}`);
  // Legacy 404 rules that land on a page consolidated here are re-pointed at
  // the page it folds into, in their own data file, so _redirects and
  // validate_redirect_targets.js keep one source per rule and no rule chains.
  const prune = require('./lib/prune.js');
  prune._reset();
  const legacyRel = 'data/redirects/legacy_404_redirects.json';
  const legacy = readJson(legacyRel, null);
  if (legacy && Array.isArray(legacy.rules)) {
    let moved = 0;
    for (const r of legacy.rules) {
      const to = prune.finalTarget(r.to);
      if (to !== r.to) { r.to = to; moved += 1; }
    }
    fs.writeFileSync(path.join(ROOT, legacyRel), `${JSON.stringify(legacy, null, 2)}\n`);
    console.log(`${legacyRel}: ${moved} rule(s) re-pointed past a consolidated page`);
  }
}
