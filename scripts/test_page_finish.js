#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Behaviour of the published page finish (scripts/lib/page_finish.js), proven on
 * the real assembled site, not on the repo HTML: the assembler is where the
 * finish happens, so this assembles into a temp dir and reads what would deploy.
 *
 * Every published content page must carry: one header with the inquiry button,
 * a conversion box placed before the first H2 (above the fold, under the
 * answer), inquiry links that go through /go/plan, no keyword block, and - if it
 * declares FAQPage schema - a visible FAQ.
 *
 * No published page (go/ and admin/ included) may carry a hard-coded Cloudflare
 * Web Analytics beacon: the zone auto-installs it at the edge, so a second copy
 * counts every visit twice.
 *
 * Negative proof: `--self-test` runs the same checks on a committed page as it
 * sits in the repo (no finish) and must see them fail.
 * RULE 0: every sitemapped page must be among those checked; fewer pages than
 * the sitemap lists (or an empty sitemap) is a failure. The floor follows the
 * site's real size, so a consolidation never needs the number edited.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { hasVisibleFaq } = require('./lib/page_finish.js');
const { namesTheSite, inBand } = require('./lib/title_brand.js');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP_URLS = (fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length;
const MIN_PAGES = Math.max(1, SITEMAP_URLS);

function problems(html) {
  const out = [];
  if ((html.match(/<header\b/g) || []).length !== 1) out.push('not exactly one header');
  if (!/<header class="site-header"[\s\S]*?href="\/go\/plan\?[^"]*"[^>]*>Get a production plan<\/a>[\s\S]*?<\/header>/.test(html)) out.push('header has no inquiry button');
  const box = html.indexOf('class="cta-box"');
  const h2 = html.search(/<h2[\s>]/);
  if (box < 0) out.push('no conversion box');
  else if (h2 > -1 && box > h2 && !/class="quick-answer"|id="recommendation-summary"/.test(html.slice(0, box))) out.push('conversion box is below the first section');
  // A link may leave for westpeekproductions.com only as the logo, a link marked
  // as leaving (its words end in "↗", owner 7 Nov 2026: the one main door) or a
  // link whose words are the address; any other wording is an inquiry and goes
  // through /go/plan (test:main-door proves the door links themselves).
  for (const m of html.matchAll(/<a\b([^>]*href="https?:\/\/(?:www\.)?westpeekproductions\.com[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)) {
    const label = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (/class="brand"/.test(m[1]) || /\u2197$/.test(label) || /^(?:https?:\/\/)?(?:www\.)?westpeekproductions\.com\/?/i.test(label)) continue;
    out.push(`inquiry link "${label}" bypasses /go/plan`);
    break;
  }
  if (/Common ways this gets searched|class="fanout-block"/.test(html)) out.push('keyword block still published');
  // Search Readiness b2: the served description fits in 160 characters.
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (desc && desc.replace(/&amp;/g, '&').replace(/&#39;|&quot;/g, "'").length > 160) out.push(`meta description is ${desc.length} chars, over 160`);
  if (/"@type"\s*:\s*"FAQPage"/.test(html) && !hasVisibleFaq(html)) out.push('FAQPage schema without a visible FAQ');
  // Page shape: the finished WebPage schema carries the published date (the
  // Hopin page shipped without one on 7 Nov 2026: new since the last
  // seo:first-published run). Any page with a byline is a content page.
  const webPage = (html.match(/<script type="application\/ld\+json" data-page-finish>(\{"@context":"https:\/\/schema\.org","@type":"WebPage"[\s\S]*?)<\/script>/) || [])[1];
  if (/class="byline"/.test(html) && !(webPage && /"datePublished":"\d{4}-\d{2}-\d{2}"/.test(webPage))) out.push('WebPage schema has no datePublished (run npm run seo:first-published)');
  // Search Readiness b1 and b10 read the SERVED title, and the finish rewrites it,
  // so they are proven here on the assembled page, not on the committed one.
  const t = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, '·').trim();
  if (!inBand(t)) out.push(`title is ${t.length} chars, outside 30-65 ("${t}")`);
  if (!namesTheSite(t)) out.push(`title does not name the site ("${t}")`);
  return out;
}

const pick = (dir) => {
  const files = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      if (fs.statSync(f).isDirectory()) { if (!['admin', 'go'].includes(n)) walk(f); } else if (n.endsWith('.html') && n !== '404.html') files.push(f);
    }
  };
  walk(dir);
  return files;
};

if (process.argv.includes('--self-test')) {
  const raw = fs.readFileSync(path.join(ROOT, 'programmatic/webinar-production.html'), 'utf8');
  const p = problems(raw);
  if (!p.length) { console.error('test:page-finish self-test FAILED: an unfinished page passed the checks'); process.exit(1); }
  // The two served-title defects of 7 Nov 2026 must each be reported.
  const finished = (title) => problems(`<header class="site-header"><a href="/go/plan?from=x" class="btn">Get a production plan</a></header><title>${title}</title><p class="cta-box"></p>`);
  const long = finished('When Is West Peek Productions the Right Fit? | West Peek Productions');
  const bare = finished('Best Virtual Conference Platforms Buyer Guide');
  const good = finished('Best Virtual Conference Platforms Buyer Guide | VirtualAgency OS');
  if (!long.some((x) => /outside 30-65/.test(x)) || !bare.some((x) => /does not name the site/.test(x)) || good.length) {
    console.error(`test:page-finish self-test FAILED: title checks did not separate bad from good (long: ${long}; bare: ${bare}; good: ${good})`); process.exit(1);
  }
  const ld = (d) => `<script type="application/ld+json" data-page-finish>{"@context":"https://schema.org","@type":"WebPage"${d}}</script>`;
  const undated = finished(`Best Virtual Conference Platforms Buyer Guide | VirtualAgency OS</title><p class="byline"></p>${ld('')}<title>`);
  const dated = finished(`Best Virtual Conference Platforms Buyer Guide | VirtualAgency OS</title><p class="byline"></p>${ld(',"datePublished":"2026-11-07"')}<title>`);
  if (!undated.some((x) => /no datePublished/.test(x)) || dated.length) { console.error(`test:page-finish self-test FAILED: published-date check did not separate (undated: ${undated}; dated: ${dated})`); process.exit(1); }
  console.log(`test:page-finish self-test OK: an unfinished page fails (${p.join('; ')})`);
  process.exit(0);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'page-finish-'));
execFileSync('node', [path.join(ROOT, 'scripts/assemble_pages_output.js')], { cwd: ROOT, env: { ...process.env, PAGES_ASSEMBLE_OUT: out }, stdio: 'ignore' });
const files = pick(out).filter((f) => !/\/index\.html$/.test(f) || /\/answers\/index\.html$/.test(f));
const bad = [];
const allHtml = [];
(function walkAll(d) { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walkAll(f); else if (n.endsWith('.html')) allHtml.push(f); } })(out);
for (const f of allHtml) {
  if (/cloudflareinsights\.com\/beacon|data-cf-beacon/.test(fs.readFileSync(f, 'utf8'))) bad.push(`${path.relative(out, f)}: hard-coded analytics beacon (Cloudflare injects it at the edge)`);
}
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  if (/http-equiv="refresh"/.test(html) && /name="robots" content="noindex/.test(html)) continue; // consolidation redirect stub
  const p = problems(html);
  if (p.length) bad.push(`${path.relative(out, f)}: ${p.join('; ')}`);
}
// b1 also says unique: no two indexable served pages share a title.
const byTitle = new Map();
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  if (/name="robots" content="[^"]*noindex/.test(html)) continue;
  const t = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
  byTitle.set(t, [...(byTitle.get(t) || []), path.relative(out, f)]);
}
for (const [t, rels] of byTitle) if (rels.length > 1) bad.push(`${rels.join(', ')}: share the title "${t}"`);
// Every hand-written served name points at a page that exists.
for (const rel of Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seo/served_title_names.json'), 'utf8')).names || {})) {
  if (!fs.existsSync(path.join(ROOT, rel))) bad.push(`data/seo/served_title_names.json: ${rel} does not exist`);
}
fs.rmSync(out, { recursive: true, force: true });
if (allHtml.length < files.length) { console.error('test:page-finish beacon scan saw fewer pages than the finish check'); process.exit(1); }
// Floor: every page the sitemap lists is among those checked (section index pages
// are exempt from the finish check, as above, so they are exempt here too). This
// used to compare counts - checked files >= sitemap URLs - which failed once
// accepted rewrites made 12 already-checked pages indexable (6-7 Nov 2026: 161
// checked, 167 listed, every listed page checked) and blocked Query Intelligence.
const { sitemapPaths, candidates } = require('./lib/sitemap_floor.js');
const checked = new Set(files.map((f) => path.relative(out, f).replace(/\\/g, '/')));
const exempt = (rel) => /(^|\/)index\.html$/.test(rel) && !/^answers\/index\.html$/.test(rel);
const unchecked = [];
let listedChecked = 0;
for (const url of sitemapPaths(ROOT)) {
  const rel = candidates(url).find((f) => fs.existsSync(path.join(ROOT, f)));
  if (rel && exempt(rel)) continue;
  if (rel && checked.has(rel)) listedChecked += 1; else unchecked.push(`${url}${rel ? ` (${rel})` : ' (not built)'}`);
}
if (!SITEMAP_URLS || unchecked.length || !listedChecked) { console.error(`test:page-finish floor: ${unchecked.length} sitemap page(s) not checked in the assembled site (${listedChecked} checked of ${SITEMAP_URLS} listed):\n  ${unchecked.slice(0, 15).join('\n  ')}`); process.exit(1); }
if (bad.length) { console.error(`test:page-finish FAILED on ${bad.length} of ${files.length} pages:\n  ${bad.slice(0, 15).join('\n  ')}`); process.exit(1); }
console.log(`test:page-finish OK: ${files.length} published pages finished`);
