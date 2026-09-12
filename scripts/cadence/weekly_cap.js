#!/usr/bin/env node
/**
 * The ONE computation of "how much of this week's publishing allowance is used".
 *
 * Why this file exists. On 2026-09-12 `CI - Build and Validate` went red on
 * `npm run cadence:gate` with:
 *
 *   BLOCK weekly_cap: 4 editorial URLs are new since the ledger was last
 *   accepted, cap is 2 per week
 *
 * while the publisher that created those four pages had been inside policy on
 * every run. It published 2 on 2026-09-05 and 2 on 2026-09-12; on each day its
 * trailing-7-day usage was 0 against a cap of 2. Both components read the same
 * data/cadence/policy.json, and both were right by their own arithmetic:
 *
 *   publisher (build_release_plan.js)  counted pages created in the trailing
 *                                      7 days, from data/releases/*velocity_ledger
 *   gate      (cadence_gate.js)        counted every URL absent from
 *                                      data/cadence/known_urls.json since a human
 *                                      last ran cadence:accept - 14 days earlier -
 *                                      and compared that lifetime total to a
 *                                      PER-WEEK figure
 *
 * Two components each keeping their own count of the same governed number, with
 * no link between them. The gate had no notion of a week, only "since
 * acceptance", so a publisher that obeyed 2/week for two weeks was guaranteed to
 * be blocked in week two, and the only exit was a human running cadence:accept
 * every seven days. The header of cadence_gate.js forbade CI from doing that,
 * for a good reason that no longer applied once the publisher was governed.
 *
 * What this does instead. One ledger, one window, one function:
 *
 *   - data/cadence/known_urls.json keeps `urls` (the baseline) and gains
 *     `first_seen: {url: date}` and `sources: {url: 'governed_release'|'accepted'}`
 *     for every URL added after this module landed. Nothing is reconstructed
 *     for the pre-existing baseline; a URL with no first_seen is baseline.
 *   - The release lane records what it created, here, in the same run, before
 *     its push gate runs the cadence gate. That is the release lane accepting
 *     its own pages - which is exactly what a governed publish IS - rather than
 *     leaving them for a human to accept a fortnight later.
 *   - `weeklyAllowance()` counts governed URLs whose first_seen falls inside the
 *     trailing 7-day window. The publisher takes its headroom from it BEFORE it
 *     stages anything; the gate takes its "used this week" from it and adds any
 *     editorial URL that appeared with no record at all. Same window, same
 *     ledger, same function, so the two cannot disagree.
 *
 * Human acceptance (cadence:accept) still exists for backlog that appeared
 * outside the publisher, still requires a reason, and is recorded as
 * source 'accepted'. It does not draw on the weekly allowance: it is the
 * deliberate override of the cap, with a name on it, not a use of it.
 *
 * scripts/validators/validate_cadence_cap_parity.js proves, on fixtures, that
 * the gate's verdict and the publisher's headroom are the same function of the
 * same ledger, and that the day-14 scenario above is CLEAR.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LEDGER_REL = 'data/cadence/known_urls.json';
const POLICY_REL = 'data/cadence/policy.json';
const WEEK_DAYS = 7;
const SOURCE_GOVERNED = 'governed_release';
const SOURCE_ACCEPTED = 'accepted';
// The canonical origin the sitemap builder writes (scripts/update_sitemap_all_html.js
// DOMAIN). A recorded URL has to match the sitemap byte-for-byte or the gate
// treats the page as ungoverned; validate_cadence_cap_parity checks that every
// governed URL is in the sitemap.
const SITE_ORIGIN = 'https://virtualagency-os.com';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayISO() {
  const override = String(process.env.CADENCE_TODAY || '').trim();
  return DATE.test(override) ? override : new Date().toISOString().slice(0, 10);
}

/** The trailing WEEK_DAYS dates ending on (and including) `endDate`. */
function trailingWindow(endDate) {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const out = [];
  for (let i = 0; i < WEEK_DAYS; i += 1) out.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
  return out;
}

function readLedger(ROOT) {
  const f = path.join(ROOT, LEDGER_REL);
  const empty = { exists: false, generated_at: null, urls: new Set(), first_seen: {}, sources: {} };
  if (!fs.existsSync(f)) return empty;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return empty; }
  if (!doc || !Array.isArray(doc.urls)) return empty;
  return {
    exists: true,
    generated_at: doc.generated_at || null,
    urls: new Set(doc.urls),
    first_seen: (doc.first_seen && typeof doc.first_seen === 'object') ? doc.first_seen : {},
    sources: (doc.sources && typeof doc.sources === 'object') ? doc.sources : {},
    _doc: doc,
  };
}

function writeLedger(ROOT, ledger, today) {
  const f = path.join(ROOT, LEDGER_REL);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const doc = {
    generated_at: today,
    _note: 'Baseline of URLs the cadence gate treats as existing. first_seen/sources are recorded for every URL added after 2026-09-12: source governed_release means the release lane created it inside policy and recorded it in the same run; source accepted means a human ran cadence:accept with a reason. URLs with no first_seen predate the record and are baseline. See scripts/cadence/weekly_cap.js.',
    urls: [...ledger.urls].sort(),
    first_seen: sortObj(ledger.first_seen || {}),
    sources: sortObj(ledger.sources || {}),
  };
  fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n');
  return doc;
}

function readCap(ROOT, policy) {
  if (policy && Number.isFinite(Number(policy.new_pages_per_week))) return Number(policy.new_pages_per_week);
  const f = path.join(ROOT, POLICY_REL);
  if (!fs.existsSync(f)) return NaN;
  try { return Number(JSON.parse(fs.readFileSync(f, 'utf8')).new_pages_per_week); } catch { return NaN; }
}

/**
 * Governed URLs first seen inside the trailing window ending `today`.
 * This is the only place "used this week" is defined.
 */
function governedInWindow(ledger, today) {
  const window = new Set(trailingWindow(today));
  return Object.entries(ledger.first_seen || {})
    .filter(([url, date]) => (ledger.sources || {})[url] === SOURCE_GOVERNED && window.has(date))
    .map(([url]) => url)
    .sort();
}

/**
 * { cap, used, headroom, window, used_urls, ledger }
 * `cap` is NaN when the policy declares no usable new_pages_per_week; callers
 * must refuse to publish in that state rather than treat it as unlimited.
 */
function weeklyAllowance(ROOT, opts = {}) {
  const today = opts.today || todayISO();
  const ledger = opts.ledger || readLedger(ROOT);
  const cap = readCap(ROOT, opts.policy);
  const usedUrls = governedInWindow(ledger, today);
  const used = usedUrls.length;
  const headroom = Number.isFinite(cap) ? Math.max(0, cap - used) : 0;
  return { today, cap, used, headroom, window: trailingWindow(today), used_urls: usedUrls, ledger };
}

/**
 * The release lane declaring what it just created. Refuses to record more than
 * the allowance permits: the record is the publisher's own admission that it
 * stayed inside the cap, so it cannot be used to launder an overrun.
 */
function recordGovernedPublication(ROOT, urls, opts = {}) {
  const today = opts.today || todayISO();
  const list = [...new Set(urls)].filter(Boolean);
  const ledger = readLedger(ROOT);
  if (!list.length) return { recorded: 0, ledger };
  const before = weeklyAllowance(ROOT, { today, ledger, policy: opts.policy });
  if (!Number.isFinite(before.cap)) {
    throw new Error(`cadence: ${POLICY_REL} declares no usable new_pages_per_week; refusing to record a governed publication against an unknown allowance`);
  }
  const fresh = list.filter((u) => !ledger.urls.has(u));
  if (before.used + fresh.length > before.cap) {
    throw new Error(`cadence: recording ${fresh.length} governed URL(s) would put this week at ${before.used + fresh.length} against a cap of ${before.cap}. The publisher must take its allowance from weeklyAllowance() before creating pages; this record cannot absorb an overrun.`);
  }
  for (const u of fresh) {
    ledger.urls.add(u);
    ledger.first_seen[u] = today;
    ledger.sources[u] = SOURCE_GOVERNED;
  }
  writeLedger(ROOT, ledger, today);
  return { recorded: fresh.length, urls: fresh, ledger };
}

/** A human accepting backlog: recorded as such, and outside the weekly allowance. */
function recordAcceptance(ROOT, urls, opts = {}) {
  const today = opts.today || todayISO();
  const ledger = readLedger(ROOT);
  const fresh = [...new Set(urls)].filter((u) => u && !ledger.urls.has(u));
  for (const u of fresh) {
    ledger.urls.add(u);
    ledger.first_seen[u] = today;
    ledger.sources[u] = SOURCE_ACCEPTED;
  }
  writeLedger(ROOT, ledger, today);
  return { recorded: fresh.length, urls: fresh, ledger };
}

function routeToUrl(route) {
  const clean = String(route || '').replace(/\.html$/, '');
  return SITE_ORIGIN + (clean === '' || clean === '/' ? '/' : (clean.startsWith('/') ? clean : `/${clean}`));
}

module.exports = {
  LEDGER_REL, POLICY_REL, WEEK_DAYS, SITE_ORIGIN, SOURCE_GOVERNED, SOURCE_ACCEPTED,
  todayISO, trailingWindow, readLedger, writeLedger, readCap, governedInWindow,
  weeklyAllowance, recordGovernedPublication, recordAcceptance, routeToUrl,
};
