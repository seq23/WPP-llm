#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { ROOT, analyzeCorpus, candidateQuality, readJson, governedRoute } = require('./content_quality.js');

const current = analyzeCorpus();
const saved = readJson('data/content/programmatic_quality_report.json', null);
if (!saved || saved.corpus_fingerprint !== current.corpus_fingerprint) {
  console.error('programmatic quality report is stale; run npm run content:quality:report');
  process.exit(1);
}
const plan = readJson('data/releases/daily_release_plan.json', { units: [] });
const summary = readJson('artifacts/release/apply_release_plan_summary.json', null);
const planApplied = Boolean(summary && plan.generated_at && summary.plan_generated_at === plan.generated_at && Number(summary.total || 0) === (plan.units || []).length);
const issues = new Map(current.pages.map(p => [p.route, p]));
const badChanged = [];
if (planApplied) {
  for (const unit of plan.units || []) {
    const route = governedRoute(unit.target_route);
    if (!route.startsWith('/programmatic/')) continue;
    const row = issues.get(route);
    if (!row) { badChanged.push(`${route}:missing_quality_record`); continue; }
    const blocking = row.flags.filter(f => ['thin','exact_duplicate','near_duplicate'].includes(f));
    if (blocking.length) badChanged.push(`${route}:${blocking.join(',')}`);
  }
}
if (badChanged.length) {
  console.error(`programmatic release quality gate failed for changed routes: ${badChanged.join(' | ')}`);
  process.exit(1);
}
if (summary && Number(summary.quality_rejected || 0) > 0) {
  // Rejections are valid safe-harbor behavior; they must be recorded, not turned into hidden passes.
  if (!Array.isArray(summary.skipped_records) || !summary.skipped_records.some(r => String(r.reason || '').startsWith('quality_rejected'))) {
    console.error('quality rejection count exists without rejection receipts');
    process.exit(1);
  }
}
console.log(`Programmatic quality gate OK: release_units=${(plan.units||[]).length}, plan_applied=${planApplied}, legacy_backlog=${current.summary.blocking_legacy_pages}, fingerprint=${current.corpus_fingerprint.slice(0,12)}`);
