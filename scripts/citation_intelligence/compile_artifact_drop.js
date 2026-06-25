#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const outDir = path.join(ROOT, 'artifacts', 'release');
fs.mkdirSync(outDir, { recursive: true });
function read(rel, fallback=null) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; } }
const packet = {
  generated_at: new Date().toISOString(),
  source: '$0 AEO/GEO citation intelligence pipeline',
  inputs: {
    query_universe: read('data/query_atlas/query_universe.json', { queries: [] })?.queries?.length || 0,
    normalized_signals: read('data/signals/normalized_records.json', { records: [] })?.records?.length || 0,
    opportunities: read('data/opportunities/aeo_geo_opportunities.json', { opportunities: [] })?.opportunities?.length || 0,
    release_units: read('data/releases/daily_release_plan.json', { units: [] })?.units?.length || 0
  },
  artifacts: [
    'data/query_atlas/query_universe.json',
    'data/signals/normalized_records.json',
    'data/opportunities/aeo_geo_opportunities.json',
    'data/releases/daily_release_plan.json',
    'releases/citation_release_plan.json',
    '.build/indexnow-priority.txt',
    '.build/indexnow-batch.txt'
  ].filter(p => fs.existsSync(path.join(ROOT, p)))
};
fs.writeFileSync(path.join(outDir, 'compiled_artifact_drop.json'), JSON.stringify(packet, null, 2));
console.log(`Compiled artifact drop: ${packet.artifacts.length} artifacts, ${packet.inputs.release_units} release units.`);
