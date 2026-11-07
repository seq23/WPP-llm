'use strict';
/**
 * Publication freeze gate (data/release/publication_freeze.json).
 *
 * While frozen, a new page may only be created for a query that has a measured
 * Search Console number in data/seo/measured_targets.json. The single caller
 * that creates pages, scripts/citation_intelligence/apply_release_plan.js, asks
 * createAllowed() per unit; validate_publication_freeze.js proves both that the
 * gate refuses an unmeasured query and that the publisher actually calls it.
 *
 * The measured set is a rolling Search Console window: a query measured when its
 * page was created can age out of the 90-day window weeks later. So the gate
 * returns the measurement it admitted on, the publisher records it on the
 * admission as `freeze_measurement`, and lateUnmeasuredCreates() judges a page
 * by the measurement recorded at creation, not by today's window (7 Nov 2026:
 * a page created 17 Oct on 14 measured impressions failed the check once those
 * impressions rolled out of the window).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FLAG_REL = 'data/release/publication_freeze.json';
const norm = (q) => String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function loadFreeze(root = ROOT) {
  const p = path.join(root, FLAG_REL);
  if (!fs.existsSync(p)) throw new Error(`publication freeze: missing ${FLAG_REL}; refusing to guess whether publishing is allowed`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function measuredQueries(root = ROOT, flag = loadFreeze(root)) {
  const p = path.join(root, flag.measured_targets || 'data/seo/measured_targets.json');
  if (!fs.existsSync(p)) return new Set();
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Set((d.targets || []).filter((t) => Number(t.impressions) > 0).map((t) => norm(t.query)));
}

// The measured-target row a create is admitted on, as a record for the admission.
function measurementFor(query, root = ROOT, flag = loadFreeze(root)) {
  const p = path.join(root, flag.measured_targets || 'data/seo/measured_targets.json');
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const t = (d.targets || []).find((x) => Number(x.impressions) > 0 && norm(x.query) === norm(query));
  if (!t) return null;
  return { query: t.query, impressions: Number(t.impressions), sources: t.sources || [], measured_targets_generated_at: d.generated_at || null };
}

function createAllowed(query, { root = ROOT, flag, measured } = {}) {
  const f = flag || loadFreeze(root);
  if (f.frozen !== true) return { allowed: true, reason: null, measurement: null };
  const m = measured || measuredQueries(root, f);
  if (m.has(norm(query))) return { allowed: true, reason: null, measurement: measurementFor(query, root, f) };
  return { allowed: false, reason: 'publication_frozen_unmeasured_target', measurement: null };
}

// A recorded measurement counts only if it is for this query, has impressions,
// and was generated no later than the admission it justifies.
function recordedMeasurementHolds(a) {
  const r = a && a.freeze_measurement;
  if (!r || !(Number(r.impressions) > 0) || norm(r.query) !== norm(a.query)) return false;
  const at = Date.parse(r.measured_targets_generated_at); const adm = Date.parse(a.admitted_at);
  return Number.isFinite(at) && Number.isFinite(adm) && at <= adm;
}

// Admissions with action "create" on or after the freeze date that have neither
// a measurement today nor one recorded when they were created.
function lateUnmeasuredCreates(rows, flag, measured) {
  if (!flag || flag.frozen !== true) return [];
  return (rows || []).filter((a) => a.action === 'create'
    && String(a.admitted_at || '').slice(0, 10) >= flag.since
    && !measured.has(norm(a.query))
    && !recordedMeasurementHolds(a));
}

module.exports = { FLAG_REL, loadFreeze, measuredQueries, measurementFor, createAllowed, recordedMeasurementHolds, lateUnmeasuredCreates, norm };
