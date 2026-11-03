#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Restate the evidence stance on already-published programmatic pages.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/lib/programmatic_prose.js` used to hold one evidence phrase per mode
 * and print it in all four slots that ask for evidence on a page: the direct
 * answer, the decision table, the measurement paragraph and the FAQ. One
 * sentence four or five times in one body is template filler, and the Search
 * Readiness q1 sample reads it as such - it fails any 8-word phrase repeated
 * more than three times in one page body (`SLOT_MAX`). Three sampled
 * virtualagency-os.com pages failed on exactly that in the 3 Nov 2026 queue.
 *
 * The generator is fixed: the stance is now four phrases per mode, one per slot.
 * That settles every page rendered from here on. It does not settle the ~2,600
 * pages already published, because `npm run build` post-processes published
 * programmatic HTML but does not re-render its article body - the body was
 * written by a one-shot migration whose own template has since moved on.
 *
 * So this driver restates the three slots that were repeating the first one.
 *
 * NOT A HAND EDIT
 * ---------------
 * Nothing here is written per page. For each page the replacement text is
 * computed by the generator itself: the page's record comes from the admission
 * registry (route, query, pillar), the mode from that query, and the phrases
 * from `prose.evidenceStance(mode, slot)`. This script only decides where each
 * slot's phrase goes.
 *
 * THE SAFETY PROPERTY
 * -------------------
 * Each slot is anchored on the host sentence the generator wrote around it, so a
 * match is unambiguous. A page is written only when:
 *   - its record is in the admission registry,
 *   - the legacy phrase is found in a slot's anchor exactly once, and
 *   - no href on the page disappears and the anchor count does not fall.
 * Slot 0 is deliberately left alone: its phrase is unchanged, which keeps the
 * page's opening sentence and its meta description stable.
 * A page that does not match is skipped and counted, never guessed at.
 *
 * Usage:
 *   node scripts/content/restate_evidence_stance.js --dry-run
 *   node scripts/content/restate_evidence_stance.js
 */
const fs = require('fs');
const path = require('path');
const prose = require('../lib/programmatic_prose.js');
const { intentMatch } = require('../citation_intelligence/render_programmatic_page.js');

const ROOT = path.join(__dirname, '../..');
const DIR = path.join(ROOT, 'programmatic');
const DRY = process.argv.includes('--dry-run');

const ADMISSIONS = new Map(
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content/page_admission_registry.json'), 'utf8')).admissions || [])
    .map((a) => [a.route, a]),
);

// Accepted output is hash-locked. The freeze contract's repair policy is
// EXACT_ROUTE_THAW_VALIDATE_REFREEZE, so a route this driver rewrites has to be
// named in the active mutation scope or `authority:scale:freeze` refuses the
// drift and `authority:scale:restore` puts the old body back.
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/accepted_output_freeze_contract.json'), 'utf8'));
const FROZEN_ROUTES = new Set(
  (JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT.frozen_registry), 'utf8')).pages || []).map((p) => p.route),
);

const ARTICLE_RE = /<article>([\s\S]*?)<\/article>/;

/**
 * The three slots that repeated slot 0, each anchored on the sentence the
 * generator writes around it. `before`/`after` are literal text, so a match
 * cannot drift onto another sentence.
 */
const SLOTS = [
  { slot: 1, before: 'call has to rest on: ', after: '.', expect: [1] },
  { slot: 2, before: 'Both need ', after: ', and each should be attached to a decision', expect: [1] },
  // The FAQ answer is rendered visibly and mirrored into FAQPage JSON-LD, so this
  // slot legitimately appears twice and both copies move together - the schema
  // must never claim something the page does not say.
  { slot: 3, before: 'call, require ', after: '. Keep sourced facts', expect: [1, 2] },
];

const hrefs = (html) => [...String(html).matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const anchors = (html) => (String(html).match(/<a\b/g) || []).length;

function restateOne(html, file) {
  const route = `/programmatic/${file.replace(/\.html$/, '')}`;
  const a = ADMISSIONS.get(route);
  if (!a || !a.query) return { skip: 'no_record' };

  const mode = prose.modeFor(intentMatch(a.query).key);
  const legacy = prose.evidenceStance(mode, 0);

  const art = html.match(ARTICLE_RE);
  if (!art) return { skip: 'no_article' };
  let body = art[1];

  let changed = 0;
  for (const s of SLOTS) {
    const find = `${s.before}${legacy}${s.after}`;
    const occurrences = body.split(find).length - 1;
    // The expected count, or this is not the sentence this driver thinks it is.
    if (!s.expect.includes(occurrences)) continue;
    const next = prose.evidenceStance(mode, s.slot);
    body = body.split(find).join(`${s.before}${next}${s.after}`);
    changed += occurrences;
  }
  if (!changed) return { skip: 'no_legacy_slot' };

  const out = html.replace(ARTICLE_RE, () => `<article>${body}</article>`);

  // Nothing may be lost: every href survives and the anchor count holds.
  const lost = hrefs(html).filter((h) => !hrefs(out).includes(h));
  if (lost.length) return { fail: `lost href on ${route}: ${lost[0]}` };
  if (anchors(out) < anchors(html)) return { fail: `anchor count fell on ${route}` };

  return { html: out, changed };
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
const stats = { scanned: 0, rewritten: 0, slots: 0, skipped: {} };
const failures = [];
const touchedRoutes = [];

for (const file of files) {
  const abs = path.join(DIR, file);
  const before = fs.readFileSync(abs, 'utf8');
  stats.scanned += 1;
  const res = restateOne(before, file);
  if (res.fail) { failures.push(res.fail); continue; }
  if (res.skip) { stats.skipped[res.skip] = (stats.skipped[res.skip] || 0) + 1; continue; }
  if (res.html === before) { stats.skipped.unchanged = (stats.skipped.unchanged || 0) + 1; continue; }
  if (!DRY) fs.writeFileSync(abs, res.html);
  stats.rewritten += 1;
  stats.slots += res.changed;
  touchedRoutes.push(`/programmatic/${file.replace(/\.html$/, '')}`);
}

// Thaw exactly the hash-locked routes this run rewrote, and no others. An
// existing scope file is an open thaw transaction: its routes are kept.
const scopeAbs = path.join(ROOT, CONTRACT.active_mutation_scope);
const thawed = touchedRoutes.filter((r) => FROZEN_ROUTES.has(r));
if (!DRY && thawed.length) {
  const open = fs.existsSync(scopeAbs) ? (JSON.parse(fs.readFileSync(scopeAbs, 'utf8')).routes || []) : [];
  const routes = [...new Set([...open, ...thawed])].sort();
  fs.writeFileSync(scopeAbs, `${JSON.stringify({
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    source: 'scripts/content/restate_evidence_stance.js (Search Readiness q1)',
    routes,
  }, null, 2)}\n`);
}

// A rule that trips on one page has probably tripped on the batch.
if (failures.length) {
  console.error(`RESTATE_EVIDENCE_STANCE_FAILED: ${failures.length} page(s) failed their checks`);
  for (const f of failures.slice(0, 10)) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`${DRY ? '[dry-run] ' : ''}evidence stance restated: scanned ${stats.scanned}, rewritten ${stats.rewritten}, slots ${stats.slots}, thawed ${thawed.length}`);
for (const [k, v] of Object.entries(stats.skipped)) console.log(`  skipped: ${k}=${v}`);

// This driver is a migration, so a run that rewrites nothing once every page is
// already current is correct, not a failure. What may never pass silently is a
// page that still carries the legacy wording: validate:no-template-filler is
// the standing guard on that, and it reads the published bodies.
if (stats.rewritten === 0 && stats.scanned > 0) {
  console.log('nothing to restate: every published page already carries the per-slot wording.');
}
