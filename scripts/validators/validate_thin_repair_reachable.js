#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * A thin /programmatic/ page may not be refused a repair for metadata its own
 * quality-report row already carries. Before 2 Nov 2026, build_release_plan.js
 * blocked a repair with reason `quality_repair_missing_opportunity_metadata`
 * whenever `data/opportunities/aeo_geo_opportunities.json` held no record for
 * the route - even though content_quality.js's own quality row for that same
 * route already carried query/cluster/pillar/page_family (read from the same
 * opportunity/admission sources). 64 of 65 daily repair units were blocked by
 * this on 2 Nov 2026, against a ceiling of 100.
 */
const { analyzeCorpus, readJson } = require('../citation_intelligence/content_quality.js');

const quality = analyzeCorpus();
const programmaticPages = quality.pages.filter((p) => p.route.startsWith('/programmatic/'));
if (!programmaticPages.length) {
  console.error('validate-thin-repair-reachable: the quality report scanned zero /programmatic/ pages; refusing to pass a check that reviewed nothing.');
  process.exit(1);
}
const queryByRoute = new Map(programmaticPages.map((p) => [p.route, p.query]));

const plan = readJson('data/releases/daily_release_plan.json', null);
if (!plan) {
  console.error('validate-thin-repair-reachable: no data/releases/daily_release_plan.json; run npm run release:plan first.');
  process.exit(1);
}

const unreachable = (plan.blocked || []).filter((r) => (
  r.release_action === 'repair'
  && r.reason === 'quality_repair_missing_opportunity_metadata'
  && r.target_route
  && r.target_route.startsWith('/programmatic/')
  && queryByRoute.get(r.target_route)
));

if (unreachable.length) {
  const detail = unreachable.map((r) => `${r.target_route}:${queryByRoute.get(r.target_route)}`).join(', ');
  console.error(`validate-thin-repair-reachable: ${unreachable.length} /programmatic/ page(s) blocked for 'quality_repair_missing_opportunity_metadata' while the quality report's own row for that route already carries a query (${detail}). build_release_plan.js must fall back to the quality row's metadata before refusing a repair.`);
  process.exit(1);
}

const repairBlocked = (plan.blocked || []).filter((r) => r.release_action === 'repair').length;
console.log(`validate-thin-repair-reachable OK: ${programmaticPages.length} /programmatic/ page(s) in the quality report, ${repairBlocked} repair-blocked row(s), 0 refused for metadata their own row already carries.`);
