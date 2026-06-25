#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const inDir = path.join(ROOT, 'data', 'agent_runs', 'raw_runs');
const outDir = path.join(ROOT, 'data', 'agent_runs');
fs.mkdirSync(inDir, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
const files = fs.readdirSync(inDir).filter(f => /\.json$/.test(f));
const records = [];
for (const f of files) {
  try {
    const obj = JSON.parse(fs.readFileSync(path.join(inDir, f), 'utf8'));
    records.push({ source_file: f, imported_at: new Date().toISOString(), payload: obj });
  } catch (err) {
    records.push({ source_file: f, imported_at: new Date().toISOString(), error: String(err.message || err) });
  }
}
const packet = { generated_at: new Date().toISOString(), mode: files.length ? 'normalized_agent_runs' : 'no_agent_runs_gsc_primary', count: records.length, records };
fs.writeFileSync(path.join(outDir, 'normalized_agent_runs.json'), JSON.stringify(packet, null, 2));
console.log(`Normalized agent-run artifacts: ${records.length} records (${packet.mode}).`);
