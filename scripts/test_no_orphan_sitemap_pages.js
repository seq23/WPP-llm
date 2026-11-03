#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * No orphan sitemap pages, proven on the assembled site.
 *
 * A URL in the sitemap that no other page links to is an orphan: the sitemap
 * announces it, nothing on the site claims it is worth reading, and Google
 * crawls it last if at all.
 *
 * This reads the ASSEMBLED output, not the committed HTML, because the finish
 * (scripts/lib/page_finish.js) replaces every page's header and footer on
 * deploy. scripts/link_graph_report.js measures the committed HTML and so saw
 * no orphan while the live site had two: /atlas and /how-west-peek-helps were
 * linked only from the old committed chrome that the finish throws away
 * (Search Readiness b7, confirmed by crawl 3 Nov 2026). Any future link that
 * lives only in pre-finish markup fails here instead of shipping.
 *
 * RULE 0: zero sitemap URLs, zero assembled pages, or zero resolved internal
 * links is a failure, not a pass - that is a broken scan, not a clean site.
 *
 * Negative proof: `--self-test` runs the same inbound-link computation over a
 * fixture whose sitemap lists a page nothing links to, and must report it.
 *
 * Usage:
 *   node scripts/test_no_orphan_sitemap_pages.js --self-test
 *   node scripts/test_no_orphan_sitemap_pages.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DOMAIN_RE = /^https?:\/\/(?:www\.)?virtualagency-os\.com/i;

/** One canonical route string for a URL, href or file path. */
function route(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  s = s.replace(DOMAIN_RE, '');
  s = s.split('#')[0].split('?')[0];
  if (!s.startsWith('/')) s = `/${s}`;
  s = s.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s === '' ? '/' : s;
}

const isInternal = (href) => {
  const h = String(href || '').trim();
  if (!h || h.startsWith('#')) return false;
  if (DOMAIN_RE.test(h)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return false; // mailto:, tel:, http(s) elsewhere
  if (h.startsWith('//')) return false;
  return h.startsWith('/');
};

const ASSET_RE = /\.(?:css|js|png|jpe?g|gif|svg|webp|ico|txt|xml|json|webmanifest|pdf|woff2?)$/i;

/**
 * @param {{route:string, html:string}[]} pages
 * @param {string[]} sitemapRoutes
 * @returns {{orphans:string[], edges:number, inbound:Map<string,number>}}
 */
function findOrphans(pages, sitemapRoutes) {
  const inbound = new Map();
  let edges = 0;
  for (const page of pages) {
    const from = page.route;
    const seen = new Set();
    for (const m of page.html.matchAll(/<a\b[^>]*href="([^"]*)"/gi)) {
      const href = m[1].replace(/&amp;/g, '&');
      if (!isInternal(href)) continue;
      const to = route(href);
      if (!to || ASSET_RE.test(to) || to === from) continue;
      if (seen.has(to)) continue;
      seen.add(to);
      inbound.set(to, (inbound.get(to) || 0) + 1);
      edges += 1;
    }
  }
  const orphans = sitemapRoutes.filter((r) => r !== '/' && !(inbound.get(r) > 0));
  return { orphans, edges, inbound };
}

if (process.argv.includes('--self-test')) {
  const fixture = [
    { route: '/', html: '<a href="/linked">Linked</a><a href="https://elsewhere.example/x">Out</a>' },
    { route: '/linked', html: '<a href="/">Home</a>' },
  ];
  const res = findOrphans(fixture, ['/', '/linked', '/lonely']);
  if (res.orphans.join(',') !== '/lonely') {
    console.error(`test:no-orphan-sitemap-pages self-test FAILED: expected /lonely to be reported, got [${res.orphans.join(', ')}]`);
    process.exit(1);
  }
  if (res.edges !== 2) {
    console.error(`test:no-orphan-sitemap-pages self-test FAILED: expected 2 internal edges, counted ${res.edges}`);
    process.exit(1);
  }
  console.log('test:no-orphan-sitemap-pages self-test OK: a sitemap page nothing links to is reported, and an external link is not an edge');
  process.exit(0);
}

const sitemapXml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const sitemapRoutes = [...new Set((sitemapXml.match(/<loc>([^<]+)<\/loc>/g) || [])
  .map((l) => route(l.replace(/<\/?loc>/g, ''))).filter(Boolean))];
if (!sitemapRoutes.length) {
  console.error('test:no-orphan-sitemap-pages FAILED: sitemap.xml yielded zero URLs - the scan is broken, not the site.');
  process.exit(1);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-sitemap-'));
try {
  execFileSync('node', [path.join(ROOT, 'scripts/assemble_pages_output.js')], {
    cwd: ROOT, env: { ...process.env, PAGES_ASSEMBLE_OUT: out }, stdio: 'ignore',
  });
  const files = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      if (fs.statSync(f).isDirectory()) walk(f);
      else if (n.endsWith('.html')) files.push(f);
    }
  })(out);
  if (!files.length) {
    console.error('test:no-orphan-sitemap-pages FAILED: the assembled site contained zero HTML pages.');
    process.exit(1);
  }
  const pages = files.map((f) => ({
    route: route(path.relative(out, f).replace(/\\/g, '/')),
    html: fs.readFileSync(f, 'utf8'),
  }));
  const { orphans, edges } = findOrphans(pages, sitemapRoutes);
  if (!edges) {
    console.error('test:no-orphan-sitemap-pages FAILED: resolved zero internal links across the assembled site - the scan is broken, not the site.');
    process.exit(1);
  }
  if (orphans.length) {
    console.error(`test:no-orphan-sitemap-pages FAILED: ${orphans.length} of ${sitemapRoutes.length} sitemap URLs are linked from no assembled page:`);
    for (const o of orphans.slice(0, 25)) console.error(`  - ${o}`);
    console.error('Link them from the finished chrome (scripts/lib/page_finish.js) or from another page body - a link that lives only in pre-finish markup does not ship.');
    process.exit(1);
  }
  console.log(`test:no-orphan-sitemap-pages OK: all ${sitemapRoutes.length} sitemap URLs are linked from the assembled site (${pages.length} pages, ${edges} internal links)`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
