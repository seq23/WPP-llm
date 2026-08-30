#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * The guard for the quality-rejection vocabulary.
 *
 * On 2026-08-30 the 90-day release flow went red on
 * "quality rejection count exists without rejection receipts" while the receipt
 * was sitting in artifacts/release/apply_release_plan_summary.json. The
 * postbuild quarantine had written `postbuild_quality_quarantine`; the gate was
 * matching the prefix `quality_rejected`. Two components, one event, two words,
 * nothing linking them.
 *
 * This asserts the link, three ways:
 *
 *  1. The registry is not empty. A vocabulary of zero words would make the
 *     receipt gate pass on everything.
 *  2. Every registered reason is actually accepted by rejectionReceiptGap() -
 *     the same function the release gate calls - and an unregistered reason is
 *     still refused. The gate cannot be widened into a no-op without failing here.
 *  3. Every script that increments the `quality_rejected` counter emits from the
 *     shared registry. A new producer that invents its own word fails here
 *     instead of taking the release workflow red days later.
 */
const fs = require('fs');
const path = require('path');
const {
  QUALITY_REJECTION_REASON_VALUES,
  rejectionReceiptGap,
} = require('./quality_rejection_reasons.js');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_MODULE = 'quality_rejection_reasons';
const COUNTER = 'quality_rejected';
const fail = (message) => { console.error(`quality rejection vocabulary: ${message}`); process.exit(1); };

// 1. A vocabulary of zero words is not a vocabulary.
if (QUALITY_REJECTION_REASON_VALUES.length === 0) {
  fail('the registry is empty, so the receipt gate would accept a rejection count with no receipts at all');
}

// 2. Round-trip every registered word through the gate's own function.
for (const reason of QUALITY_REJECTION_REASON_VALUES) {
  const gap = rejectionReceiptGap({ quality_rejected: 1, skipped_records: [{ reason }] });
  if (gap) fail(`registered reason "${reason}" is not accepted as a receipt by the release gate: ${gap}`);
}
if (!rejectionReceiptGap({ quality_rejected: 1, skipped_records: [{ reason: 'not_a_registered_reason' }] })) {
  fail('an unregistered receipt reason was accepted; the gate has been widened into a no-op');
}
if (rejectionReceiptGap({ quality_rejected: 0, skipped_records: [] })) {
  fail('a summary with no rejections was reported as missing receipts');
}

// 3. Every producer of the counter must emit from the registry.
const scanRoots = ['scripts'];
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
    if (/\.(js|cjs|mjs)$/.test(entry.name)) files.push(full);
  }
};
for (const root of scanRoots) walk(path.join(ROOT, root));

const producers = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.includes(REGISTRY_MODULE)) continue;
  const source = fs.readFileSync(file, 'utf8');
  // A producer is a script that writes the counter, not one that merely reads it.
  const writesCounter = new RegExp(`${COUNTER}\\s*[:=]`).test(source)
    && !/validate_programmatic_quality|validate_quality_rejection_vocabulary/.test(rel);
  if (!writesCounter) continue;
  producers.push(rel);
  if (!source.includes(REGISTRY_MODULE)) {
    fail(`${rel} writes the ${COUNTER} counter but does not emit its receipt reason from ${REGISTRY_MODULE}.js. `
      + 'That is how the release gate and the postbuild quarantine ended up with two words for one event.');
  }
}

// Zero-item rule: a scan that found no producers has proved nothing.
if (producers.length === 0) {
  fail(`scanned ${files.length} script(s) and found no writer of the ${COUNTER} counter. `
    + 'Either the counter was renamed or this scan no longer reaches the code it governs; it must not pass on an empty loop.');
}

console.log(`quality rejection vocabulary OK: ${QUALITY_REJECTION_REASON_VALUES.length} registered reason(s) `
  + `(${QUALITY_REJECTION_REASON_VALUES.join(', ')}), ${producers.length} producer(s) bound to the registry `
  + `(${producers.join(', ')}), unregistered reason still refused`);
