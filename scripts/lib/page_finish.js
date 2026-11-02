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
 *      button, "Plan my virtual conference".
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
 *   5. Cloudflare Web Analytics (no cookies) on every page.
 */
const fs = require('fs');
const path = require('path');
const { contentForPage } = require('./wpp_cta.js');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = 'https://virtualagency-os.com';
const CF_BEACON_TOKEN = '40a2faf84e3f45f086e8eaf84ddeec2c';
const CONTACT_EMAIL = 'scooter@westpeek.ventures';
const AUTHOR = { name: 'Scooter Taylor', id: 'https://www.westpeekproductions.com/#scooter-taylor' };
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
const NAV = [
  ['/pillars/experiences', 'Virtual events'],
  ['/programmatic/webinar-production', 'Webinars'],
  ['/answers/', 'Answers'],
  ['/about', 'About'],
];
function headerHtml(slug) {
  const links = NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('');
  return `<header class="site-header" ${MARK}><div class="header-inner"><a class="brand" href="/" aria-label="West Peek Productions home"><img src="/assets/west-peek-productions-logo.jpeg" alt="West Peek Productions logo" width="36" height="36"><span class="name">West Peek Productions</span></a><nav class="nav" aria-label="Primary">${links}<a class="btn nav-cta" href="${inquiryHref(slug, 'nav')}">Plan my virtual conference</a></nav></div></header>`;
}
function footerHtml() {
  return `<footer class="site-footer" ${MARK}><div class="footer-inner"><nav class="footer-nav" aria-label="More"><a href="/topics/">Topics</a><a href="/articles">Articles</a><a href="/insights/">Insights</a><a href="/tools/">Tools</a><a href="/glossary">Glossary</a><a href="/about">About</a></nav><p>West Peek Productions plans and runs virtual, hybrid and webinar events. Questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p></div></footer>`;
}
function ctaBox(slug, at, heading) {
  return `<aside class="cta-box" ${MARK} aria-label="Plan your event"><p class="cta-box__title">${heading}</p><p>Tell us the date, the audience and what cannot go wrong. We send back a production plan and a price range.</p><a class="btn cta-box__btn" href="${inquiryHref(slug, at)}">Get a production plan</a></aside>`;
}
function stickyCta(slug) {
  return `<a class="sticky-cta" ${MARK} href="${inquiryHref(slug, 'sticky')}">Plan my virtual conference</a>`;
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
function routeInquiryLinks(html, slug) {
  return html.replace(/href="https:\/\/(?:www\.)?westpeekproductions\.com\/?[^"]*"/g, (m) => {
    const content = (m.match(/utm_content=([^&"]+)/) || [])[1] || slug;
    const campaign = (m.match(/utm_campaign=([^&"]+)/) || [])[1] || 'link';
    return `href="${inquiryHref(decodeURIComponent(content), decodeURIComponent(campaign))}"`;
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

function applyRewrite(html, rec) {
  const p = rec.page;
  let s = html;
  const title = plain(p.title).length && plain(p.title).length <= 44 ? `${plain(p.title)} | West Peek Productions` : plain(p.title || p.h1);
  s = s.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  if (p.description) {
    s = s.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(plain(p.description))}$2`);
    s = s.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(plain(p.description))}$2`);
    s = s.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(plain(p.description))}$2`);
  }
  s = s.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`).replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
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
function visibleFaqFromSchema(html) {
  if (/class="faq|data-faq="true"|<h2[^>]*>\s*(Frequently asked|Questions people ask|FAQ)/i.test(html)) return html;
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?"@type"\s*:\s*"FAQPage"[\s\S]*?)<\/script>/);
  if (!m) return html;
  let data;
  try { data = JSON.parse(m[1]); } catch { return html; }
  const node = Array.isArray(data['@graph']) ? data['@graph'].find((n) => n['@type'] === 'FAQPage') : data;
  const qs = (node && node.mainEntity) || [];
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
  const parts = [`By <a href="/about" rel="author">${AUTHOR.name}</a>, <a href="/about">West Peek Productions</a>`];
  if (published) parts.push(`Published <time datetime="${published}">${fmtDate(published)}</time>`);
  if (updated && updated !== published) parts.push(`Updated <time datetime="${updated}">${fmtDate(updated)}</time>`);
  return `<p class="byline" ${MARK}>${parts.join(' · ')}</p>`;
}

function webPageLd({ url, name, published, updated, selectors }) {
  const node = { '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, url, name, author: { '@type': 'Person', '@id': AUTHOR.id, name: AUTHOR.name }, publisher: { '@id': ORG_ID } };
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
  s = stripJunk(s);
  s = routeInquiryLinks(s, slug);

  // One header; one footer.
  s = s.replace(/<header[\s\S]*?<\/header>/, headerHtml(slug));
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
    const box = ctaBox(slug, 'answer', 'Planning a virtual or hybrid conference?');
    const byline = isContent ? bylineHtml(pub, upd && pub && upd < pub ? pub : upd) : '';
    s = s.slice(0, end) + byline + box + s.slice(end);
  } else if (route === '/') {
    s = homeQuestions(s, slug);
  }
  // The closing box, before the link architecture or the end of the main column.
  const close = s.search(/<!--link-arch:(related|site-related|neighbours)-->/);
  const endBox = ctaBox(slug, 'end', 'Ready to plan your event?');
  if (close > -1) s = s.slice(0, close) + endBox + s.slice(close);
  else s = s.replace(/<\/main>/, `${endBox}</main>`);
  s = s.replace(/<\/body>/, `${stickyCta(slug)}\n</body>`);

  const selectors = [];
  if (/class="definition"|id="definition"/.test(s)) selectors.push('.definition');
  if (/class="faq/.test(s)) selectors.push('.faq');
  const name = plain((s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  s = s.replace('</head>', `${webPageLd({ url: `${HOST}${route === '/' ? '/' : route}`, name, published: pub, updated: upd, selectors })}\n</head>`);
  s = s.replace(/<\/body>/, `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${CF_BEACON_TOKEN}"}'></script>\n</body>`);
  return s;
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
  const rw = [...rewrites.values()].map((r) => ({ route: r.page.route, q: r.page.h1, n: life.get(r.page.route.split('/').pop()) || 0 }));
  const seen = new Set();
  const top = [...demand, ...rw].sort((a, b) => b.n - a.n).filter((x) => !seen.has(x.route) && seen.add(x.route)).slice(0, 20);
  const box = ctaBox(slug, 'home', 'Planning a virtual or hybrid conference?');
  const list = top.length ? `<section class="common-questions" id="common-questions" ${MARK}><h2>Common questions</h2><ul class="question-list">${top.map((x) => `<li><a href="${x.route}">${x.q}</a></li>`).join('')}</ul><p><a href="/answers/">All answers</a></p></section>` : '';
  const heroClose = html.indexOf('</section>', html.indexOf('<section class="hero'));
  if (heroClose < 0) return html;
  const at = heroClose + '</section>'.length;
  return html.slice(0, at) + box + list + html.slice(at);
}

module.exports = { finishPage, stripJunk, routeInquiryLinks, applyRewrite, visibleFaqFromSchema, answerEnd, MARK, CF_BEACON_TOKEN, _reset() { ctx = null; } };
