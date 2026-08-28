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
// Overridable so the retest-loop contract test can drive the real script against
// a fixture data tree instead of a copy of its logic. Production never sets it.
const ROOT = process.env.RETEST_DATA_ROOT ? path.resolve(process.env.RETEST_DATA_ROOT) : path.resolve(__dirname, '../..');
const STALE_AFTER_DAYS = 45;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fallback; }
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(data, null, 2) + '\n');
}

/*
 * Route and query matching now lives in scripts/lib/signal_match.js, shared with
 * apply_repairs.js so the producer of a queue entry and the consumer of it cannot
 * drift apart again.
 *
 * What was wrong: this file matched `r.query` and `r.page`. Neither key exists in
 * data/signals/gsc_query_signals.json - its 915 records carry query_or_topic and
 * target_route, and records with a `page` field number zero. Queue entries also
 * carry "query": null. So both sides of every `||` were permanently false,
 * hasAfterEvidence was permanently false, every repair aged out to INCONCLUSIVE
 * at the 45-day stale window, retest_outcomes.json held zero events, and the
 * workflow was green throughout.
 */
const match = require('../lib/signal_match.js');
const { routePath, recordRoute, matchesTarget, datedRecords, surfaced } = match;

function findEvidence(entry, sources) {
  const { gsc, manual } = sources;
  const repairedAt = new Date(entry.repaired_at).getTime();
  const split = (rows) => {
    const mine = datedRecords(rows).filter((r) => matchesTarget(r, entry));
    return {
      after: mine.filter((r) => new Date(r.observed_at).getTime() > repairedAt),
      before: mine.filter((r) => new Date(r.observed_at).getTime() <= repairedAt),
    };
  };
  const g = split(gsc.records);
  const m = split(manual.records);
  // The baseline captured by apply_repairs.js at the moment the repair was made.
  //
  // data/signals/gsc_query_signals.json is a single-day snapshot that each
  // collection overwrites - every one of its 915 records is dated the day it was
  // written - so a "before" row for a repair made weeks ago can never appear in
  // it. Without a baseline stored at repair time there is no before side at all,
  // and the contract's truth rule forbids calling that IMPROVED.
  const baseline = datedRecords(entry.baseline_evidence || []);
  return {
    gscAfter: g.after,
    gscBefore: g.before,
    manualAfter: m.after,
    manualBefore: m.before,
    baselineBefore: baseline,
  };
}

function activelyChecked(rows) {
  return rows.length > 0;
}

function main() {
  const queue = readJson('data/authority_scale/retest_queue.json', { entries: [] });
  const outcomes = readJson('data/authority_scale/retest_outcomes.json', { events: [] });
  // Read once, not once per entry: this used to re-parse a 915-record file twice
  // for every queued repair.
  const sources = {
    gsc: readJson('data/signals/gsc_query_signals.json', { records: [] }),
    manual: readJson('data/signals/query_surface_observations.json', { records: [] }),
  };
  const now = Date.now();
  let promoted = 0;
  let retested = 0;
  let staleClosed = 0;
  let eligible = 0;
  let awaitingEvidence = 0;
  const staleNamed = [];
  const outcomeCounts = {};

  for (const entry of queue.entries || []) {
    if (entry.state === 'AWAITING_SEARCH_RESPONSE' && new Date(entry.retest_not_before).getTime() <= now) {
      entry.state = 'RETEST_ELIGIBLE';
      promoted++;
    }
    if (entry.state !== 'RETEST_ELIGIBLE') continue;
    eligible++;

    const ev = findEvidence(entry, sources);
    const hasAfterEvidence = activelyChecked(ev.gscAfter) || activelyChecked(ev.manualAfter);

    if (!hasAfterEvidence) {
      const ageDays = (now - new Date(entry.retest_not_before).getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays >= STALE_AFTER_DAYS) {
        // INCONCLUSIVE is the already-known outcome value; what was missing was
        // anyone being able to see it happen. An aged-out repair is now named
        // individually on stdout and counted in the sweep summary, so "no
        // evidence ever arrived for these 40 repairs" is a reportable fact
        // rather than a silent state change inside a JSON file.
        outcomes.events.push({
          route: entry.route, query: entry.query, repair_id: entry.repair_id,
          outcome: 'INCONCLUSIVE',
          reason: 'no_evidence_arrived_within_stale_window',
          stale_after_days: STALE_AFTER_DAYS,
          age_days: Number(ageDays.toFixed(1)),
          evaluated_at: new Date().toISOString(), evidence_before: [], evidence_after: [],
        });
        entry.state = 'RETESTED';
        entry.outcome = 'INCONCLUSIVE';
        staleClosed++;
        outcomeCounts.INCONCLUSIVE = (outcomeCounts.INCONCLUSIVE || 0) + 1;
        staleNamed.push({ route: entry.route, repair_id: entry.repair_id, age_days: Number(ageDays.toFixed(1)) });
        continue;
      }
      awaitingEvidence++;
      continue; // otherwise stay RETEST_ELIGIBLE; no fabrication
    }

    // The contract's truth rule: "IMPROVED/REGRESSED require dated before and
    // after evidence for the same route/query." So a missing before side is not
    // a before side of "no". Once the field match was fixed, seven repairs had
    // after-evidence and no before-evidence at all, and the old branch order
    // would have called every one of them IMPROVED - trading a loop that never
    // recorded anything for a loop that records flattery. INCONCLUSIVE with a
    // named reason is the honest verdict, and the after-side observation is kept
    // on the event so the reading is not lost.
    const beforeRows = [...ev.baselineBefore, ...ev.gscBefore, ...ev.manualBefore];
    const afterRows = [...ev.gscAfter, ...ev.manualAfter];
    const hasBeforeEvidence = activelyChecked(beforeRows);
    const wasSurfacingBefore = surfaced(beforeRows);
    const isSurfacingAfter = surfaced(afterRows);
    let outcome;
    let reason;
    if (!hasBeforeEvidence) {
      outcome = 'INCONCLUSIVE';
      reason = 'after_evidence_only_no_dated_before_baseline';
    } else if (isSurfacingAfter && !wasSurfacingBefore) outcome = 'IMPROVED';
    else if (isSurfacingAfter && wasSurfacingBefore) outcome = 'UNCHANGED';
    else if (!isSurfacingAfter && wasSurfacingBefore) outcome = 'REGRESSED';
    else { outcome = 'INCONCLUSIVE'; reason = 'neither_side_surfaced'; }

    outcomes.events.push({
      route: entry.route,
      query: entry.query,
      repair_id: entry.repair_id,
      outcome,
      ...(reason ? { reason } : {}),
      evaluated_at: new Date().toISOString(),
      before_evidence_present: hasBeforeEvidence,
      surfacing_before: hasBeforeEvidence ? wasSurfacingBefore : null,
      surfacing_after: isSurfacingAfter,
      evidence_before: beforeRows.slice(0, 5),
      evidence_after: afterRows.slice(0, 5)
    });
    entry.state = 'RETESTED';
    entry.outcome = outcome;
    retested++;
    outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
  }

  // Schema-drift guard.
  //
  // This is the assertion that would have caught the original bug on the day it
  // was introduced. If there are eligible repairs and there are dated signal
  // records, but not a single record matches any queued route by any alias, then
  // the two sides are no longer speaking about the same thing - which is exactly
  // the state that produced zero recorded outcomes for months while the workflow
  // stayed green. Silence is not allowed to be the reported result of that.
  const eligibleRoutes = new Set((queue.entries || []).filter((e) => e.state === 'RETEST_ELIGIBLE' || e.state === 'RETESTED').map((e) => routePath(e.route)).filter(Boolean));
  const allRecords = [...(sources.gsc.records || []), ...(sources.manual.records || [])];
  const matchableRecords = allRecords.filter((r) => eligibleRoutes.has(recordRoute(r))).length;
  if (eligibleRoutes.size && allRecords.length && matchableRecords === 0) {
    console.error(`Retest sweep: SCHEMA DRIFT - ${allRecords.length} signal record(s) and ${eligibleRoutes.size} queued route(s), but no record's route matches any queued route.`);
    console.error('  Signal record keys seen: ' + [...new Set(allRecords.slice(0, 200).flatMap((r) => Object.keys(r)))].join(', '));
    console.error('  Nothing can ever be retested in this state. Fix the field mapping in recordRoute()/recordQuery() rather than letting repairs age out to INCONCLUSIVE.');
    process.exit(1);
  }

  const stop = retested || staleClosed || promoted
    ? null
    : (eligible
      ? { reason: 'AWAITING_EVIDENCE', detail: `${eligible} repair(s) eligible; no dated signal observed after their repair timestamp yet, and none has reached the ${STALE_AFTER_DAYS}-day stale window` }
      : { reason: 'NO_ELIGIBLE_REPAIRS', detail: `${(queue.entries || []).length} queue entr(ies), none in RETEST_ELIGIBLE` });

  queue.updated_at = new Date().toISOString();
  outcomes.updated_at = new Date().toISOString();
  // The sweep's own result, recorded rather than only printed, so an outcome of
  // "nothing happened" is inspectable after the run instead of living in logs.
  outcomes.last_sweep = {
    swept_at: new Date().toISOString(),
    eligible,
    promoted,
    retested_from_evidence: retested,
    closed_inconclusive_stale: staleClosed,
    still_awaiting_evidence: awaitingEvidence,
    signal_records_matching_queue_routes: matchableRecords,
    outcomes_recorded: outcomeCounts,
    aged_out_inconclusive: staleNamed.slice(0, 50),
    stop_reason: stop ? stop.reason : null,
    stop_detail: stop ? stop.detail : null,
  };
  writeJson('data/authority_scale/retest_queue.json', queue);
  writeJson('data/authority_scale/retest_outcomes.json', outcomes);

  for (const s of staleNamed) {
    console.log(`  INCONCLUSIVE (aged out at ${s.age_days}d) ${s.repair_id} ${s.route} - no evidence ever arrived`);
  }
  const breakdown = Object.entries(outcomeCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
  console.log(`Retest sweep: ${promoted} promoted to RETEST_ELIGIBLE, ${retested} retested from real evidence, ${staleClosed} closed INCONCLUSIVE after stale window. Outcomes this run: ${breakdown}. ${matchableRecords} signal record(s) matched a queued route.`);
  if (stop) {
    // Rule 0: no stage exits 0 having done nothing unnamed. This is a named
    // legitimate stop - the evidence has genuinely not arrived yet - not a pass.
    console.log(`Retest sweep: NAMED STOP (${stop.reason}) - ${stop.detail}.`);
  }
}

main();
