#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_redirects');

// virtualagency-os.com is the educational/citation layer; westpeekproductions.com
// is the commercial destination and holds the only hosted inquiry form in the
// portfolio. #start-inquiry is the section that form sits in.
// Since 2 Nov 2026 every inquiry goes through /go/plan, which counts the visit
// (Cloudflare Web Analytics) and opens the West Peek Productions inquiry form.
function wppInquiry(content) {
  return `/go/plan?from=${content}&at=guessed-route`;
}
const WPP_GUESSED_ROUTES = [
  ['/contact', 'contact'],
  ['/book', 'book'],
  ['/booking', 'booking'],
  ['/contact-us', 'contact-us'],
  ['/get-started', 'get-started'],
  ['/start', 'start'],
  ['/hire-us', 'hire-us'],
  ['/quote', 'quote'],
  ['/get-a-quote', 'get-a-quote'],
  ['/request-a-quote', 'request-a-quote'],
  ['/scope', 'scope'],
  ['/scoping', 'scoping'],
  ['/inquiry', 'inquiry'],
];

// Legacy URLs search engines still hold as 404. The list and each target's reason
// live in data/redirects/legacy_404_redirects.json; validate_redirect_targets.js
// proves every target is a page this build publishes and is not itself redirected.
const LEGACY_404 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/redirects/legacy_404_redirects.json'), 'utf8')).rules;
if (!Array.isArray(LEGACY_404) || LEGACY_404.length === 0) {
  console.error('data/redirects/legacy_404_redirects.json has no rules; refusing to write a _redirects that silently drops them.');
  process.exit(1);
}

// URLs Search Console measured that this build answers with a 404 (149 on 11 Oct
// 2026, 5,366 of ~7,474 90-day impressions). Written by
// scripts/build_measured_404_redirects.js from the measurement files; each lands
// on its /programmatic/ twin, else its fold_into hub.
const MEASURED_404 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/redirects/measured_404_redirects.json'), 'utf8')).rules;
if (!Array.isArray(MEASURED_404) || MEASURED_404.length === 0) {
  console.error('data/redirects/measured_404_redirects.json has no rules; refusing to write a _redirects that silently drops them.');
  process.exit(1);
}
const LEGACY_FROM = new Set(LEGACY_404.map((r) => r.from));

// Duplicate families Google folded into the homepage, consolidated onto the
// indexed family page (data/seo/duplicate_family_consolidation.json). Legacy and
// measured rules that once pointed at a retired variant are re-pointed at its
// keeper in their own data files, so validate_redirect_targets.js still compares
// _redirects against one source per rule.
const CONSOLIDATED = require('./lib/consolidated_families.js').redirectRules();

const lines = [
  '# Canonical policy: clean URLs are canonical.',
  '# Do NOT redirect clean URLs to .html. Most static hosts strip .html automatically;',
  '# adding reverse redirects creates ERR_TOO_MANY_REDIRECTS on navigation.',
  '# Only legacy aliases that do not point to .html are allowed here.',
  '# These used to point at /virtual-event-production-for-nonprofits, which no build',
  '# has published, so each was a 301 into a 404. The /programmatic/ nonprofit variant',
  '# is noindex, so they land on the indexable overview of the same topic.',
  '/virtual-event-production-for-nonprofit /programmatic/virtual-event-production 301',
  '/virtual-event-production-for-nonprofit.html /programmatic/virtual-event-production 301',
  '/virtual-event-production-for-nonprofits /programmatic/virtual-event-production 301',
  '',
  '# Every path a buyer guesses when they want to talk to someone. Each of these',
  '# 404d across the whole sitemap while the property ranked for the highest-CPC',
  '# terms in the portfolio, so the only route to a human was a mailto buried in a',
  '# page footer.',
  '#',
  '# They used to land on /contact, an on-domain brief builder that assembled a',
  '# mailto in the browser. A mailto cannot capture a lead: it needs a configured',
  '# mail client and then an actual send, and nobody can ever count the buyers who',
  '# did neither. That is the same silent loss this redirect block exists to stop.',
  '# westpeekproductions.com carries a hosted inquiry form, so these routes and',
  '# /contact itself now land on its inquiry section. Each carries its own',
  '# utm_content so the guessed path that earned the visit stays legible.',
  ...WPP_GUESSED_ROUTES.map(([from, content]) => `${from} ${wppInquiry(content)} 301`),
  '/pricing /tools/production-scoping-calculator 301',
  '/calculator /tools/production-scoping-calculator 301',
  '',
  '# Legacy URLs Bing still held as 404 (25 Sep 2026). Each lands on the live page on',
  '# the same topic; see data/redirects/legacy_404_redirects.json for the reason per rule.',
  ...LEGACY_404.map((r) => `${r.from} ${r.to} 301`),
  '',
  '# URLs Search Console measured that 404d while the same page lived under',
  '# /programmatic/. See data/redirects/measured_404_redirects.json.',
  ...MEASURED_404.filter((r) => !LEGACY_FROM.has(r.from)).map((r) => `${r.from} ${r.to} 301`),
  '',
  '# /programmatic/ variants Google reported as duplicates of the homepage, merged into',
  '# the indexed page of their family. See data/seo/duplicate_family_consolidation.json.',
  ...CONSOLIDATED.map((r) => `${r.from} ${r.to} 301`),
  '',
  '# Cloudflare Pages deploys this repository root and offers no exclude list for',
  '# a root deploy, so README.md, package.json, AGENTS.md and everything under',
  '# scripts/ were served as raw text from virtualagency-os.com. These rules 404',
  '# the non-public paths. Emitted here because this script owns _redirects.',
  '/README.md /404 404',
  '/package.json /404 404',
  '/package-lock.json /404 404',
  '/AGENTS.md /404 404',
  '/scripts/* /404 404',
  '/data/* /404 404',
  '/docs/* /404 404',
  '/reports/* /404 404',
  '/artifacts/* /404 404',
  '/tests/* /404 404',
  ''
];
// Pages consolidated into the strongest page of their topic (scripts/lib/prune.js,
// data/seo/prune_ledger.json). With every rule above whose source sits under a
// content prefix, that is ~3,000 rules, and Pages serves at most 2,000 static
// and 100 dynamic _redirects rules. Pages serves a deployed file before any
// redirect, and consolidated pages are not deployed, so a splat over a slug
// prefix only ever fires for consolidated (or never-existing) URLs: each prefix
// whose consolidated pages all land on one page becomes one rule. The full
// per-URL map is kept in data/redirects/consolidation_map.json for the
// validators, and test:prune proves the compressed rules answer every entry
// exactly as the map does.
const prune = require('./lib/prune.js');
const PREFIXES = ['/programmatic/', '/query-atlas/', '/topics/', '/answers/', '/insights/', '/learn/'];
const underPrefix = (from) => PREFIXES.some((p) => from.startsWith(p));
const norm = (r) => (r.length > 1 ? r.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/\/+$/, '') : r);
const all = new Map();
for (const line of lines) {
  const m = line.match(/^(\/\S*)\s+(\S+)\s+(301|302|308)$/);
  if (m && !m[1].includes('*')) all.set(norm(m[1]), m[2]);
}
for (const r of prune.redirectRules()) if (!all.has(r.from)) all.set(r.from, r.to);
const finalOf = (to) => {
  let cur = to;
  for (let i = 0; i < 12; i += 1) {
    if (!cur.startsWith('/')) return cur;
    const next = all.get(norm(cur.split('#')[0].split('?')[0]));
    if (!next || next === cur) return cur;
    cur = next;
  }
  throw new Error(`_redirects: redirect loop through ${to}`);
};
const map = {};
const kept = [];
for (const line of lines) {
  const m = line.match(/^(\/\S*)\s+(\S+)\s+(301|302|308)$/);
  if (!m || m[1].includes('*')) { kept.push(line); continue; }
  const to = finalOf(m[2]);
  if (underPrefix(m[1])) {
    // A .html alias of a live page would shadow it once keyed by its clean path.
    if (m[1] !== norm(m[1]) && fs.existsSync(path.join(ROOT, `${norm(m[1]).replace(/^\//, '')}.html`)) && !prune.isRedirected(norm(m[1]))) continue;
    map[norm(m[1])] = to;
    continue;
  }
  kept.push(`${m[1]} ${to} ${m[3]}`);
}
for (const r of prune.redirectRules()) if (!map[r.from]) map[r.from] = finalOf(r.to);

// Compress: for each entry, the shortest word-boundary slug prefix under which
// every map entry shares its target; one rule per prefix.
const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
const exact = [];
const splats = [];
const done = new Set();
for (const [from, to] of entries) {
  if (done.has(from)) continue;
  const dir = from.slice(0, from.lastIndexOf('/') + 1);
  const words = from.slice(dir.length).split('-');
  let chosen = null;
  for (let k = 1; k < words.length; k += 1) {
    const prefix = `${dir}${words.slice(0, k).join('-')}-`;
    const under = entries.filter(([f]) => f.startsWith(prefix));
    if (under.length > 1 && under.every(([, t]) => t === to)) { chosen = { prefix, under }; break; }
  }
  if (chosen) { splats.push(`${chosen.prefix}* ${to} 301`); for (const [f] of chosen.under) done.add(f); }
  else { exact.push(`${from} ${to} 301`); done.add(from); }
}
const STATIC_LIMIT = 2000;
const DYNAMIC_LIMIT = 100;
const isRule = (l) => /^\/\S*\s+\S+\s+\d{3}$/.test(l);
const out = [...kept, '', '# Pages consolidated into the strongest page of their topic (data/seo/prune_ledger.json).',
  '# Full map: data/redirects/consolidation_map.json. Exact rules first, then one splat per slug prefix.', ...exact, ...splats, ''];
const staticRules = out.filter((l) => isRule(l) && !l.split(/\s+/)[0].includes('*')).length;
const dynamicRules = out.filter((l) => isRule(l) && l.split(/\s+/)[0].includes('*')).length;
if (staticRules > STATIC_LIMIT || dynamicRules > DYNAMIC_LIMIT) {
  console.error(`_redirects would hold ${staticRules} static / ${dynamicRules} dynamic rules; Cloudflare Pages ignores everything past ${STATIC_LIMIT} / ${DYNAMIC_LIMIT}.`);
  process.exit(1);
}
fs.writeFileSync(path.join(ROOT, 'data/redirects/consolidation_map.json'), `${JSON.stringify(Object.fromEntries(entries), null, 1)}\n`);
fs.writeFileSync(OUT, out.join('\n'));
console.log(`Updated _redirects: ${staticRules} static and ${dynamicRules} dynamic rules (limits ${STATIC_LIMIT}/${DYNAMIC_LIMIT}); ${entries.length} consolidated URLs in data/redirects/consolidation_map.json.`);
