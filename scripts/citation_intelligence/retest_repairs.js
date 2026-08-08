#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Delayed retest stage.
 *
 * State machine per entry in data/authority_scale/retest_queue.json:
 *   AWAITING_SEARCH_RESPONSE -> RETEST_ELIGIBLE -> RETESTED
 *
 * Outcomes (data/authority_scale/retest_outcomes.json): IMPROVED, UNCHANGED,
 * REGRESSED, INCONCLUSIVE. An outcome is only ever written from dated evidence
 * in data/signals/gsc_query_signals.json or data/signals/query_surface_observations.json.
 * Missing evidence never becomes a fabricated outcome; it stays queued, and only
 * converts to INCONCLUSIVE after a long stale window (evidence never arrived),
 * consistent with skip/record/continue rather than indefinite limbo.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const STALE_AFTER_DAYS = 45;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fallback; }
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(data, null, 2) + '\n');
}

function findEvidence(entry) {
  const gsc = readJson('data/signals/gsc_query_signals.json', { records: [] });
  const manual = readJson('data/signals/query_surface_observations.json', { records: [] });
  const repairedAt = new Date(entry.repaired_at).getTime();

  const gscAfter = (gsc.records || []).filter((r) => (r.query === entry.query || r.page === entry.route) && r.observed_at && new Date(r.observed_at).getTime() > repairedAt);
  const manualAfter = (manual.records || []).filter((r) => (r.query === entry.query || r.target_page === entry.route) && new Date(r.observed_at).getTime() > repairedAt);
  const manualBefore = (manual.records || []).filter((r) => (r.query === entry.query || r.target_page === entry.route) && new Date(r.observed_at).getTime() <= repairedAt);
  const gscBefore = (gsc.records || []).filter((r) => (r.query === entry.query || r.page === entry.route) && r.observed_at && new Date(r.observed_at).getTime() <= repairedAt);

  return { gscAfter, manualAfter, manualBefore, gscBefore };
}

function surfaced(rows) {
  return rows.some((r) => r.own_url_surfaced === true || (r.clicks || 0) > 0 || (r.impressions || 0) > 0);
}
function activelyChecked(rows) {
  return rows.length > 0;
}

function main() {
  const queue = readJson('data/authority_scale/retest_queue.json', { entries: [] });
  const outcomes = readJson('data/authority_scale/retest_outcomes.json', { events: [] });
  const now = Date.now();
  let promoted = 0;
  let retested = 0;
  let staleClosed = 0;

  for (const entry of queue.entries || []) {
    if (entry.state === 'AWAITING_SEARCH_RESPONSE' && new Date(entry.retest_not_before).getTime() <= now) {
      entry.state = 'RETEST_ELIGIBLE';
      promoted++;
    }
    if (entry.state !== 'RETEST_ELIGIBLE') continue;

    const ev = findEvidence(entry);
    const hasAfterEvidence = activelyChecked(ev.gscAfter) || activelyChecked(ev.manualAfter);

    if (!hasAfterEvidence) {
      const ageDays = (now - new Date(entry.retest_not_before).getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays >= STALE_AFTER_DAYS) {
        outcomes.events.push({ route: entry.route, query: entry.query, repair_id: entry.repair_id, outcome: 'INCONCLUSIVE', reason: 'no_evidence_arrived_within_stale_window', evaluated_at: new Date().toISOString(), evidence_before: [], evidence_after: [] });
        entry.state = 'RETESTED';
        entry.outcome = 'INCONCLUSIVE';
        staleClosed++;
      }
      continue; // otherwise stay RETEST_ELIGIBLE; no fabrication
    }

    const wasSurfacingBefore = surfaced(ev.manualBefore) || surfaced(ev.gscBefore);
    const isSurfacingAfter = surfaced(ev.gscAfter) || surfaced(ev.manualAfter);
    let outcome;
    if (isSurfacingAfter && !wasSurfacingBefore) outcome = 'IMPROVED';
    else if (isSurfacingAfter && wasSurfacingBefore) outcome = 'UNCHANGED';
    else if (!isSurfacingAfter && wasSurfacingBefore) outcome = 'REGRESSED';
    else outcome = 'INCONCLUSIVE';

    outcomes.events.push({
      route: entry.route,
      query: entry.query,
      repair_id: entry.repair_id,
      outcome,
      evaluated_at: new Date().toISOString(),
      evidence_before: [...ev.gscBefore, ...ev.manualBefore].slice(0, 5),
      evidence_after: [...ev.gscAfter, ...ev.manualAfter].slice(0, 5)
    });
    entry.state = 'RETESTED';
    entry.outcome = outcome;
    retested++;
  }

  queue.updated_at = new Date().toISOString();
  outcomes.updated_at = new Date().toISOString();
  writeJson('data/authority_scale/retest_queue.json', queue);
  writeJson('data/authority_scale/retest_outcomes.json', outcomes);
  console.log(`Retest sweep: ${promoted} promoted to RETEST_ELIGIBLE, ${retested} retested from real evidence, ${staleClosed} closed INCONCLUSIVE after stale window.`);
}

main();
