#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Live proof for a thin-page repair run: reads this run's repair receipt
 * (artifacts/release/apply_release_plan_summary.json created_routes/
 * repaired_routes) and fetches each route on the live site. A route that is
 * not yet published (non-200) is reported pending, never counted as proved -
 * a page this lane has not deployed is not evidence of anything. A route that
 * is live but under the floor fails the check.
 */
const { readJson, wordCountFromHtml } = require('./citation_intelligence/content_quality.js');

const DOMAIN = 'https://virtualagency-os.com';

function main() {
  const summary = readJson('artifacts/release/apply_release_plan_summary.json', null);
  if (!summary) {
    console.error('live-check-repaired-substance: no artifacts/release/apply_release_plan_summary.json; run npm run release:content first.');
    process.exit(1);
  }
  const routes = [...new Set([...(summary.created_routes || []), ...(summary.repaired_routes || [])])];
  if (!routes.length) {
    console.error('live-check-repaired-substance: this run created or repaired zero routes; refusing to pass a check with zero receipts to prove.');
    process.exit(1);
  }
  const cfg = readJson('_content_release_contract.json', {});
  const floor = Number((cfg.quality || {}).min_programmatic_words) || 700;

  return Promise.all(routes.map(async (route) => {
    const url = DOMAIN + route;
    try {
      const res = await fetch(url);
      if (!res.ok) return { route, status: 'pending', detail: `http ${res.status}` };
      const html = await res.text();
      const words = wordCountFromHtml(html);
      return { route, status: words >= floor ? 'ok' : 'under_floor', words };
    } catch (err) {
      return { route, status: 'pending', detail: String((err && err.message) || err) };
    }
  })).then((results) => {
    const ok = results.filter((r) => r.status === 'ok');
    const pending = results.filter((r) => r.status === 'pending');
    const underFloor = results.filter((r) => r.status === 'under_floor');
    console.log(`live-check-repaired-substance: ${ok.length} ok, ${pending.length} pending (not yet published), ${underFloor.length} under the ${floor}-word floor, of ${results.length} route(s).`);
    for (const r of results) {
      console.log(`  ${r.status.toUpperCase().padEnd(11)} ${r.route}${r.words != null ? `  ${r.words}w` : ''}${r.detail ? `  (${r.detail})` : ''}`);
    }
    if (underFloor.length) {
      console.error(`live-check-repaired-substance: ${underFloor.length} route(s) are live under the ${floor}-word floor: ${underFloor.map((r) => r.route).join(', ')}`);
      process.exit(1);
    }
  });
}

main();
