#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const outDir = path.join(ROOT, 'logs', 'query-testing');
fs.mkdirSync(outDir, { recursive: true });

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
const priorityQueries = readJson('data/seo/priority_queries.json');
const profile = readJson('data/strategy/citation_strategy_profile.json');
const releasePlan = readJson('releases/citation_release_plan.json');

const basePrompts = [
  'best virtual event production company',
  'how much does virtual event production cost',
  'StreamYard vs LiveKit for events',
  'best virtual event platforms',
  'how to host a virtual event',
  'virtual event production checklist',
  'hybrid event production run of show',
  'executive town hall production checklist',
  'virtual event backup plan',
  'webinar production timeline'
];

const semrushPrompts = priorityQueries.map((q) => q.query);
const industryPrompts = [
  'virtual event production for healthcare',
  'virtual event production for finance',
  'virtual event production for SaaS',
  'virtual event production for nonprofits',
  'virtual event production for government',
  'virtual event production for education',
  'virtual event production for manufacturing',
  'virtual event production for biotech',
  'virtual event production for professional services',
  'virtual event production for real estate'
];

const panel = [...new Set([...basePrompts, ...semrushPrompts, ...industryPrompts])].map((query, idx) => {
  const target = priorityQueries.find((q) => q.query === query)?.target_page
    || releasePlan.release_units.find((u) => u.primary_query === query)?.path
    || null;
  return {
    id: `q${String(idx + 1).padStart(3, '0')}`,
    query,
    target_page: target,
    test_surfaces: ['Google Search manual', 'Perplexity manual', 'ChatGPT manual', 'Gemini manual'],
    count_as_citation_only_if: 'A virtualagency-os.com URL is shown as a cited/source/supporting link for the query.',
    status: 'ready_for_manual_or_gsc_logging'
  };
});

const panelPath = path.join(ROOT, 'data/seo/benchmark_query_panel.json');
fs.writeFileSync(panelPath, JSON.stringify({ updated_at: new Date().toISOString(), strategy: profile.goal_class || profile.citation_goal_class || 'C2', queries: panel }, null, 2));

const csvLines = [
  ['date','surface','query_id','query','target_page','observed_citation_url','observed_rank_or_position','notes'].join(','),
  ...panel.map((q) => ['', '', q.id, JSON.stringify(q.query), q.target_page || '', '', '', ''].join(','))
];
fs.writeFileSync(path.join(outDir, 'manual-citation-log-template.csv'), csvLines.join('\n') + '\n');

const md = [];
md.push('# Zero-Cost Query Testing Packet');
md.push('');
md.push(`Generated: ${new Date().toISOString()}`);
md.push('');
md.push('## What is done');
md.push('');
md.push('- Benchmark query panel generated from trusted SEMrush baseline, locked strategy, and industry page family.');
md.push('- Manual citation log template generated for ChatGPT, Perplexity, Gemini, and Google Search checks.');
md.push('- Search Console API pull can run for $0 when GSC credentials are present.');
md.push('');
md.push('## What is not claimed');
md.push('');
md.push('- This repo does not claim paid Profound/Peec-style AI citation telemetry.');
md.push('- This repo does not claim automatic ChatGPT/Perplexity/Gemini citation proof without external credentials/tools.');
md.push('');
md.push('## Query panel');
md.push('');
for (const q of panel) md.push(`- ${q.id}: ${q.query}${q.target_page ? ` → ${q.target_page}` : ''}`);
fs.writeFileSync(path.join(outDir, 'zero-cost-query-testing-packet.md'), md.join('\n') + '\n');

console.log(`Zero-cost query testing packet OK (${panel.length} queries)`);
