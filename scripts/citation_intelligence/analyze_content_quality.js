#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { ROOT, analyzeCorpus, readJson } = require('./content_quality.js');

const report = analyzeCorpus();
const reportPath = path.join(ROOT, 'data/content/programmatic_quality_report.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

const remediation = {
  schema_version: '1.0',
  source_fingerprint: report.corpus_fingerprint,
  policy: 'bounded_self_heal_queue_no_mass_delete',
  counts: {
    total: report.summary.blocking_legacy_pages,
    thin: report.summary.thin_pages,
    exact_duplicate: report.summary.exact_duplicate_pages,
    near_duplicate: report.summary.near_duplicate_pages,
  },
  queue: report.pages
    .filter(p => p.flags.some(f => ['thin','exact_duplicate','near_duplicate'].includes(f)))
    .sort((a,b) => {
      const aw = a.flags.includes('thin') ? 2 : 0; const bw = b.flags.includes('thin') ? 2 : 0;
      if (aw !== bw) return bw-aw;
      if (a.max_similarity !== b.max_similarity) return b.max_similarity-a.max_similarity;
      return a.route.localeCompare(b.route);
    })
    .map((p,i) => ({
      remediation_priority: i + 1,
      route: p.route,
      query: p.query,
      cluster: p.cluster,
      pillar: p.pillar,
      page_family: p.page_family,
      word_count: p.word_count,
      max_similarity: p.max_similarity,
      nearest_route: p.nearest_route,
      canonical_owner: p.nearest_route || p.route,
      search_indexing_evidence: null,
      external_evidence_status: 'UNAVAILABLE_IN_REPO',
      flags: p.flags,
      recommended_action: 'differentiate_in_place',
    })),
};
fs.writeFileSync(path.join(ROOT, 'data/content/programmatic_remediation_manifest.json'), JSON.stringify(remediation, null, 2) + '\n');

const healthPath = path.join(ROOT, 'data/authority_scale/velocity_health.json');
const health = readJson('data/authority_scale/velocity_health.json', {});
health.semantic_duplicate_status = report.summary.blocking_legacy_pages ? 'FAIL' : 'CLEAN';
health.semantic_duplicate_evidence = {
  corpus_fingerprint: report.corpus_fingerprint,
  pages_scanned: report.summary.pages_scanned,
  blocking_legacy_pages: report.summary.blocking_legacy_pages,
  thin_pages: report.summary.thin_pages,
  exact_duplicate_pages: report.summary.exact_duplicate_pages,
  near_duplicate_pages: report.summary.near_duplicate_pages,
  report: 'data/content/programmatic_quality_report.json',
};
fs.writeFileSync(healthPath, JSON.stringify(health, null, 2) + '\n');

console.log(`Programmatic quality report: pages=${report.summary.pages_scanned} blocking_legacy=${report.summary.blocking_legacy_pages} thin=${report.summary.thin_pages} exact_duplicate=${report.summary.exact_duplicate_pages} near_duplicate=${report.summary.near_duplicate_pages}`);
