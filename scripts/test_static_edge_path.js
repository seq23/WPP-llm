#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Contract test: every public page and the sitemap are served by Cloudflare
 * Pages' static asset path with its response unchanged and no headers that
 * forbid caching. Retired routes may redirect in middleware.
 *
 * Why (21 Oct 2026): HTML showed `cf-cache-status: DYNAMIC` with 380-555 ms
 * TTFB and the suspicion was a Function running on every request. There was
 * none. DYNAMIC is the normal label for Pages static assets (the zone cache is
 * not in front of Pages; the asset server keeps its own colo cache). An A/B on
 * a preview deployment with a Cache API middleware keyed by commit SHA moved
 * median server time by 5-10 ms, inside noise, while adding a billable
 * invocation per request and a per-colo cache that every automated deploy to
 * main would empty. The slow TTFB was network: the zone's anycast IPs landed
 * this client in ARN/SJC instead of DFW a third to half of the time.
 *
 * Kept pages still use the static asset server. The retirement middleware must
 * return next() unchanged for each guarded page and sitemap request. Fail on:
 *   1. a Worker replacing assets, an unexpected Function, or middleware that
 *      intercepts a guarded GET/HEAD or changes the static response
 *   2. cache-forbidding page/sitemap headers
 *   3. zero static 301 rules
 *   4. zero sitemap URLs
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.STATIC_EDGE_ROOT
  ? path.resolve(process.env.STATIC_EDGE_ROOT)
  : path.resolve(__dirname, '..');
const failures = [];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

// Pages pattern -> RegExp. `*` (splat) spans segments; `:name` is one segment.
function patternToRegex(pattern) {
  const esc = pattern
    .split('*').map((part) => part
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:[A-Za-z0-9_]+/g, '[^/]+'))
    .join('.*');
  return new RegExp(`^${esc}$`);
}

// 4. The pages under test.
const sitemap = read('sitemap.xml');
const pagePaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1].trim()).pathname);
if (pagePaths.length === 0) failures.push('sitemap.xml lists zero URLs; nothing to guard');
const guarded = [...new Set([...pagePaths, '/', '/sitemap.xml'])];

// 1. Every kept page retains the exact static asset response.
const hasFunctions = exists('functions') && fs.readdirSync(path.join(ROOT, 'functions')).length > 0;
const hasWorker = exists('_worker.js');
if (hasWorker) failures.push('_worker.js replaces the static asset server');
if (hasFunctions) {
  if (fs.readdirSync(path.join(ROOT, 'functions')).some((f) => f !== '_middleware.js')) failures.push('unexpected Function may intercept static pages');
  // Redirect middleware may run first, but every kept page must reach exactly
  // the unchanged static response via next(), for both navigation methods.
  const vm = require('vm');
  const redirects = JSON.parse(read('data/redirects/consolidation_map.json'));
  const source = read('functions/_middleware.js').replace(/^import redirects[^;]+;/m, '').replace('export function onRequest', 'function onRequest');
  const handler = vm.runInNewContext(source + '\nonRequest', { redirects, URL, Response });
  for (const p of guarded) {
    for (const method of ['GET', 'HEAD']) {
      const asset = new Response('static asset', { headers: { 'Cache-Control': 'public, max-age=60' } });
      let calls = 0;
      const response = handler({ request: new Request('https://virtualagency-os.com' + p, { method }), next: () => { calls += 1; return asset; } });
      if (calls !== 1 || response !== asset) failures.push(`${method} ${p} did not preserve the static asset response`);
    }
  }
}

// 2. No header rule may forbid caching a guarded path.
const BAD = /\b(no-store|no-cache|private)\b/i;
let rule = null;
for (const raw of (exists('_headers') ? read('_headers') : '').split('\n')) {
  const line = raw.replace(/\s+$/, '');
  if (!line || line.trimStart().startsWith('#')) continue;
  if (!/^\s/.test(line)) { rule = line.trim(); continue; }
  const m = line.trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
  if (!rule || !m) continue;
  const name = m[1].toLowerCase();
  if ((name === 'cache-control' || name === 'cdn-cache-control' || name === 'cloudflare-cdn-cache-control') && BAD.test(m[2])) {
    const re = patternToRegex(rule.replace(/^https?:\/\/[^/]+/, ''));
    const hit = guarded.find((p) => re.test(p) || re.test(p.replace(/\/$/, '') + '.html'));
    if (hit) failures.push(`_headers rule "${rule}" sets ${m[1]}: ${m[2]} on ${hit}`);
  }
}

// 3. Redirects stay in _redirects, served statically.
const redirects = exists('_redirects') ? read('_redirects') : '';
const n301 = redirects.split('\n').filter((l) => /^\/\S+\s+\S+\s+301\s*$/.test(l.trim())).length;
if (n301 === 0) failures.push('_redirects has zero 301 rules; redirects must stay static');

if (failures.length) {
  console.error(`static-edge-path: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`static-edge-path: OK (${guarded.length} paths static and cacheable, ${n301} static 301 redirects)`);
