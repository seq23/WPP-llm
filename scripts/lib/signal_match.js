/*
 * One place that knows how a signal record identifies the page and query it is
 * about.
 *
 * There was no such place, and the cost was total. retest_repairs.js matched
 * `r.query` and `r.page`; data/signals/gsc_query_signals.json emits
 * query_or_topic and target_route and has never carried either of those keys. So
 * hasAfterEvidence was permanently false, every repair aged out to INCONCLUSIVE
 * at the stale window, retest_outcomes.json held zero events, and the workflow
 * was green throughout. A field-name disagreement between a producer and a
 * consumer, with no shared definition to disagree against.
 *
 * Both sides also use different route shapes - the retest queue stores a path,
 * GSC stores an absolute URL - so normalising is part of matching, not a caller's
 * responsibility.
 */
'use strict';

function routePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let p = raw;
  if (/^https?:\/\//i.test(raw)) {
    try { p = new URL(raw).pathname; } catch { return ''; }
  }
  if (!p.startsWith('/')) p = `/${p}`;
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

// Every key either producer has used for the same thing. Read as a set so a
// rename costs one missed alias, not the whole stage.
const ROUTE_KEYS = ['target_route', 'target_page', 'page', 'route', 'url', 'own_url'];
const QUERY_KEYS = ['query_or_topic', 'query'];

function recordRoute(record) {
  for (const k of ROUTE_KEYS) if (record && record[k]) return routePath(record[k]);
  return '';
}

function recordQuery(record) {
  for (const k of QUERY_KEYS) if (record && record[k]) return String(record[k]).trim().toLowerCase();
  return '';
}

// A null query must never match a null query. Every technical repair queues with
// query: null, so treating null as a value would make one arbitrary signal record
// count as evidence for hundreds of unrelated repairs.
function matchesTarget(record, target) {
  const wantRoute = routePath(target && target.route);
  if (wantRoute && recordRoute(record) === wantRoute) return true;
  const wantQuery = String((target && target.query) || '').trim().toLowerCase();
  return Boolean(wantQuery) && recordQuery(record) === wantQuery;
}

function datedRecords(rows) {
  return (rows || []).filter((r) => r && r.observed_at && !Number.isNaN(new Date(r.observed_at).getTime()));
}

// The evidence question is always "did our URL appear at all", asked the same way
// of a GSC row and of a manual observation row.
function surfaced(rows) {
  return (rows || []).some((r) => r.own_url_surfaced === true || (r.clicks || 0) > 0 || (r.impressions || 0) > 0);
}

module.exports = { routePath, recordRoute, recordQuery, matchesTarget, datedRecords, surfaced, ROUTE_KEYS, QUERY_KEYS };
