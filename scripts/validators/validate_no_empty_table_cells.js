#!/usr/bin/env node
'use strict';
// No published page may ship a table with empty cells.
//
// An empty <td></td> is a generator that ran out of data mid-row and emitted the
// cell anyway. To a reader it is a blank box; to an answer engine it is a
// malformed table whose columns no longer line up with their headers, so the
// whole table becomes unusable as an extractable fact source. A sibling repo
// shipped 257 pages in this state.
//
// A cell holding &nbsp;, a dash, or "n/a" is a deliberate authored placeholder
// and passes: this only catches cells with nothing in them at all.
//
// Same exemptions as the instruction-leak guard: data/** holds agent artifacts
// and .build/ is the deploy mirror rebuilt from the scanned source.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const EVIDENCE = path.join(ROOT, 'artifacts/validation/empty-table-cells.json');
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'data', 'artifacts', 'reports', 'staging', 'templates',
  'logs', 'coverage',
]);

// <td>, <td class="x">, <td></td> and <td>\n  </td> all count as empty.
const EMPTY_CELL = /<(td|th)\b[^>]*>\s*<\/\1>/gi;

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
    const matches = html.match(EMPTY_CELL);
    if (matches) offenders.push({ path: rel, empty_cells: matches.length });
  }
})(ROOT);

const totalCells = offenders.reduce((sum, o) => sum + o.empty_cells, 0);
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify({
  schema_version: '1.0',
  validator: 'no-empty-table-cells',
  generated_at: new Date().toISOString(),
  status: offenders.length ? 'FAIL' : 'PASS',
  files_scanned: scanned,
  offender_count: offenders.length,
  empty_cell_count: totalCells,
  offenders: offenders.slice(0, 200),
}, null, 2)}\n`);

if (offenders.length) {
  console.error(`EMPTY TABLE CELL FAIL: ${offenders.length} published page(s) ship ${totalCells} empty table cell(s)`);
  for (const o of offenders.slice(0, 15)) console.error(`  ${o.path} :: ${o.empty_cells} empty cell(s)`);
  if (offenders.length > 15) console.error(`  ...and ${offenders.length - 15} more`);
  console.error('  remedy: the generator must omit the row, or fill the cell with real content');
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
  console.error(`NO EMPTY TABLE CELLS EXAMINED ONLY ${scanned} PAGES (floor ${MIN_PAGES_EXPECTED}). A gate that examines nothing cannot fail, so this is reported as a failure rather than a pass. Check that the published HTML surface is present in this checkout and that this gate runs AFTER whatever produces it.`);
  process.exit(1);
}
console.log(`NO EMPTY TABLE CELLS: ${scanned} published pages contain no empty <td>/<th>`);
