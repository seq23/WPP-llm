#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = path.join(ROOT, 'data/authority_scale/fanout_dimensions.json');
const OUT = path.join(ROOT, 'data/authority_scale/fanout_100k');
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const arg = process.argv.find((v) => v.startsWith('--target='));
const target = Number(arg ? arg.split('=')[1] : cfg.reference_materialization_target || 100000);
if (!Number.isInteger(target) || target < 1) throw new Error(`Invalid --target: ${target}`);

const dims = ['topics','intent_patterns','modifiers','audiences','geographies','formats','buyer_stages'];
for (const key of dims) if (!Array.isArray(cfg[key]) || cfg[key].length === 0) throw new Error(`Missing dimension: ${key}`);
const theoretical = dims.reduce((n, key) => n * BigInt(cfg[key].length), 1n);
if (theoretical < BigInt(target)) throw new Error(`Insufficient deterministic fanout capacity: ${theoretical} < ${target}`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const slug = (s) => String(s).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120);
const clean = (s) => String(s).replace(/\s+/g,' ').replace(/\s+([,?.])/g,'$1').trim();
function comboAt(n) {
  let x = BigInt(n);
  const out = {};
  for (const key of dims) {
    const arr = cfg[key];
    out[key] = arr[Number(x % BigInt(arr.length))];
    x /= BigInt(arr.length);
  }
  return out;
}
function buildQuery(c) {
  let q = c.intent_patterns.replaceAll('{topic}', c.topics);
  const extras = [];
  if (c.modifiers && !q.toLowerCase().includes(c.modifiers.toLowerCase())) extras.push(c.modifiers);
  if (c.audiences) extras.push(`for ${c.audiences}`);
  if (c.geographies) extras.push(`in ${c.geographies}`);
  return clean([q, ...extras].join(' '));
}
const SHARD_SIZE = 10000;
let records = [], shards = [], seen = new Set(), cursor = 0, produced = 0;
function flush() {
  if (!records.length) return;
  const part = shards.length + 1;
  const filename = `part-${String(part).padStart(5,'0')}.jsonl.gz`;
  const raw = Buffer.from(records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const gz = zlib.gzipSync(raw, { level: 9, mtime: 0 });
  fs.writeFileSync(path.join(OUT, filename), gz);
  shards.push({
    part,
    path: `data/authority_scale/fanout_100k/${filename}`,
    record_count: records.length,
    compressed_bytes: gz.length,
    uncompressed_bytes: raw.length,
    sha256: hash(gz),
    first_id: records[0].opportunity_id,
    last_id: records.at(-1).opportunity_id
  });
  records = [];
}
while (produced < target) {
  if (BigInt(cursor) >= theoretical) throw new Error(`Exhausted fanout capacity at ${produced}`);
  const c = comboAt(cursor++);
  const query = buildQuery(c);
  if (seen.has(query)) continue;
  seen.add(query);
  const id = `wpp_fanout_${String(produced + 1).padStart(6,'0')}_${hash(query).slice(0,10)}`;
  records.push({
    opportunity_id: id,
    query,
    topic: c.topics,
    modifier: c.modifiers,
    audience: c.audiences,
    geography: c.geographies || null,
    recommended_format: c.formats,
    buyer_stage: c.buyer_stages,
    semantic_cluster: slug(c.topics),
    disposition: 'OPPORTUNITY_ONLY',
    page_admission_status: 'NOT_EVALUATED',
    source: 'deterministic_max_fanout_v1'
  });
  produced++;
  if (records.length >= SHARD_SIZE) flush();
}
flush();
const aggregate = hash(Buffer.from(shards.map((s) => `${s.part}:${s.record_count}:${s.sha256}:${s.first_id}:${s.last_id}`).join('\n')));
const index = {
  schema_version: '1.0',
  repo: cfg.repo,
  standard: cfg.standard,
  generated_at: '2026-07-24T00:00:00.000Z',
  capacity_policy: 'NO_ARBITRARY_UPPER_CEILING_ON_LEGITIMATE_OPPORTUNITY_DISCOVERY',
  theoretical_combinations: theoretical.toString(),
  materialized_reference_runway: target,
  page_quota: false,
  truth_boundary: cfg.truth_boundary,
  compression: 'gzip_jsonl',
  shard_count: shards.length,
  aggregate_sha256: aggregate,
  shards
};
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`MAX FANOUT BUILT: ${target} opportunities across ${shards.length} gzip shards; theoretical capacity ${theoretical}`);
