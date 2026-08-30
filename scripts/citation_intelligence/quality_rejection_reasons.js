'use strict';
/**
 * The one list of "this release unit was refused on quality grounds".
 *
 * Two components were writing that event and neither knew the other's word for
 * it. `apply_release_plan.js` writes `quality_rejected_at_apply`;
 * `self_heal_release_quality.js` writes `postbuild_quality_quarantine`. Both
 * increment the same `quality_rejected` counter in
 * `artifacts/release/apply_release_plan_summary.json`.
 *
 * `validate_programmatic_quality.js` enforced "a rejection count must carry
 * receipts" with `String(r.reason).startsWith('quality_rejected')` - it knew one
 * of the two words. So on 2026-08-30 the postbuild quarantine did exactly what
 * it exists to do, quarantined one page, wrote a complete receipt for it, and
 * the release workflow went red for a missing receipt that was sitting in the
 * file. Correct behaviour reported as a failure is as expensive as a real break.
 *
 * The fix is not a wider prefix match. A prefix is a third opinion about the
 * vocabulary and would drift again the next time a component is added. This
 * module is the vocabulary: producers emit from it, the gate reads it, and
 * `validate_quality_rejection_vocabulary.js` fails if any producer writes a
 * reason that is not in it.
 */

const QUALITY_REJECTION_REASONS = Object.freeze({
  /** apply_release_plan.js: candidate failed candidateQuality() before it was written to disk. */
  AT_APPLY: 'quality_rejected_at_apply',
  /** self_heal_release_quality.js: page was built, then quarantined by the postbuild corpus scan. */
  POSTBUILD_QUARANTINE: 'postbuild_quality_quarantine',
  /** build_release_plan.js: candidate never entered the plan; refused at preflight. */
  PREFLIGHT: 'quality_preflight_rejected',
});

const QUALITY_REJECTION_REASON_VALUES = Object.freeze(Object.values(QUALITY_REJECTION_REASONS));

/** Is this receipt reason one of the registered quality-rejection events? */
function isQualityRejectionReason(reason) {
  return QUALITY_REJECTION_REASON_VALUES.includes(String(reason || ''));
}

/**
 * A summary that counts quality rejections must carry at least one receipt for
 * them. Returns null when the summary is consistent, or a human-readable reason
 * why it is not.
 *
 * This is the function the release gate calls, so the gate and the vocabulary
 * cannot drift: adding a producer means adding its reason here, and nowhere else.
 */
function rejectionReceiptGap(summary) {
  const counted = Number((summary && summary.quality_rejected) || 0);
  if (!(counted > 0)) return null;
  const records = Array.isArray(summary && summary.skipped_records) ? summary.skipped_records : [];
  const matching = records.filter((record) => isQualityRejectionReason(record && record.reason));
  if (matching.length === 0) {
    const seen = records.map((record) => String((record && record.reason) || '?'));
    return `quality_rejected=${counted} but no receipt carries a registered quality-rejection reason `
      + `(registered: ${QUALITY_REJECTION_REASON_VALUES.join(', ')}; receipts present: ${seen.length ? seen.join(', ') : 'none'})`;
  }
  return null;
}

module.exports = {
  QUALITY_REJECTION_REASONS,
  QUALITY_REJECTION_REASON_VALUES,
  isQualityRejectionReason,
  rejectionReceiptGap,
};
