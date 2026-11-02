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
 * not recreate it. Re-planning after a page earns impressions brings it back.
 *
 * The 301s are emitted into _redirects by scripts/update_redirects_clean_to_html.js,
 * compressed to one splat per slug prefix (Pages allows 2,000 static and 100
 * dynamic rules; the per-URL map is data/redirects/consolidation_map.json).
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
function isPruned(route) { return isRedirected(route) || isNoindexed(route); }
function redirectTarget(route) { return load().redirectTo.get(norm(route)) || null; }

/** True when a repo-relative file is a pruned page the deploy must leave out. */
function isRedirectedFile(rel) {
  const r = '/' + String(rel).replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!r.endsWith('.html')) return false;
  return isRedirected(r);
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
  ROOT, LEDGER, LEDGER_REL, KEEP_MIN_IMPRESSIONS, PRUNABLE_PREFIXES,
  norm, load, finalTarget, isRedirected, isNoindexed, isPruned, redirectTarget, isRedirectedFile, redirectRules,
  _reset() { cache = null; },
};
