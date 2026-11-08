'use strict';
/**
 * The finish every published page gets on its way to the live site
 * (scripts/assemble_pages_output.js calls finishPage for each HTML file).
 *
 * WHY HERE. 2,772 accepted pages are byte-frozen (data/release/
 * frozen_output_registry.json) and a normal build may not rewrite them, so the
 * chrome, the call to action and the reading order could only ever be fixed
 * page by page. The assembler is the one place every published page passes
 * through (it already scopes Clarity and wraps email_off there), so the served
 * page is: the committed HTML + this finish. Nothing here invents content: the
 * body of a kept page is replaced only by an accepted rewrite
 * (data/seo/page_rewrites/, scripts/lib/rewrite_quality.js), and dates come from
 * the committed content history.
 *
 * WHAT (owner, 2 Nov 2026: "make it really easy for conversions ... not a dark
 * mode site ... easy to find answers, easy to click to get a virtual
 * conference CTA box"):
 *   1. One header everywhere: West Peek Productions, five plain links and one
 *      button, "Get a production plan" (one label everywhere).
 *   2. A conversion box under the direct answer and again at the end, and a
 *      sticky button on phones. Every inquiry link goes through /go/plan, which
 *      counts the click (Cloudflare Web Analytics) and opens the inquiry form.
 *   3. Visible junk removed: the "Common ways this gets searched" keyword block,
 *      raw classification pills, the "also searched as" line, the keyword
 *      "Main guide:" anchors, and the official-source/direct-email lines (one
 *      plain contact line stays, in the footer).
 *   4. Page shape (page-shape skill): byline linking to About with published and
 *      updated dates, a visible FAQ wherever FAQPage schema exists (built from
 *      that schema), and WebPage schema with dates and Speakable over the
 *      definition and the FAQ.
 *   5. No analytics snippet here: Cloudflare Web Analytics is auto-installed at
 *      the edge for this zone (as on every other zone), so a hard-coded beacon
 *      would count every visit twice (test:page-finish guards it).
 */
const fs = require('fs');
const path = require('path');
const { contentForPage } = require('./wpp_cta.js');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = 'https://virtualagency-os.com';
const CONTACT_EMAIL = 'scooter@westpeek.ventures';
// The pages are published by the company; no person is credited with words
// they did not write (risk brain), so the author is the organisation.
const AUTHOR = { name: 'West Peek Productions', id: 'https://www.westpeekproductions.com/#organization' };
const ORG_ID = 'https://www.westpeekproductions.com/#organization';
const MARK = 'data-page-finish';

const readJson = (rel, fb) => {
  const abs = path.join(ROOT, rel);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return fb; }
};
const esc = (s) => String(s).replace(/&(?!amp;|lt;|gt;|quot;|#\d+;|#x[0-9a-f]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const fmtDate = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

function routeOf(rel) {
  const r = `/${String(rel).replace(/\\/g, '/').replace(/^\.?\//, '')}`.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return r === '' ? '/' : r;
}

let ctx = null;
function context() {
  if (ctx) return ctx;
  const published = new Map();
  for (const a of readJson('data/content/page_admission_registry.json', { admissions: [] }).admissions || []) {
    const r = String(a.route || '').replace(/\/+$/, '');
    const d = String(a.admitted_at || '').slice(0, 10);
    if (r && d && (!published.has(r) || d < published.get(r))) published.set(r, d);
  }
  for (const [r, d] of Object.entries(readJson('data/seo/first_published.json', { routes: {} }).routes || {})) {
    if (!published.has(r) || d < published.get(r)) published.set(r, d);
  }
  const updated = new Map();
  for (const [url, e] of Object.entries(readJson('data/cadence/lastmod_ledger.json', { entries: {} }).entries || {})) {
    updated.set(url.replace(HOST, '').replace(/\/+$/, '') || '/', e.lastmod);
  }
  const rewrites = new Map();
  const dir = path.join(ROOT, 'data/seo/page_rewrites');
  if (fs.existsSync(dir)) {
    for (const n of fs.readdirSync(dir)) {
      if (!n.endsWith('.json')) continue;
      const rec = readJson(`data/seo/page_rewrites/${n}`, null);
      if (rec && rec.status === 'accepted' && rec.page && rec.page.route) rewrites.set(rec.page.route, rec);
    }
  }
  ctx = { published, updated, rewrites };
  return ctx;
}

function inquiryHref(slug, at) {
  return `/go/plan?from=${encodeURIComponent(slug)}&amp;at=${encodeURIComponent(at)}`;
}

// ---------------------------------------------------------------- chrome --
// West Peek Productions is the one main door (owner rulings 2 Nov and 7 Nov
// 2026). This site is its answer library, so the logo and two marked links in
// the header and footer leave for westpeekproductions.com, and "Library home"
// is the way back to the answers. Before 7 Nov the logo said "West Peek
// Productions home" but opened this site, and no visible link reached the
// company's website at all. `npm run test:main-door` holds the line.
const WPP_SITE = 'https://westpeekproductions.com/';
const WPP_COMMUNITY = 'https://westpeekproductions.com/community-as-a-service/';
const DOOR = [
  [WPP_SITE, 'West Peek Productions \u2197'],
  [WPP_COMMUNITY, 'Community as a service \u2197'],
];
// The home page's one westpeek.live line (owner, 7 Nov 2026): the demo venue,
// a preview only. Enquiries still go to the inquiry form, never to westpeek.live's
// own sign-up forms.
const LIVE_DEMO = 'https://westpeek.live/venue/demo/lobby';
const doorLinks = (cls) => DOOR.map(([h, t]) => `<a class="${cls}" href="${h}">${t}</a>`).join('');
const NAV = [
  ['/', 'Library home'],
  ['/pillars/experiences', 'Virtual events'],
  ['/programmatic/webinar-production', 'Webinars'],
  ['/answers/', 'Answers'],
  ['/about', 'About'],
];
function headerHtml(slug) {
  const links = NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('');
  return `<header class="site-header" ${MARK}><div class="header-inner"><a class="brand" href="${WPP_SITE}" aria-label="West Peek Productions website"><img src="/assets/west-peek-productions-logo.jpeg" alt="West Peek Productions logo" width="36" height="36"><span class="name">West Peek Productions</span></a><nav class="nav" aria-label="Primary">${links}${doorLinks('door')}<a class="btn nav-cta" href="${inquiryHref(slug, 'nav')}">Get a production plan</a></nav></div></header>`;
}
// Every page the sitemap announces must be reachable from the finished chrome
// or from another page's body. /atlas and /how-west-peek-helps were linked only
// by the old committed header and footer, which this finish replaces, so after
// a deploy nothing on the live site linked them while the sitemap still did
// (Search Readiness b7, 3 Nov 2026). The footer is the one place that reaches
// every page in one click; `npm run test:no-orphan-sitemap-pages` holds the line.
const FOOTER_NAV = [
  ['/', 'Library home'],
  ['/topics/', 'Topics'],
  ['/articles', 'Articles'],
  ['/insights/', 'Insights'],
  ['/tools/', 'Tools'],
  ['/glossary', 'Glossary'],
  ['/atlas', 'Atlas'],
  ['/how-west-peek-helps', 'How we help'],
  ['/about', 'About'],
];
function footerHtml() {
  const links = FOOTER_NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('');
  return `<footer class="site-footer" ${MARK}><div class="footer-inner"><nav class="footer-nav" aria-label="More">${links}${doorLinks('door')}</nav><p>West Peek Productions runs virtual, hybrid and webinar events and community as a service. Website: <a href="${WPP_SITE}">westpeekproductions.com</a>. Questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p></div></footer>`;
}
/** The box speaks to the page's own event type. */
function ctaHeading(slug) {
  const s = String(slug);
  if (/webinar/.test(s)) return 'Planning a webinar?';
  if (/summit/.test(s)) return 'Planning a virtual summit?';
  if (/town-?hall|all-hands/.test(s)) return 'Planning a virtual town hall?';
  if (/investor|board-meeting|shareholder|agm/.test(s)) return 'Planning an investor or board event?';
  if (/hybrid/.test(s)) return 'Planning a hybrid event?';
  if (/launch/.test(s)) return 'Planning a launch event?';
  return 'Planning a virtual or hybrid conference?';
}
function ctaBox(slug, at, heading) {
  return `<aside class="cta-box" ${MARK} aria-label="Plan your event"><p class="cta-box__title">${heading}</p><p>Tell us the date, the audience and what cannot go wrong. We send back a production plan and a price range.</p><a class="btn cta-box__btn" href="${inquiryHref(slug, at)}">Get a production plan</a></aside>`;
}
function stickyCta(slug) {
  return `<a class="sticky-cta" ${MARK} href="${inquiryHref(slug, 'sticky')}">Get a production plan</a>`;
}

// ----------------------------------------------------------------- junk --
function stripJunk(html) {
  let s = html;
  s = s.replace(/<section class="fanout-block"[\s\S]*?<\/section>\s*/g, '');
  s = s.replace(/<p class="also-written"[^>]*>[\s\S]*?<\/p>\s*/g, '');
  s = s.replace(/<!--demand-link:start-->[\s\S]*?<!--demand-link:end-->/g, '');
  s = s.replace(/<div class="meta"[^>]*>(?:\s*<span class="pill">[\s\S]*?<\/span>)+\s*<\/div>/g, '');
  s = s.replace(/<p><strong>Official source:<\/strong>[\s\S]*?<\/p>/g, '');
  s = s.replace(/<p class="eyebrow">[^<]*(?:LLM|answer card|Answer Library)[^<]*<\/p>\s*/gi, '');
  return s;
}

// Every West Peek Productions link becomes the counted inquiry link, keeping
// the page it came from (its utm_content) and where on the page (utm_campaign).
// A link whose words are a web address goes to that address. Before 7 Nov 2026
// every westpeekproductions.com link was sent to the inquiry form, so About's
// two links reading "westpeekproductions.com" opened a Google Form instead of
// the company's website. Inquiry wording still routes through /go/plan.
// Web suffixes only, so a label like "Node.js" is never read as an address.
const ADDRESS_LABEL = /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+(?:com|org|net|io|co|ai|app|dev|live|ventures|vc|fm|tv|us|edu|gov|me|so))(\/[^\s]*)?$/i;
function labelAddress(inner) {
  const m = plain(inner).match(ADDRESS_LABEL);
  return m ? `https://${m[1].toLowerCase()}${m[2] || '/'}` : null;
}
function sameAddress(href, addr) {
  const at = (u) => { try { const x = new URL(u.replace(/&amp;/g, '&')); return `${x.host.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`; } catch { return null; } };
  return at(href) !== null && at(href) === at(addr);
}
function routeInquiryLinks(html, slug) {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (a, attrs, inner) => {
    const addr = labelAddress(inner);
    if (addr) {
      // Already going to that address (tracking tags allowed): leave it as it is.
      const href = (attrs.match(/href="([^"]*)"/) || [])[1] || '';
      if (sameAddress(href, addr)) return a;
      return `<a${href ? attrs.replace(/href="[^"]*"/, `href="${addr}"`) : attrs}>${inner}</a>`;
    }
    return a.replace(/href="https:\/\/(?:www\.)?westpeekproductions\.com\/?[^"]*"/g, (m) => {
      const content = (m.match(/utm_content=([^&"]+)/) || [])[1] || slug;
      const campaign = (m.match(/utm_campaign=([^&"]+)/) || [])[1] || 'link';
      return `href="${inquiryHref(decodeURIComponent(content), decodeURIComponent(campaign))}"`;
    });
  }).replace(/\s+target="_blank" rel="noopener"(?=[^>]*href="\/go\/plan)/g, '').replace(/(href="\/go\/plan[^"]*")\s+target="_blank"\s+rel="noopener"/g, '$1');
}

// ------------------------------------------------------------- rewrites --
function blockHtml(b) {
  if (b.p) return `<p>${b.p}</p>`;
  if (b.ul) return `<ul>${b.ul.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol>${b.ol.map((x) => `<li>${x}</li>`).join('')}</ol>`;
  if (b.table) {
    const head = (b.table.head || []).map((h) => `<th>${h}</th>`).join('');
    const rows = (b.table.rows || []).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  return '';
}
function faqHtml(faq) {
  return `<section class="faq" id="faq" data-faq="true"><h2>Frequently asked questions</h2>${faq.map((f) => `<div class="qa-block"><h3>${f.q}</h3><p>${f.a}</p></div>`).join('')}</section>`;
}
function faqLd(faq) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) });
}

// Titles set from a measured query (data/seo/site_head.json title_overrides,
// checklist b10) outrank a rewrite's title.
const TITLE_LOCKED = new Set(Object.keys(readJson('data/seo/site_head.json', {}).title_overrides || {}).map((rel) => routeOf(rel)));
// Every served title inside 30-65 and naming this site (Search Readiness b1,
// b10), not only the rewritten ones: 24 committed titles were too long to carry
// the brand, so apply_title_suffix_band.js (which never cuts a name) left them
// naming nobody. The page's own name goes through finishTitle first; only when it
// cannot fit does a hand-written shorter name (data/seo/served_title_names.json)
// stand in. A title already right is left strictly alone.
const SERVED_NAMES = readJson('data/seo/served_title_names.json', { names: {} }).names || {};
function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
}
function fitServedTitle(html, rel) {
  const tb = require('./title_brand.js');
  const ok = (t) => tb.inBand(t) && tb.namesTheSite(t);
  const now = plain((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  if (!now || ok(now)) return html;
  let next = tb.finishTitle(now, '');
  if (!ok(next) && SERVED_NAMES[rel]) next = tb.finishTitle(SERVED_NAMES[rel], '');
  return ok(next) ? setTitle(html, next) : html;
}
function applyRewrite(html, rec) {
  const p = rec.page;
  let s = html;
  const locked = TITLE_LOCKED.has(p.route);
  // One ladder for every title (scripts/lib/title_brand.js finishTitle): inside
  // 30-65, naming this site once (Search Readiness b1, b10).
  const committed = plain((s.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  const title = require('./title_brand.js').finishTitle(plain(p.title || p.h1), committed);
  if (!locked) s = s.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  if (p.description) {
    s = s.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(plain(p.description))}$2`);
    s = s.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(plain(p.description))}$2`);
    s = s.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(plain(p.description))}$2`);
  }
  // The page's own Article JSON-LD description is the same claim as the meta
  // description, so it moves with the rewrite. It used to keep the pre-rewrite
  // text: 6 Nov 2026 the query-intelligence run accepted a rewrite of
  // /programmatic/best-virtual-conference-platforms whose served JSON-LD still
  // said "A decision guide to unclustered: ..." (a bucket key, never a topic),
  // and the release gate refused the push.
  if (p.description) {
    s = s.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, open, json, close) => (
      /"headline"\s*:/.test(json) ? `${open}${json.replace(/"description"\s*:\s*"(?:[^"\\]|\\.)*"/, () => `"description":${JSON.stringify(plain(p.description)).replace(/</g, '\\u003c')}`)}${close}` : m));
  }
  if (!locked) s = s.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`).replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
  // H1 and the paragraph under it become the rewrite's heading and definition.
  s = s.replace(/<h1([^>]*)>[\s\S]*?<\/h1>\s*(<p[^>]*>[\s\S]*?<\/p>)?/, `<h1$1>${p.h1}</h1><p class="definition" id="definition">${p.definition}</p>`);
  // The old body - everything in the article before the link architecture.
  const body = [
    p.quick_answer ? `<section class="quick-answer" id="quick-answer"><h2>Quick answer</h2><p>${p.quick_answer}</p></section>` : '',
    ...(p.sections || []).map((x) => `<section><h2>${x.h2}</h2>${(x.blocks || []).map(blockHtml).join('')}</section>`),
    (p.faq || []).length ? faqHtml(p.faq) : '',
  ].join('\n');
  s = s.replace(/<script type="application\/ld\+json">\s*\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?<\/script>\s*/g, '');
  // When the H1 sits inside the article (answers, insights), keep it and its
  // definition and replace only what follows.
  const art = s.search(/<article[^>]*>/);
  if (art > -1) {
    const openEnd = s.indexOf('>', art) + 1;
    const defAt = s.indexOf('id="definition"');
    const defEnd = defAt > openEnd ? s.indexOf('</p>', defAt) + 4 : -1;
    const start = defEnd > openEnd && s.slice(openEnd, defAt).includes('<h1') ? defEnd : openEnd;
    const rest = s.slice(start);
    const stop = rest.search(/<!--link-arch:|<\/article>/);
    if (stop > -1) s = `${s.slice(0, start)}\n${body}\n${rest.slice(stop)}`;
  }
  // Drop the old recommendation summary if it sat outside the article.
  s = s.replace(/<section class="callout recommendation-summary"[\s\S]*?<\/section>/g, '');
  if ((p.faq || []).length) s = s.replace('</head>', `<script type="application/ld+json">${faqLd(p.faq)}</script>\n</head>`);
  return s;
}

// ----------------------------------------------------------- page shape --
const hasVisibleFaq = (html) => /class="faq|data-faq="true"|<h2[^>]*>\s*(Frequently asked|Questions people ask|FAQ|Common questions)/i.test(html);
function visibleFaqFromSchema(html) {
  if (hasVisibleFaq(html)) return html;
  let m = null; let node = null;
  for (const sc of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!/"FAQPage"/.test(sc[1])) continue;
    let data;
    try { data = JSON.parse(sc[1]); } catch { continue; }
    const nodes = Array.isArray(data) ? data : Array.isArray(data['@graph']) ? data['@graph'] : [data];
    node = nodes.find((n) => n && n['@type'] === 'FAQPage');
    if (node) { m = sc; break; }
  }
  if (!m) return html;
  const qs = [].concat((node && node.mainEntity) || []);
  if (!qs.length) return html.replace(m[0], '');
  const faq = qs.map((q) => ({ q: esc(q.name), a: esc((q.acceptedAnswer && q.acceptedAnswer.text) || '') })).filter((f) => f.a);
  if (!faq.length) return html.replace(m[0], '');
  const at = html.search(/<!--link-arch:(related|site-related|neighbours)-->|<\/article>|<\/main>/);
  return at < 0 ? html : html.slice(0, at) + faqHtml(faq) + html.slice(at);
}

function markDefinition(html) {
  if (/id="definition"|class="definition"/.test(html)) return html;
  return html.replace(/(<\/h1>\s*<p)(\s|>)/, '$1 class="definition"$2');
}

function bylineHtml(published, updated) {
  const parts = [`By <a href="/about" rel="author">${AUTHOR.name}</a>`];
  if (published) parts.push(`Published <time datetime="${published}">${fmtDate(published)}</time>`);
  if (updated && updated !== published) parts.push(`Updated <time datetime="${updated}">${fmtDate(updated)}</time>`);
  return `<p class="byline" ${MARK}>${parts.join(' · ')}</p>`;
}

function webPageLd({ url, name, published, updated, selectors }) {
  const node = { '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, url, name, author: { '@id': AUTHOR.id }, publisher: { '@id': ORG_ID } };
  if (published) node.datePublished = published;
  if (updated) node.dateModified = updated;
  if (selectors.length) node.speakable = { '@type': 'SpeakableSpecification', cssSelector: selectors };
  return `<script type="application/ld+json" ${MARK}>${JSON.stringify(node)}</script>`;
}

/** Index of the end of the direct answer: the paragraph under the H1, or the hero that holds it. */
function answerEnd(html) {
  const rs = html.indexOf('id="recommendation-summary"');
  if (rs > -1) { const e = html.indexOf('</section>', rs); if (e > -1) return e + '</section>'.length; }
  const qa = html.indexOf('id="quick-answer"');
  if (qa > -1) { const e = html.indexOf('</section>', qa); if (e > -1) return e + '</section>'.length; }
  const h1 = html.search(/<\/h1>/);
  if (h1 < 0) return -1;
  const heroOpen = html.lastIndexOf('<section class="hero', h1);
  const heroClose = heroOpen > -1 ? html.indexOf('</section>', heroOpen) : -1;
  if (heroOpen > -1 && heroClose > h1) return heroClose + '</section>'.length;
  const pEnd = html.indexOf('</p>', h1);
  const nextBlock = html.slice(h1, pEnd).search(/<(section|h2|div class="container")/);
  return pEnd > -1 && nextBlock < 0 ? pEnd + 4 : h1 + 5;
}

/**
 * @param {string} html  the committed page
 * @param {string} rel   repo-relative path, e.g. 'programmatic/webinar-production.html'
 */
function finishPage(html, rel) {
  if (!/<body/i.test(html) || html.includes(`<header class="site-header" ${MARK}`)) return html;
  const r = String(rel).replace(/\\/g, '/');
  if (r.startsWith('admin/') || r.startsWith('go/')) return html;
  const route = routeOf(r);
  const slug = contentForPage(r);
  const { published, updated, rewrites } = context();
  let s = html;

  const rec = rewrites.get(route);
  if (rec) s = applyRewrite(s, rec);
  else if (require('./page_rewrites.js').isRefused(route) || require('./prune.js').isNoindexed(route)) {
    s = s.replace(/(<meta name="robots" content=")[^"]*(")/, '$1noindex,follow$2');
  }
  if (!TITLE_LOCKED.has(route)) s = fitServedTitle(s, r);
  s = stripJunk(s);
  s = routeInquiryLinks(s, slug);
  s = s.replace(/"author":\s*\{[^{}]*#scooter-taylor"[^{}]*\}/g, `"author":{"@id":"${ORG_ID}"}`);

  // One header; one footer.
  if (/<header[\s>]/.test(s)) s = s.replace(/<header[\s\S]*?<\/header>/, headerHtml(slug));
  else s = s.replace(/<body[^>]*>/, (b) => `${b}${headerHtml(slug)}`);
  s = s.replace(/<meta name="author" content="[^"]*">/, `<meta name="author" content="${AUTHOR.name}">`);
  s = s.replace(/<footer[\s\S]*?<\/footer>\s*/g, '');
  s = s.replace(/<\/body>/, `${footerHtml()}\n</body>`);

  // Page shape.
  s = visibleFaqFromSchema(s);
  s = markDefinition(s);
  const pub = published.get(route) || null;
  const upd = rec ? String(rec.generated_at).slice(0, 10) : (updated.get(route) || null);
  const isContent = route !== '/' && !/^\/(topics|pillars)?\/?$/.test(route);
  const end = answerEnd(s);
  if (end > -1 && route !== '/') {
    const box = ctaBox(slug, 'answer', ctaHeading(slug));
    const byline = isContent ? bylineHtml(pub, upd && pub && upd < pub ? pub : upd) : '';
    s = s.slice(0, end) + byline + box + s.slice(end);
  } else if (route === '/') {
    s = homeQuestions(s, slug);
  }
  if (route === '/answers/') s = searchQuestionsIndex(s);
  // The closing box, before the link architecture or the end of the main column.
  const close = s.search(/<!--link-arch:(related|site-related|neighbours)-->/);
  const endBox = ctaBox(slug, 'end', ctaHeading(slug));
  if (close > -1) s = s.slice(0, close) + endBox + s.slice(close);
  else s = s.replace(/<\/main>/, `${endBox}</main>`);
  s = s.replace(/<\/body>/, `${stickyCta(slug)}\n</body>`);

  const selectors = [];
  if (/class="definition"|id="definition"/.test(s)) selectors.push('.definition');
  if (/class="faq/.test(s)) selectors.push('.faq');
  const name = plain((s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  s = s.replace('</head>', `${webPageLd({ url: `${HOST}${route === '/' ? '/' : route}`, name, published: pub, updated: upd, selectors })}\n</head>`);
  return s;
}

// Every /questions/ page the search loop publishes, listed on the /answers/ hub.
// The search loop links each new page to at most two others, and the questions
// only ever linked each other, so the whole cluster sat in the sitemap with no
// path from the homepage (Search Readiness b7, 7 Nov 2026: 11 of 11 unreachable
// within three clicks). /answers/ is in the header on every page, so each
// question is two clicks from home. Read from the directory at finish time, so a
// page the loop publishes tomorrow is listed without anyone touching this.
function searchQuestionPages() {
  const dir = path.join(ROOT, 'questions');
  if (!fs.existsSync(dir)) return [];
  const prune = require('./prune.js');
  return fs.readdirSync(dir).filter((n) => n.endsWith('.html') && n !== 'index.html').sort().map((n) => {
    const html = fs.readFileSync(path.join(dir, n), 'utf8');
    const q = plain((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '')
      .replace(/\s*[|·–—]\s*(?:VirtualAgency OS|West Peek Productions)\s*$/i, '');
    return { route: `/questions/${n.replace(/\.html$/, '')}`, q, noindex: /<meta name="robots" content="[^"]*noindex/i.test(html) };
  }).filter((x) => x.q && !x.noindex && !prune.isPruned(x.route));
}
function searchQuestionsIndex(html) {
  const qs = searchQuestionPages();
  if (!qs.length) return html;
  const section = `<section class="search-questions" id="search-questions" ${MARK}><h2>Questions people search</h2><ul class="question-list">${qs.map((x) => `<li><a href="${x.route}">${esc(x.q)}</a></li>`).join('')}</ul></section>`;
  if (/<\/main>/.test(html)) return html.replace(/<\/main>/, `${section}</main>`);
  return html.replace(/<\/body>/, `${section}\n</body>`);
}

// The home page's "Two ways West Peek Productions helps" (owner, 7 Nov 2026).
// The site described only events, so the community, audience-growth, creative
// and content answers sat under "virtual events" with no service to point to.
// An answer about an event goes under events; every other answer under
// community as a service, which is described in the words of the live
// westpeekproductions.com page and links to its 3-minute quiz.
function twoWays(top, slug) {
  const { isOnTopic } = require('./prune.js');
  const ul = (xs) => (xs.length ? `<ul class="question-list">${xs.map((x) => `<li><a href="${x.route}">${x.q}</a></li>`).join('')}</ul>` : '');
  const events = top.filter((x) => isOnTopic(x.route));
  const community = top.filter((x) => !isOnTopic(x.route));
  return `<section class="common-questions two-ways" id="common-questions" ${MARK}><h2>Two ways West Peek Productions helps</h2><div class="ways">`
    + `<div class="way" id="virtual-and-hybrid-events"><h3>Virtual and hybrid events</h3><p>Virtual and hybrid events fail when the production system is vague: no run of show, no rehearsal discipline, no backup room, no speaker owner, no decision path, and no one watching the show like an operator. West Peek Productions plans, rehearses and runs them, so nothing important is improvised on the day.</p><p class="platform-line">We run shows on our own platform, westpeek.live, now in early access: live stream, stage, 4-minute 1:1 speed networking, breakout groups, chat, expo and replays. <a href="${LIVE_DEMO}">Preview the demo venue \u2197</a></p>${ul(events)}<p><a href="/answers/">All answers</a> · <a href="/tools/production-scoping-calculator">Price band calculator</a> · <a href="${inquiryHref(slug, 'home-events')}">Get a production plan</a></p></div>`
    + `<div class="way" id="community-as-a-service"><h3>Community as a service</h3><p>West Peek Productions is also a Community-as-a-Service and creative agency. It helps organizations build, engage and grow communities through strategy, experiences, storytelling, brand, content and audience growth, so the work before, during and after any single moment compounds.</p><p><a href="${WPP_COMMUNITY}">Can your business build a community? Take the 3-minute quiz \u2197</a></p><p><a href="${WPP_SITE}">Community as a service at West Peek Productions \u2197</a></p>${ul(community)}</div>`
    + '</div></section>';
}

// The home page: an index of the best answers, so a visitor finds one in a click.
function homeQuestions(html, slug) {
  const { rewrites } = context();
  const life = new Map();
  for (const p of readJson('data/search_intelligence/page_impressions_lifetime.json', { pages: [] }).pages || []) {
    const sl = p.page.replace(/\/+$/, '').split('/').pop();
    life.set(sl, (life.get(sl) || 0) + p.impressions);
  }
  const demand = (readJson('data/seo/demand_pages.json', { pages: [] }).pages || []).map((p) => ({ route: p.route, q: p.h1, n: 1e6 + (life.get(p.route.split('/').pop()) || 0) }));
  const prune = require('./prune.js');
  const rw = [...rewrites.values()].filter((r) => !prune.isPruned(r.page.route)).map((r) => ({ route: r.page.route, q: r.page.h1, n: life.get(r.page.route.split('/').pop()) || 0 }));
  const seen = new Set();
  const top = [...demand, ...rw].sort((a, b) => b.n - a.n).filter((x) => !seen.has(x.route) && seen.add(x.route)).slice(0, 20);
  const list = top.length ? twoWays(top, slug) : '';
  const heroOpen = html.indexOf('<section class="hero');
  let heroClose = html.indexOf('</section>', heroOpen);
  if (heroOpen < 0 || heroClose < 0) return html;
  // A short hero with one button (owner review, 2 Nov 2026).
  const hero = `<section class="hero conversion-hero home-hero" ${MARK}><h1>West Peek Productions: virtual and hybrid conference production</h1><p class="definition" id="definition">We plan, rehearse and run virtual and hybrid conferences, webinars and executive broadcasts, so nothing important is improvised on the day.</p><p class="hero-actions"><a class="btn" href="${inquiryHref(slug, 'home-hero')}">Get a production plan</a> <a class="quiet-link" href="mailto:${CONTACT_EMAIL}">or email Scooter</a></p></section>`;
  html = html.slice(0, heroOpen) + hero + html.slice(heroClose + '</section>'.length);
  heroClose = heroOpen + hero.length - '</section>'.length;
  const at = heroClose + '</section>'.length;
  return html.slice(0, at) + list + html.slice(at);
}

module.exports = { finishPage, searchQuestionPages, hasVisibleFaq, stripJunk, routeInquiryLinks, applyRewrite, visibleFaqFromSchema, answerEnd, MARK, _reset() { ctx = null; } };
