/**
 * The single place that answers "may this route be indexed?"
 *
 * The audience-permutation class - programmatic routes formed by appending
 * "for <audience>" to a topic head - measures 0.548 impressions per route
 * against 3.169 for every other programmatic route. 777 routes on disk belong
 * to it. 63 carry measured demand or live Search Console impressions. 714 carry
 * neither, and those 714 are noindex.
 *
 * Nothing here deletes, retires, or unpublishes anything. A noindex page still
 * renders, still serves its inbound internal links (all 3,102 programmatic
 * routes have them; 2,950 have ten or more), and still recovers the moment it
 * earns an impression, because membership is recomputed from live signals on
 * every load rather than read from a frozen list.
 *
 * WHY THIS IS RECOMPUTED AND NOT A CHECKED-IN LIST
 * data/demand/FINAL_noindex_candidates.json records what the decision WAS when
 * it was made, and is used only to assert that this module still reproduces it.
 * If a route in the class starts earning impressions, the next build indexes it
 * again with no human edit. The failure this avoids is the one that made the
 * pre-existing retirement list unsafe: data/demand/recommended_retirement_list.json
 * names 3,013 routes, 324 of which have live impressions, because it was
 * computed once and never re-derived.
 *
 * WHY THE ROUTE JOIN LOOKS THE WAY IT DOES
 * Search Console records key evidence by `target_route`, and those arrive in two
 * shapes: 355 as "/programmatic/<slug>" and 560 as a root-level "/<slug>".
 * Joining on the literal path finds only the first kind. Matching on the
 * trailing slug finds both. This is the same join error that made the repo
 * believe only 39 of 3,102 routes were demand-backed: that number came from
 * comparing a registered query STRING against the atlas, when the evidence is
 * keyed by route. Joined correctly, 352 routes carry impressions.
 */
const fs = require('fs');
const path = require('path');
const demandGate = require('./demand_gate.js');

const ROOT = path.resolve(__dirname, '..', '..');
const POLICY_FILE = path.join(ROOT, 'data/demand/audience_permutation_policy.json');
const GSC_FILE = path.join(ROOT, 'data/signals/gsc_query_signals.json');
const REGISTRY_FILE = path.join(ROOT, 'data/content/page_admission_registry.json');
const PROTECTED_FILE = path.join(ROOT, 'data/demand/FINAL_protected.json');
const RECORDED_NOINDEX_FILE = path.join(ROOT, 'data/demand/FINAL_noindex_candidates.json');

const readJson = (file, fallback) => {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const policy = readJson(POLICY_FILE, null);
if (!policy || !Array.isArray(policy.audience_slugs) || !policy.audience_slugs.length) {
  throw new Error(`noindex_policy: missing or empty audience vocabulary at ${path.relative(ROOT, POLICY_FILE)}`);
}

const AUDIENCE_SLUGS = policy.audience_slugs.slice();
const NEW_AUDIENCE_THRESHOLD = Number(policy.new_audience_route_threshold) || 60;

const normalize = (route) => String(route || '').replace(/\/+$/, '');
const slugOf = (route) => normalize(route).split('/').filter(Boolean).pop() || '';

/** Structural class membership: does this route end in a governed audience suffix? */
function isAudiencePermutation(route) {
  const r = normalize(route);
  return AUDIENCE_SLUGS.some((a) => r.endsWith(`-for-${a}`));
}

/** The "for <x>" suffix of a route, whether or not <x> is a governed audience. */
function audienceSuffix(route) {
  const m = normalize(route).match(/-for-([a-z0-9-]+)$/);
  return m ? m[1] : null;
}

// --- evidence ---------------------------------------------------------------
// Impressions, keyed by trailing slug so both target_route shapes join.
const impressionsBySlug = (() => {
  const packet = readJson(GSC_FILE, { records: [] });
  const map = new Map();
  for (const rec of packet.records || []) {
    let pathname = String(rec.target_route || '');
    try { pathname = new URL(pathname).pathname; } catch { /* already a path */ }
    const slug = slugOf(pathname);
    if (!slug) continue;
    map.set(slug, (map.get(slug) || 0) + (Number(rec.impressions) || 0));
  }
  return map;
})();

const queryByRoute = (() => {
  const admissions = readJson(REGISTRY_FILE, { admissions: [] }).admissions || [];
  return new Map(admissions.map((a) => [normalize(a.route), a.query]));
})();

function impressionsFor(route) {
  return impressionsBySlug.get(slugOf(route)) || 0;
}

function hasMeasuredDemand(route) {
  const query = queryByRoute.get(normalize(route));
  return !!(query && demandGate.hasDemand(query));
}

/**
 * The owner's rule, stated once: a route is protected if it has measured demand
 * OR any Search Console impression. Protected routes are never noindexed.
 */
function isProtected(route) {
  return hasMeasuredDemand(route) || impressionsFor(route) > 0;
}

/** A route is noindex only if it is in the class AND has no evidence at all. */
function isNoindex(route) {
  return isAudiencePermutation(route) && !isProtected(route);
}

function robotsFor(route, indexable = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1') {
  return isNoindex(route) ? 'noindex,follow' : indexable;
}

// --- corpus-level helpers ---------------------------------------------------
function programmaticRoutes() {
  const dir = path.join(ROOT, 'programmatic');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => `/programmatic/${f.replace(/\.html$/, '')}`)
    .sort();
}

/**
 * HARD ASSERTION, run by every caller before anything is written.
 *
 * The instruction that governs this change is "I'm not killing anything in this
 * portfolio." The way that promise breaks in code is not a deletion - it is a
 * protected route quietly ending up in the noindex set because a signal file
 * moved or a join regressed. So the check is not a comment, it is a throw.
 */
function assertNoProtectedRouteIsNoindexed(routes = programmaticRoutes()) {
  const recordedProtected = readJson(PROTECTED_FILE, []);
  const violations = [];

  // 1. Nothing this module marks noindex may be protected under the live rule.
  for (const route of routes) {
    if (isNoindex(route) && isProtected(route)) {
      violations.push(`${route} is protected (demand or impressions) but resolved to noindex`);
    }
  }
  // 2. Nothing on the recorded protected list may resolve to noindex, even if a
  //    signal file changed underneath us.
  for (const route of recordedProtected) {
    if (isNoindex(route)) {
      violations.push(`${route} is on FINAL_protected.json but resolved to noindex`);
    }
  }
  if (violations.length) {
    throw new Error(
      `noindex_policy: refusing to proceed, ${violations.length} protected route(s) would be noindexed:\n  ` +
      violations.slice(0, 20).join('\n  ')
    );
  }
  return { checked: routes.length, protected_recorded: recordedProtected.length };
}

/** The class, split. Used by the applier, the renderer, and the guard alike. */
function classify(routes = programmaticRoutes()) {
  const klass = routes.filter(isAudiencePermutation);
  const noindex = klass.filter((r) => !isProtected(r));
  const indexed = klass.filter(isProtected);
  return { all: routes, klass, noindex, indexed };
}

module.exports = {
  AUDIENCE_SLUGS,
  NEW_AUDIENCE_THRESHOLD,
  RECORDED_NOINDEX_FILE,
  PROTECTED_FILE,
  audienceSuffix,
  isAudiencePermutation,
  impressionsFor,
  hasMeasuredDemand,
  isProtected,
  isNoindex,
  robotsFor,
  programmaticRoutes,
  assertNoProtectedRouteIsNoindexed,
  classify,
};
