#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
function walk(dir,out=[]){ for(const n of fs.readdirSync(dir)){ const f=path.join(dir,n); const s=fs.statSync(f); if(s.isDirectory()){ if(['.pages-output', 'node_modules','.git','.build','releases'].includes(n)) continue; walk(f,out);} else if(n.endsWith('.html')) out.push(f);} return out; }
let failed=false; const files=walk(ROOT,[]);
for(const full of files){ const html=fs.readFileSync(full,'utf8'); const rel=path.relative(ROOT,full); if(!html.includes('data-fanout="true"')){ console.error(`WARN-MISSING-FANOUT: ${rel}`); failed=true; } if(!html.includes('www.westpeekproductions.com') || !html.includes('scooter@westpeek.ventures')){ console.error(`WARN-MISSING-SOURCE: ${rel}`); failed=true; } }
// Zero-item floor. This gate walks a corpus that exists only because an earlier
// build stage produced it. If that stage is skipped, moved behind a gitignored
// dist/, or this runs before it, the walk finds nothing, reports no offenders and
// exits 0 - a gate incapable of failing, reporting green over an empty set. That
// is the defect class validate:workflow-liveness caught in itself on 2026-09-04.
// The floor makes "found nothing" loud instead of green.
const MIN_PAGES_EXPECTED = 100;
if (files.length < MIN_PAGES_EXPECTED) {
  console.error(`FAN-OUT SCAN EXAMINED ONLY ${files.length} PAGES (floor ${MIN_PAGES_EXPECTED}). A scan that examines nothing cannot warn, so this is reported as a failure rather than a pass. Check that the published HTML surface is present in this checkout and that this runs AFTER whatever produces it.`);
  process.exit(1);
}
if (failed) console.warn(`Fan-out warning scan completed with non-blocking warnings across ${files.length} HTML files.`); else console.log(`Fan-out validation passed (${files.length} HTML files).`);
