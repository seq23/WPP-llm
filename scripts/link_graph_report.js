#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Internal link graph report.
 *
 * Answers two questions from the rendered HTML, not from the sitemap:
 *
 *   1. How many inbound internal links does each page have? A page with zero is
 *      an orphan: nothing on the site claims it is worth reading, so a crawler
 *      has no reason to want it. Submitting it via IndexNow or a sitemap
 *      announces the URL; it does not create the demand signal.
 *   2. How far is each page from the homepage, measured in clicks along those
 *      links? Depth is the crawler's own budget question. Pages beyond three
 *      hops are reached late, refreshed rarely, or not at all.
 *
 * Both are computed by parsing every href out of every shipped .html file and
 * resolving it to a route the same way the server would - clean URL first,
 * then .html, then directory index. That is deliberately the same resolution
 * order as scripts/validate_internal_links.js so the two agree about what an
 * internal link is.
 *
 * Usage:
 *   node scripts/link_graph_report.js               # human summary
 *   node scripts/link_graph_report.js --json        # machine-readable
 *   node scripts/link_graph_report.js --json --out FILE
 *   node scripts/link_graph_report.js --orphans 50  # list N sample orphans
 *   node scripts/link_graph_report.js --edges FILE  # dump route->route edges
 *
 * Exit code is always 0: this reports, it does not gate. Gating lives in the
 * validator registry.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set([
  '.git', '.github', '.pages-output', '.build', '.clarity',
  'node_modules', 'logs', 'artifacts', 'reports', 'docs',
  'scripts', 'distribution_scripts', 'data', 'content', 'releases', 'seo',
]);
// Routes that exist but are not part of the public reader-facing graph.
const EXCLUDE_ROUTES = new Set(['/404']);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}

/** Rendered file path -> canonical clean route, matching validate_canonical_routes.js. */
function routeOf(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel.replace(/\.html$/, '');
}

/** Normalise a route for graph identity: no trailing slash except root. */
function normRoute(r) {
  if (!r) return null;
  let s = r.split('#')[0].split('?')[0];
  if (!s.startsWith('/')) return null;
  if (s === '/') return '/';
  return s.replace(/\/+$/, '') || '/';
}

const files = walk(ROOT);
const routeToFile = new Map();
for (const rel of files) {
  const r = normRoute(routeOf(rel));
  if (!r || EXCLUDE_ROUTES.has(r)) continue;
  // One route = one record. If two files claim a route, that is a duplicate-slug
  // bug elsewhere; report it rather than silently picking one.
  if (routeToFile.has(r) && routeToFile.get(r) !== rel) {
    console.error(`WARNING duplicate route ${r}: ${routeToFile.get(r)} and ${rel}`);
  }
  routeToFile.set(r, rel);
}

/** Resolve an href found in `fromFile` to a known internal route, or null. */
function resolveHref(fromFile, href) {
  if (!href) return null;
  if (/^(https?:|mailto:|tel:|javascript:|data:|#|\/\/)/i.test(href)) {
    // Absolute links back to our own canonical host still count as internal.
    const m = href.match(/^https?:\/\/(?:www\.)?virtualagency-os\.com(\/[^\s"']*)?$/i);
    if (!m) return null;
    href = m[1] || '/';
  }
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;
  const abs = clean.startsWith('/')
    ? clean
    : '/' + path.posix.normalize(path.posix.join(path.posix.dirname('/' + fromFile), clean)).replace(/^\/+/, '');
  const candidates = [];
  const n = normRoute(abs);
  if (n) candidates.push(n);
  // /foo.html in an href points at the same record as /foo
  if (n && n.endsWith('.html')) candidates.push(n.replace(/\.html$/, ''));
  if (n && n.endsWith('/index.html')) candidates.push(normRoute(n.slice(0, -'index.html'.length)));
  for (const c of candidates) {
    if (c && routeToFile.has(c)) return c;
  }
  return null;
}

/** Pull hrefs, skipping <head> link rel= elements which are not navigation. */
const HREF_RE = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>/gi;

const outbound = new Map();   // route -> Set(route)
const inbound = new Map();    // route -> count of distinct source routes
const anchorTexts = new Map();// route -> Set(anchor text)
const hrefCounts = new Map(); // file -> total <a href> count (loss check)
const visibleTextLen = new Map();

for (const [route, rel] of routeToFile) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  hrefCounts.set(route, (html.match(/<a\b[^>]*?href=/gi) || []).length);
  visibleTextLen.set(route, html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length);
  const targets = new Set();
  let m;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html))) {
    const t = resolveHref(rel, m[1]);
    if (!t || t === route) continue;
    targets.add(t);
    const after = html.slice(HREF_RE.lastIndex);
    const close = after.indexOf('</a>');
    if (close >= 0 && close < 400) {
      const text = after.slice(0, close).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) {
        if (!anchorTexts.has(t)) anchorTexts.set(t, new Set());
        anchorTexts.get(t).add(text);
      }
    }
  }
  outbound.set(route, targets);
}

for (const route of routeToFile.keys()) inbound.set(route, 0);
let totalEdges = 0;
for (const [, targets] of outbound) {
  for (const t of targets) {
    inbound.set(t, (inbound.get(t) || 0) + 1);
    totalEdges += 1;
  }
}

// Click depth: BFS from the homepage over outbound links.
const depth = new Map();
if (routeToFile.has('/')) {
  depth.set('/', 0);
  let frontier = ['/'];
  while (frontier.length) {
    const next = [];
    for (const r of frontier) {
      for (const t of outbound.get(r) || []) {
        if (!depth.has(t)) { depth.set(t, depth.get(r) + 1); next.push(t); }
      }
    }
    frontier = next;
  }
}

const allRoutes = [...routeToFile.keys()].sort();
const orphans = allRoutes.filter((r) => r !== '/' && (inbound.get(r) || 0) === 0);
const unreachable = allRoutes.filter((r) => !depth.has(r));

const depthHistogram = {};
for (const r of allRoutes) {
  const d = depth.has(r) ? depth.get(r) : 'unreachable';
  depthHistogram[d] = (depthHistogram[d] || 0) + 1;
}

const inboundValues = allRoutes.map((r) => inbound.get(r) || 0);
const sum = inboundValues.reduce((a, b) => a + b, 0);
const sorted = [...inboundValues].sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

/** Anchor-text diversity: the share of links to a page that repeat one phrase. */
let repeatedAnchorPages = 0;
for (const [r, texts] of anchorTexts) {
  if ((inbound.get(r) || 0) >= 5 && texts.size <= 1) repeatedAnchorPages += 1;
}

const byPrefix = {};
for (const r of allRoutes) {
  const key = r === '/' ? '/' : '/' + r.split('/')[1];
  byPrefix[key] = byPrefix[key] || { pages: 0, orphans: 0, deeper_than_3: 0 };
  byPrefix[key].pages += 1;
  if (r !== '/' && (inbound.get(r) || 0) === 0) byPrefix[key].orphans += 1;
  const d = depth.get(r);
  if (d === undefined || d > 3) byPrefix[key].deeper_than_3 += 1;
}

const report = {
  generated_at: new Date().toISOString(),
  pages: allRoutes.length,
  internal_links: totalEdges,
  orphans: orphans.length,
  unreachable_from_homepage: unreachable.length,
  reachable_within_3_clicks: allRoutes.filter((r) => depth.has(r) && depth.get(r) <= 3).length,
  average_inbound_links_per_page: Number((sum / (allRoutes.length || 1)).toFixed(2)),
  median_inbound_links_per_page: median,
  max_inbound_links: sorted.length ? sorted[sorted.length - 1] : 0,
  click_depth_histogram: depthHistogram,
  pages_with_single_repeated_anchor_text: repeatedAnchorPages,
  by_section: byPrefix,
  total_href_attributes: [...hrefCounts.values()].reduce((a, b) => a + b, 0),
  total_visible_text_chars: [...visibleTextLen.values()].reduce((a, b) => a + b, 0),
};

const orphanSample = Number(value('--orphans', 0));
if (orphanSample > 0) report.orphan_sample = orphans.slice(0, orphanSample);

const edgesOut = value('--edges');
if (edgesOut) {
  const lines = [];
  for (const [from, targets] of [...outbound].sort()) {
    for (const t of [...targets].sort()) lines.push(`${from}\t${t}`);
  }
  fs.writeFileSync(edgesOut, lines.join('\n') + '\n');
}

// Per-page facts, used by the no-link-lost check across a batch.
const perPageOut = value('--per-page');
if (perPageOut) {
  const rows = allRoutes.map((r) => ({
    route: r,
    file: routeToFile.get(r),
    hrefs: hrefCounts.get(r) || 0,
    text_chars: visibleTextLen.get(r) || 0,
    inbound: inbound.get(r) || 0,
    depth: depth.has(r) ? depth.get(r) : null,
    outbound: [...(outbound.get(r) || [])].sort(),
  }));
  fs.writeFileSync(perPageOut, JSON.stringify(rows, null, 1) + '\n');
}

const out = value('--out');
const text = flag('--json')
  ? JSON.stringify(report, null, 2)
  : [
    `pages                     ${report.pages}`,
    `internal links            ${report.internal_links}`,
    `orphans (0 inbound)       ${report.orphans}`,
    `unreachable from /        ${report.unreachable_from_homepage}`,
    `reachable in <= 3 clicks  ${report.reachable_within_3_clicks}`,
    `avg inbound per page      ${report.average_inbound_links_per_page}`,
    `median inbound per page   ${report.median_inbound_links_per_page}`,
    '',
    'click depth from homepage:',
    ...Object.entries(depthHistogram)
      .sort((a, b) => (a[0] === 'unreachable' ? 1 : b[0] === 'unreachable' ? -1 : a[0] - b[0]))
      .map(([d, n]) => `  ${String(d).padStart(11)}  ${n}`),
    '',
    'by section:',
    ...Object.entries(byPrefix).sort().map(([k, v]) =>
      `  ${k.padEnd(16)} pages ${String(v.pages).padStart(5)}  orphans ${String(v.orphans).padStart(5)}  deeper than 3 ${String(v.deeper_than_3).padStart(5)}`),
  ].join('\n');

if (out) fs.writeFileSync(out, text + '\n');
console.log(text);
