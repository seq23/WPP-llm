#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'); const outDir = path.join(ROOT, 'artifacts', 'release'); fs.mkdirSync(outDir, {recursive:true});
function read(rel, fallback) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; } }
const summary = {
  generated_at: new Date().toISOString(),
  validation_summary: read('logs/deep-validation/summary.json', []),
  workflow_trace: read('logs/workflow-data-trace/workflow_data_trace_report.json', null),
  release_plan: read('data/releases/daily_release_plan.json', {units: []}),
  content_state: read('data/content/content_state_registry.json', {}),
  query_universe_count: read('data/query_atlas/query_universe.json', {queries: []}).queries.length
};
fs.writeFileSync(path.join(outDir, 'release_report.json'), JSON.stringify(summary, null, 2));
const md = [`# Release Report`, ``, `Generated: ${summary.generated_at}`, ``, `- Query universe: ${summary.query_universe_count}`, `- Release units: ${(summary.release_plan.units||[]).length}`, `- Published/admitted routes: ${(summary.content_state.published_routes||[]).length}`, `- Deep validation components: ${Array.isArray(summary.validation_summary)?summary.validation_summary.length:0}`, `- Workflow trace: ${summary.workflow_trace ? 'present' : 'not generated yet'}`, ``].join('\n');
fs.writeFileSync(path.join(outDir, 'release_report.md'), md);
console.log('Release reports written to artifacts/release/.');
