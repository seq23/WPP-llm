#!/usr/bin/env node
'use strict';
/**
 * Every West Peek Productions CTA on a public page must carry attribution.
 *
 * virtualagency-os routes conversion off-domain to westpeekproductions.com on
 * purpose. The cost of that design is that West Peek cannot see which leads came
 * from here unless the link says so. On 2026-08-27, 49 of 7,108 outbound CTAs
 * carried utm_source; 7,059 were bare. Five separate producers each hardcoded the
 * bare URL, so the handful of attributed links never spread.
 *
 * This is the guard for that. It fails on any public-page link to
 * westpeekproductions.com without utm_source. admin/ is exempt: the command
 * centre lists the official domain as a reference, not as a CTA.
 *
 * Remedy when this fails:
 *   node scripts/repair_unattributed_wpp_ctas.js          (dry-run)
 *   node scripts/repair_unattributed_wpp_ctas.js --write
 * and build the URL with scripts/lib/wpp_cta.js in whatever producer emitted it,
 * rather than hardcoding the origin again.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.git', 'admin', '.build', 'artifacts', 'reports', 'logs']);
const HREF = /href="(https?:\/\/(?:www\.)?westpeekproductions\.com[^"]*)"/g;

const offenders = [];
let total = 0, attributed = 0;

(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name)); continue; }
    if (!e.name.endsWith('.html')) continue;
    const abs = path.join(dir, e.name);
    const rel = path.relative(ROOT, abs);
    const html = fs.readFileSync(abs, 'utf8');
    let m;
    HREF.lastIndex = 0;
    while ((m = HREF.exec(html)) !== null) {
      total++;
      if (/utm_source=/.test(m[1])) attributed++;
      else offenders.push({ page: rel, href: m[1].slice(0, 120) });
    }
  }
})(ROOT);

const evidence = {
  total_wpp_cta_links: total,
  attributed,
  unattributed: offenders.length,
  offenders: offenders.slice(0, 25),
};
try {
  fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'artifacts/validation/wpp-cta-attribution.json'), JSON.stringify(evidence, null, 2) + '\n');
} catch { /* evidence write is best-effort */ }

if (offenders.length) {
  console.error(`WPP CTA ATTRIBUTION FAIL: ${offenders.length} of ${total} outbound CTA link(s) carry no utm_source.`);
  for (const o of offenders.slice(0, 10)) console.error(`  ${o.page} -> ${o.href}`);
  console.error('  remedy: node scripts/repair_unattributed_wpp_ctas.js --write');
  process.exit(1);
}
console.log(`WPP CTA ATTRIBUTION PASS: ${attributed}/${total} outbound CTA link(s) attributed; 0 bare.`);
