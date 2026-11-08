'use strict';
/**
 * The one answer to "is this page part of the site?" (owner, 2 Nov 2026:
 * "consolidate pages - shouldn't have 2000 pages if they are not useful").
 *
 * WHY. Search Console impressions on virtualagency-os.com fell from ~100/day to
 * ~1/day on 25-26 Aug 2026 and never came back, while 1,512 of 2,300 sitemap
 * URLs stayed indexed: Google kept the pages and stopped showing them. 2,747
 * slot-filled /programmatic/ pages (two unrelated pages measured 63% identical)
 * is the site-level quality signal that matches that shape. Only ~240 of them
 * were ever shown to anyone or carry measured search demand.
 *
 * RULE (data/seo/prune_ledger.json, written by scripts/plan_prune.js from
 * committed evidence, so the decision is reproducible and reversible):
 *   kept      a /programmatic/ or /query-atlas/ page that Search Console showed
 *             at least KEEP_MIN_IMPRESSIONS times over its retained window
 *             (data/search_intelligence/page_impressions_lifetime.json, joined
 *             by trailing slug so root, /programmatic/ and /query-atlas/ twins
 *             all count), or whose query has measured demand
 *             (scripts/lib/demand_gate.js), or that is a configured demand page.
 *   redirect  every other page 301s to the strongest kept page of its topic
 *             cluster, else to its pillar hub. Equity concentrates instead of
 *             being spread over thousands of thin URLs.
 *   noindex   only a page with no cluster keeper and no pillar.
 *
 * The HTML of a pruned page stays in the repo (nothing is deleted); the deploy
 * leaves it out (scripts/assemble_pages_output.js isPublishedPath), the sitemap
 * drops it, the link architecture stops linking to it, and the release plan may
 * not recreate it. Only on-topic pages may return after earning evidence.
 *
 * The 301s are emitted into _redirects by scripts/update_redirects_clean_to_html.js,
 * prioritized within the static-rule budget; the Pages Function covers all entries.
 * The per-URL map is data/redirects/consolidation_map.json.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER_REL = 'data/seo/prune_ledger.json';
const LEDGER = path.join(ROOT, LEDGER_REL);
const KEEP_MIN_IMPRESSIONS = 5;
const PRUNABLE_PREFIXES = ['/programmatic/', '/query-atlas/', '/topics/'];

const norm = (r) => {
  let s = String(r || '').trim();
  try { if (/^https?:/.test(s)) s = new URL(s).pathname; } catch { /* path */ }
  s = s.replace(/\.html$/, '').replace(/\/index$/, '').replace(/\/+$/, '');
  return s || '/';
};

// Topic eligibility precedes traffic: generic production/platform/AI words are
// insufficient. Explicit event operations pages are retained by route identity.
// Plurals count: the search loop's first real page here was
// /questions/are-webinars-live-or-recorded (6 Nov 2026), which the singular-only
// pattern called off-topic, so the deploy left it out while the sitemap listed it
// and the release gate refused the push. No existing route changes side with the
// plural forms (checked across 2,996 routes and the prune ledger).
const EVENT_CONTEXT = /(?:^|[-/ ])(?:virtual|hybrid|online|events?|webinars?|conferences?|summits?|broadcasts?|livestreams?|run-of-show|town-halls?)(?:$|[-/ ])/i;
const EVENT_ROUTES = new Set(['streamyard-vs-livekit', 'software-vs-production-partner', 'west-peek-productions-fit', 'run-of-show-meaning', 'how-to-run-a-rehearsal-that-actually-prevents-disaster']);
function isOnTopic(route) {
  const slug = norm(route).split('/').pop();
  return EVENT_CONTEXT.test(slug) || EVENT_ROUTES.has(slug);
}

// Community as a service is the second way West Peek Productions helps (owner,
// 7 Nov 2026: "Two ways" on the home page; 7 Nov approval of three community
// answer pages and a search loop pointed at community topics). Before this the
// rule above was events only, so every community page 301'd to the virtual
// event production page and the home page's community links all landed there.
// In scope now: the hand-written community answers below, and search-loop
// question pages whose slug names a community. The ~40 old generated community
// pages stay retired (no evidence kept them) and fold into the matching answer.
const COMMUNITY_ANSWERS = {
  build: '/answers/how-to-build-a-community-around-your-business',
  staffing: '/answers/community-manager-vs-community-agency',
  growth: '/answers/what-is-community-led-growth',
};
const COMMUNITY_ROUTES = new Set(Object.values(COMMUNITY_ANSWERS));
const COMMUNITY_CONTEXT = /(?:^|[-/ ])communit(?:y|ies)(?:$|[-/ ])/i;
// A community word that means property management or civic work, not a brand
// or customer community (Google's own reading of "community management agency"
// and "community as a service", 7 Nov 2026 research).
const NOT_BRAND_COMMUNITY = /(?:^|-)(?:hoa|homeowners?|associations?|property|apartments?|service-hours|community-service|college|policing|health-workers?)(?:$|-)/i;
function isCommunityTopic(route) {
  const r = norm(route);
  if (COMMUNITY_ROUTES.has(r)) return true;
  const slug = r.split('/').pop();
  return /^\/questions\/[^/]+$/.test(r) && COMMUNITY_CONTEXT.test(slug) && !NOT_BRAND_COMMUNITY.test(slug);
}
/** Part of the site: an event production topic or a community topic. */
function isInScope(route) { return isOnTopic(route) || isCommunityTopic(route); }
function isOffTopic(route) {
  return /^\/(?:programmatic|query-atlas|answers|insights|learn|topics|questions)\/[^/]+$/.test(norm(route)) && !/\/index$/.test(String(route).replace(/\.html$/, '')) && !isInScope(route);
}
// Where a retired community page folds: the community answer for its subject.
function communityAnswerFor(slug) {
  if (/community-led|led-growth|(?:^|-)clg(?:$|-)/.test(slug)) return COMMUNITY_ANSWERS.growth;
  if (/manager|management|staff|outsourc|agency|in-house|hire|hiring|team|roles|cost|pricing|as-a-service|included|freelanc/.test(slug)) return COMMUNITY_ANSWERS.staffing;
  return COMMUNITY_ANSWERS.build;
}
function onTopicHub(route) {
  const s = norm(route);
  const slug = s.split('/').pop();
  if (!isOnTopic(route) && COMMUNITY_CONTEXT.test(slug.replace(/-/g, ' ')) && !NOT_BRAND_COMMUNITY.test(slug)) return communityAnswerFor(slug);
  if (/webinar/.test(s)) return '/programmatic/webinar-production';
  if (/hybrid/.test(s)) return '/programmatic/hybrid-event-production';
  return '/programmatic/virtual-event-production';
}

// The only off-site redirect targets: West Peek Productions' own service pages,
// the one main door (owner, 7 Nov 2026). test:prune checks every other target
// lands on a kept page here, and these only for one exact 301.
const OFF_SITE_DOORS = new Set(['https://westpeekproductions.com/community-as-a-service/']);
const isOffSiteDoor = (to) => OFF_SITE_DOORS.has(String(to || '').split('?')[0]);

let cache = null;
function load() {
  if (cache) return cache;
  const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { kept: [], redirects: [], noindex: [] };
  const redirectTo = new Map((ledger.redirects || []).map((r) => [norm(r.from), r.to]));
  const noindex = new Set((ledger.noindex || []).map((r) => norm(r.route || r)));
  cache = { ledger, redirectTo, noindex, kept: new Set((ledger.kept || []).map((r) => norm(r.route || r))) };
  return cache;
}

/** Pruned = not served as a page (301) or not indexed. */
function isRedirected(route) { return load().redirectTo.has(norm(route)); }
function isNoindexed(route) { return load().noindex.has(norm(route)); }
function isPruned(route) { return isOffTopic(route) || isRedirected(route) || isNoindexed(route); }
function redirectTarget(route) { return load().redirectTo.get(norm(route)) || null; }

/** True when a repo-relative file is a pruned page the deploy must leave out. */
function isRedirectedFile(rel) {
  const r = '/' + String(rel).replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!r.endsWith('.html')) return false;
  return isRedirected(r) || isOffTopic(r);
}

/** Follow a chain of rules (prune and any extra map) to the page it ends on. */
function finalTarget(to, extra = new Map()) {
  let cur = to;
  for (let i = 0; i < 10; i += 1) {
    const n = norm(cur);
    const next = extra.get(n) || load().redirectTo.get(n);
    if (!next || norm(next) === n) return cur;
    cur = next;
  }
  throw new Error(`prune: redirect loop through ${to}`);
}

function redirectRules() {
  return (load().ledger.redirects || []).map((r) => ({ from: norm(r.from), to: r.to, status: 301 }));
}

module.exports = {
  OFF_SITE_DOORS, isOffSiteDoor, ROOT, LEDGER, LEDGER_REL, KEEP_MIN_IMPRESSIONS, PRUNABLE_PREFIXES,
  isOnTopic, isOffTopic, isCommunityTopic, isInScope, COMMUNITY_ANSWERS, onTopicHub, norm, load, finalTarget, isRedirected, isNoindexed, isPruned, redirectTarget, isRedirectedFile, redirectRules,
  _reset() { cache = null; },
};
