#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Post-deploy proof, against the live domain, of what
 * scripts/validators/validate_measured_urls_resolve.js proves on the build:
 *   - every rule in data/redirects/measured_404_redirects.json and
 *     data/redirects/legacy_404_redirects.json answers 301 with Location = its
 *     target, and the target answers 200;
 *   - no page in the 90-day query x page file answers 404.
 * Usage: node scripts/live_check_measured_redirects.js [--host https://virtualagency-os.com]
 * Exits 1 on any failure; prints one summary line plus failures.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const i = process.argv.indexOf('--host');
const HOST = (i > 0 ? process.argv[i + 1] : 'https://virtualagency-os.com').replace(/\/$/, '');
const readJson = (p, d) => { const f = path.join(ROOT, p); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; };
const pathOf = (u) => { try { return new URL(u, HOST).pathname; } catch { return null; } };

async function head(p) {
  for (let a = 0; a < 3; a += 1) {
    try {
      const r = await fetch(HOST + p, { redirect: 'manual', headers: { 'user-agent': 'virtualagency-os live check' } });
      return { status: r.status, location: r.headers.get('location') };
    } catch (e) { if (a === 2) return { status: 0, location: String(e) }; }
  }
}
async function pool(items, n, fn) {
  const out = []; let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const j = k++; out[j] = await fn(items[j]); } }));
  return out;
}

(async () => {
  const measured = readJson('data/redirects/measured_404_redirects.json', { rules: [] }).rules || [];
  const legacy = readJson('data/redirects/legacy_404_redirects.json', { rules: [] }).rules || [];
  const rules = [...new Map([...legacy, ...measured].map((r) => [r.from, r])).values()];
  const dead = new Set((readJson('data/seo/consolidation_candidates.json', {}).dead_urls_with_live_twin || []).map((d) => pathOf(d.dead_url)));
  const pages = [...new Set((readJson('data/signals/gsc_query_signals.json', { records: [] }).records || [])
    .filter((r) => r.signal_type === 'gsc_query_performance').map((r) => pathOf(r.target_route)).filter(Boolean))];
  if (!measured.length || !pages.length) { console.error('live check: zero rules or zero measured pages; nothing to prove.'); process.exit(1); }

  const fails = [];
  let ok = 0; let deadOk = 0;
  await pool(rules, 8, async (r) => {
    const a = await head(r.from);
    const loc = a.location ? pathOf(a.location) : null;
    if (a.status !== 301 || loc !== r.to) { fails.push(`${r.from}: ${a.status} -> ${a.location} (want 301 -> ${r.to})`); return; }
    const b = await head(r.to);
    if (b.status !== 200) { fails.push(`${r.from} -> ${r.to}: target ${b.status}`); return; }
    ok += 1; if (dead.has(r.from)) deadOk += 1;
  });
  const res = await pool(pages, 8, async (p) => [p, (await head(p)).status]);
  const fourOhFour = res.filter(([, s]) => s === 404 || s === 0);
  for (const [p, s] of fourOhFour) fails.push(`90-day page ${p} answers ${s}`);

  console.log(`live check ${HOST}: ${ok}/${rules.length} redirect rules 301 -> 200 (${deadOk}/${dead.size} of the measured dead URLs); ${pages.length - fourOhFour.length}/${pages.length} 90-day pages not 404.`);
  if (fails.length) { for (const f of fails.slice(0, 40)) console.error(`- ${f}`); process.exit(1); }
})();
