#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const base = path.join(root, 'data/authority_scale/fanout_100k');
const idx = JSON.parse(fs.readFileSync(path.join(base, 'index.json'), 'utf8'));
const size = 6500;
const total = Number(idx.materialized_reference_runway || idx.record_count || 100000);
const buildDate = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
const buildEpoch = Date.parse(`${buildDate}T00:00:00.000Z`);
if (!Number.isFinite(buildEpoch)) {
  console.error(`Invalid BUILD_DATE: ${buildDate}`);
  process.exit(1);
}
const day = Math.floor(buildEpoch / 86400000);
const start = (day * size) % total;
const out = [];
let all = [];
for (const sh of idx.shards || []) {
  const p = path.join(root, sh.path);
  const txt = zlib.gunzipSync(fs.readFileSync(p)).toString('utf8').trim();
  for (const line of txt.split(/\n/)) if (line) all.push(JSON.parse(line));
}
for (let i = 0; i < Math.min(size, total); i++) out.push(all[(start + i) % all.length]);
const target = path.join(root, 'data/query_atlas/max_fanout_window.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({
  schema_version: '1.0',
  generated_at: `${buildDate}T00:00:00.000Z`,
  source: 'data/authority_scale/fanout_100k/index.json',
  window_size: out.length,
  start_offset: start,
  total_runway: total,
  queries: out
}, null, 2) + '\n');
console.log(`WPP MAX FANOUT WINDOW ${out.length}/${total} start=${start}`);
