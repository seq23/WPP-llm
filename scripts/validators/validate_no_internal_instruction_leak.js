#!/usr/bin/env node
'use strict';
// No published page may contain internal build instructions.
//
// The external review agent sends recommendations as build directives shaped like
//   "FILEPATH: x || CURRENT: ... || MISSING: ... || EDIT: ..."
// In a sibling repo two generator paths rendered those as reader-facing copy: a
// fallback "acceptance checklist" card, and target.answer via
// "Citation-ready update: ". 163 published pages carried the first and 100 the
// second - the second inside the direct-answer block, which is the exact text an
// answer engine extracts.
//
// It also explains a reported symptom: the agent kept re-flagging pages marked
// released, because it was reading its own instruction back off the page instead
// of the content it asked for.
//
// This repo has the same generator shape (scripts/citation_intelligence/*
// writes page copy from agent recommendations), so the same defect is possible
// here. This guard makes it impossible rather than fixed once.
//
// data/** is exempt: agent run artifacts, diagnosis output and repair
// recommendations live there and are supposed to contain this text. They are not
// part of the published surface. .build/ is the deploy mirror and is rebuilt
// from the scanned source.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const EVIDENCE = path.join(ROOT, 'artifacts/validation/internal-instruction-leak.json');
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'data', 'artifacts', 'reports', 'staging', 'templates',
  'logs', 'coverage',
]);

const PATTERNS = [
  [/FILEPATH:/, 'raw agent recommendation (FILEPATH:)'],
  [/\|\|\s*(CURRENT|MISSING|EDIT)\s*:/i, 'raw agent recommendation field separator'],
  [/Citation-ready update:/i, 'instruction appended to the answer block'],
  [/Marker-only framework cards/i, 'build policy text rendered as page copy'],
  [/Required semantic acceptance:/i, 'build policy text rendered as page copy'],
  // The homepage published <h2>CTA: route commercial buyers to the official
  // site</h2> as visible body copy on the property that carries the portfolio's
  // highest-CPC terms. It survived because validate_homepage_ctas.js accepted
  // that exact string as proof a middle CTA existed, so the note was load-bearing
  // and nothing could remove it. Both ends are fixed: the validator now looks for
  // the CTA itself, and this pattern refuses the note.
  //
  // The shape is general - a heading whose text is an instruction to the builder
  // ("CTA:", "TODO:", "NOTE:", "FIXME:", "Placeholder:") rather than a title a
  // reader would recognise. An answer engine quotes headings.
  [/<h[1-6][^>]*>\s*(?:CTA|TODO|FIXME|NOTE|PLACEHOLDER|TBD|DRAFT)\s*:/i,
    'heading is a build instruction, not a title a reader would recognise'],
];

const offenders = [];
let scanned = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(abs);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    scanned += 1;
    const html = fs.readFileSync(abs, 'utf8');
    for (const [re, why] of PATTERNS) {
      if (re.test(html)) { offenders.push({ path: rel, reason: why }); break; }
    }
  }
})(ROOT);

fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify({
  schema_version: '1.0',
  validator: 'no-internal-instruction-leak',
  generated_at: new Date().toISOString(),
  status: offenders.length ? 'FAIL' : 'PASS',
  files_scanned: scanned,
  offender_count: offenders.length,
  offenders: offenders.slice(0, 200),
}, null, 2)}\n`);

if (offenders.length) {
  console.error(`INTERNAL INSTRUCTION LEAK FAIL: ${offenders.length} published page(s) contain build instructions`);
  for (const o of offenders.slice(0, 15)) console.error(`  ${o.path} :: ${o.reason}`);
  if (offenders.length > 15) console.error(`  ...and ${offenders.length - 15} more`);
  console.error('  remedy: the generator must render the requested content, never the recommendation text that asked for it');
  process.exit(1);
}
// Rule 0: a gate that examined nothing has not passed, it has abstained. These three
// gates walk the published *.html surface. That surface is committed here (3,419 tracked
// files), so a fresh CI checkout has it - verified in run 33266127315, which examined
// 3419/3419/3417 pages. But nothing STRUCTURALLY guaranteed that: if the site were ever
// moved behind a build step into a gitignored dist/, or this ran before the stage that
// produces its input, the walk would find zero files, report no offenders and exit 0 -
// a HARD_FAIL gate that is incapable of failing. A sibling repo shipped exactly that on
// three release-blocking gates. The floor below makes "found nothing" loud instead of green.
const MIN_PAGES_EXPECTED = 100;
if (scanned < MIN_PAGES_EXPECTED) {
  console.error(`NO INTERNAL INSTRUCTION LEAK EXAMINED ONLY ${scanned} PAGES (floor ${MIN_PAGES_EXPECTED}). A gate that examines nothing cannot fail, so this is reported as a failure rather than a pass. Check that the published HTML surface is present in this checkout and that this gate runs AFTER whatever produces it.`);
  process.exit(1);
}
console.log(`NO INTERNAL INSTRUCTION LEAK: ${scanned} published pages contain no build directives`);
