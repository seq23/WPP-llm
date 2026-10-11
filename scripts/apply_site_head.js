#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Site head hygiene, brand capture and demand-page strengthening, as one
 * idempotent build step (last in `npm run build`, after install_clarity).
 *
 * WHY. On 11 Oct 2026 the live homepage had no og:image, no twitter:card, no
 * WebSite/WebPage schema, a 404 favicon.ico, og:type "article", an
 * `<script type="application/ld+json">undefined</script>` left by an old
 * attribution pass, and ranked 78th for its own brand misspelled ("west peak",
 * the top query in Search Console). The three non-brand queries Google showed
 * pages for had titles and H1s that did not say the query.
 *
 * WHAT. All values come from data/seo/site_head.json.
 *   1. Every owned page (scripts/lib/site_head.js ownedPages: non-frozen pages
 *      plus the configured demand pages) gets one marked head block: og:type by
 *      page kind, og:site_name, og:image 1200x630 with width/height/alt,
 *      twitter:card summary_large_image + title/description/image, icon,
 *      apple-touch-icon and manifest links. Stray copies of those tags outside
 *      the block are removed so nothing is declared twice.
 *   2. The homepage gets its brand title/H1, a 40-60 word definition paragraph
 *      directly under the H1 (#definition), an "also searched as West Peak"
 *      line, WebSite + WebPage (SpeakableSpecification over #definition and h1)
 *      in its @graph, and Organization @id + alternateName "West Peak Productions".
 *   3. Each demand page gets the measured query in its title/H1/description, a
 *      definition, a visible FAQ mirrored into its FAQPage schema, and a direct
 *      contact CTA.
 *   4. Full demand pages (data/seo/demand_pages.json: the top-12 query families
 *      in data/seo/demand_families.json) get their body replaced by content that
 *      serves the family's intent, one FAQPage, and a CTA carrying a ref; the
 *      family's other measured landing pages link to them (cfg.demand_links), and
 *      the homepage and /topics/ list all twelve. 11 Oct 2026: 7,288 measured
 *      impressions in 90 days, 0 clicks, and the strengthening pass had touched
 *      only the three pages in the 28-day window.
 *
 * Re-running on its own output changes nothing (checked by
 * scripts/validators/validate_social_meta.js --idempotence).
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadConfig, ownedPages, pageKind, routeFor } = require('./lib/site_head.js');
// Plain text of a config string that may carry inline HTML (links, entities), for JSON-LD.
const plain = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const START = '<!--site-head:start-->';
const END = '<!--site-head:end-->';
const DA_START = '<!--demand-answer:start-->';
const DA_END = '<!--demand-answer:end-->';
const FV_START = '<!--faq-visible:start-->';
const DP_START = '<!--demand-page:start-->';
const DP_END = '<!--demand-page:end-->';
const DL_START = '<!--demand-link:start-->';
const DL_END = '<!--demand-link:end-->';
const DF_START = '<!--demand-families:start-->';
const DF_END = '<!--demand-families:end-->';
const { wppCtaUrl } = require('./lib/wpp_cta.js');
const FV_END = '<!--faq-visible:end-->';

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Escape text that may already carry entities (config H1 uses &amp;) without double-escaping.
const escText = (s) => String(s || '').replace(/&(?![a-z]+;|#\d+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ld = (o) => JSON.stringify(o).replace(/<\//g, '<\\/');

function metaContent(html, attr, key) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key.replace(/[:]/g, '\\:')}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  return m ? unesc(m[1]) : '';
}

function stripStray(html) {
  return html
    .replace(/[ \t]*<meta\s+property=["']og:(type|site_name|image(?::[a-z_]+)?)["'][^>]*>[ \t]*\n?/gi, "")
    .replace(/[ \t]*<meta\s+name=["']twitter:[a-z_:]+["'][^>]*>[ \t]*\n?/gi, "")
    .replace(/[ \t]*<link\s+rel=["'](?:shortcut icon|icon|apple-touch-icon|manifest)["'][^>]*>[ \t]*\n?/gi, "")
    .replace(/[ \t]*<script type="application\/ld\+json">undefined<\/script>[ \t]*\n?/g, "");
}

function headBlock(html, rel, cfg) {
  const site = cfg.site_url.replace(/\/$/, '');
  const title = metaContent(html, 'property', 'og:title') || unesc((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '');
  const desc = metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'description');
  const canonical = (html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1] || site + routeFor(rel);
  const img = site + cfg.og_image.path;
  const lines = [
    `<meta property="og:type" content="${pageKind(rel, cfg)}">`,
    `<meta property="og:site_name" content="${esc(cfg.site_name)}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="${cfg.og_image.width}">`,
    `<meta property="og:image:height" content="${cfg.og_image.height}">`,
    `<meta property="og:image:alt" content="${esc(cfg.og_image.alt)}">`,
  ];
  if (!/<meta\s+property=["']og:title["']/i.test(html)) lines.push(`<meta property="og:title" content="${esc(title)}">`);
  if (!/<meta\s+property=["']og:description["']/i.test(html) && desc) lines.push(`<meta property="og:description" content="${esc(desc)}">`);
  if (!/<meta\s+property=["']og:url["']/i.test(html)) lines.push(`<meta property="og:url" content="${esc(canonical)}">`);
  lines.push(
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc || title)}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<link rel="icon" href="${cfg.icons.favicon}" sizes="any">`,
    `<link rel="apple-touch-icon" href="${cfg.icons.apple_touch_icon}">`,
    `<link rel="manifest" href="${cfg.icons.manifest}">`,
  );
  return `${START}\n${lines.join('\n')}\n${END}`;
}

function setTitle(html, title) {
  return html.replace(/<title>[^<]*<\/title>/i, () => `<title>${esc(title)}</title>`);
}
function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta[^>]+${attr}=["']${key}["'][^>]*content=["'])[^"']*(["'])`, 'i');
  // Function replacer: a value such as "$2,500" must not be read as a backreference.
  return html.replace(re, (m, a, b) => `${a}${esc(value)}${b}`);
}
function setH1(html, h1) {
  return html.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, (m, attrs) => `<h1${attrs}>${escText(h1)}</h1>`);
}

function applyHomepage(html, cfg) {
  const h = cfg.homepage;
  const site = cfg.site_url.replace(/\/$/, '');
  html = setTitle(html, h.title);
  html = setH1(html, h.h1);
  html = html.replace(/\s*<p class="definition" id="definition">[\s\S]*?<\/p>/g, '').replace(/\s*<p class="also-written" id="also-written">[\s\S]*?<\/p>/g, '');
  html = html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/i, (m) => `${m}\n<p class="definition" id="definition">${escText(h.definition)}</p>\n<p class="also-written" id="also-written">${escText(h.also_written)}</p>`);
  html = html.replace(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@graph":[\s\S]*?)<\/script>/, (m, json) => {
    const data = JSON.parse(json);
    const graph = (data['@graph'] || []).filter((n) => n['@type'] !== 'WebSite' && n['@type'] !== 'WebPage');
    const org = graph.find((n) => n['@type'] === 'Organization');
    if (org) {
      org['@id'] = cfg.organization_id;
      org.alternateName = cfg.alternate_names;
    }
    graph.push({
      '@type': 'WebSite', '@id': cfg.website_id, url: `${site}/`, name: cfg.site_name,
      alternateName: cfg.alternate_names, inLanguage: 'en', publisher: { '@id': cfg.organization_id },
    });
    graph.push({
      '@type': 'WebPage', '@id': `${site}/#webpage`, url: `${site}/`, name: h.title,
      description: h.definition, isPartOf: { '@id': cfg.website_id }, about: { '@id': cfg.organization_id },
      primaryImageOfPage: { '@type': 'ImageObject', url: site + cfg.og_image.path, width: cfg.og_image.width, height: cfg.og_image.height },
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['#definition', 'h1'] },
    });
    data['@graph'] = graph;
    return `<script type="application/ld+json">${ld(data)}</script>`;
  });
  return html;
}

function applyDemandPage(html, page, cfg) {
  html = setTitle(html, page.title);
  html = setMeta(html, 'name', 'description', page.description);
  html = setMeta(html, 'property', 'og:title', page.title);
  html = setMeta(html, 'property', 'og:description', page.description);
  html = setH1(html, page.h1);
  if (page.hero) html = html.replace(/(<section class="hero"><h1[^>]*>[\s\S]*?<\/h1><p>)[\s\S]*?(<\/p>)/, (m, a, b) => `${a}${escText(page.hero)}${b}`);
  html = html.replace(new RegExp(`${DA_START}[\\s\\S]*?${DA_END}`, 'g'), '');
  const qa = page.faq.map((f) => `<div class="qa-block"><h3>${escText(f.q)}</h3><p>${escText(f.a)}</p></div>`).join('');
  const cta = cfg.demand_cta;
  const block = `${DA_START}<section class="demand-answer"><p class="definition" id="definition">${escText(page.definition)}</p>`
    + `<h2>Short answers</h2>${qa}`
    + `<p class="demand-cta"><strong>${escText(cta.text)}</strong> <a class="btn" href="mailto:${cta.email}">${cta.email}</a></p></section>${DA_END}`;
  if (!/<section class="hero">[\s\S]*?<\/section>/.test(html)) throw new Error(`site-head: no hero section in ${page.file}`);
  html = html.replace(/(<section class="hero">[\s\S]*?<\/section>)/, (m) => m + block);
  html = html.replace(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"FAQPage"[\s\S]*?)<\/script>/, (m, json) => {
    const data = JSON.parse(json);
    const have = new Set((data.mainEntity || []).map((q) => q.name));
    for (const f of page.faq) {
      if (!have.has(f.q)) data.mainEntity.push({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } });
    }
    return `<script type="application/ld+json">${ld(data)}</script>`;
  });
  return html;
}



// ---- Full demand pages (data/seo/demand_pages.json, the top-12 query families) ----
// The page body between the H1 definition and the site's link blocks is
// replaced by content that serves the family's intent: question-phrased H2s,
// tables (a real comparison where the query is a comparison), a numbered list
// where the query asks for a checklist, a visible FAQ from the family's own
// measured queries with exactly one FAQPage, and a direct contact CTA with a ref.
function mailtoRef(cta, page) {
  const subject = encodeURIComponent(`Quote request: ${plain(page.query)} (ref vaos-${page.family})`);
  return `mailto:${cta.email}?subject=${subject}`;
}
function renderBlock(b) {
  if (b.p) return `<p>${b.p}</p>`;
  if (b.ul) return `<ul>${b.ul.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol class="demand-steps">${b.ol.map((x) => `<li>${x}</li>`).join('')}</ol>`;
  if (b.table) {
    const t = b.table;
    return `<table class="demand-table"><thead><tr>${t.head.map((h) => `<th scope="col">${h || '<span class="visually-hidden">Item</span>'}</th>`).join('')}</tr></thead>`
      + `<tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
  }
  throw new Error(`site-head: unknown demand block ${JSON.stringify(Object.keys(b))}`);
}
function renderDemandRegion(page, cfg) {
  const cta = cfg.demand_page_cta;
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) };
  const wpp = wppCtaUrl({ campaign: cta.campaign, content: page.family });
  return `${DP_START}<section class="demand-page" data-demand-family="${page.family}">`
    + `<div class="callout demand-facts"><strong>At a glance</strong><ul>${page.facts.map((f) => `<li>${f}</li>`).join('')}</ul></div>`
    + page.sections.map((sec) => `<h2>${sec.h2}</h2>${sec.blocks.map(renderBlock).join('')}`).join('')
    + `<section class="faq demand-faq" data-faq="true"><h2>What else do people ask about ${plain(page.query)}?</h2>${page.faq.map((f) => `<div class="qa-block"><h3>${f.q}</h3><p>${f.a}</p></div>`).join('')}</section>`
    + `<p class="demand-cta"><strong>${cta.text}</strong> <a class="btn" href="${mailtoRef(cta, page)}">${cta.email}</a> <a class="btn secondary" href="${wpp}" target="_blank" rel="noopener">Request a quote from West Peek Productions</a></p>`
    + `<p class="demand-related"><strong>Related guides:</strong> ${page.related.map((r) => `<a href="${r.route}">${r.anchor}</a>`).join(' · ')}</p>`
    + `<script type="application/ld+json">${ld(faqLd)}</script>`
    + `</section>${DP_END}`;
}
function applyFullDemandPage(html, page, cfg) {
  html = setTitle(html, page.title);
  html = setMeta(html, 'name', 'description', page.description);
  html = setMeta(html, 'property', 'og:title', page.title);
  html = setMeta(html, 'property', 'og:description', page.description);
  html = setH1(html, page.h1);
  // Article headline/description in the head graph follow the page.
  html = html.replace(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@graph":[\s\S]*?)<\/script>/, (m, json) => {
    const data = JSON.parse(json);
    for (const n of data['@graph'] || []) if (n['@type'] === 'Article') { n.headline = plain(page.h1); n.description = plain(page.description); if (n.about && n.about['@type'] === 'Thing') n.about.name = plain(page.query); }
    return `<script type="application/ld+json">${ld(data)}</script>`;
  });
  // Breadcrumb names the page by its H1.
  html = html.replace(/(<span aria-current="page">)[\s\S]*?(<\/span>)/, (m, a, b) => `${a}${escText(plain(page.h1))}${b}`);
  html = html.replace(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"BreadcrumbList"[\s\S]*?)<\/script>/, (m, json) => {
    const data = JSON.parse(json);
    const items = data.itemListElement || [];
    if (items.length) items[items.length - 1].name = plain(page.h1);
    return `<script type="application/ld+json">${ld(data)}</script>`;
  });
  // The 40-60 word definition is the first paragraph under the H1.
  const def = `<p class="definition" id="definition">${page.definition}</p>`;
  html = html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)(\s*)(<p[^>]*>[\s\S]*?<\/p>)?/i, (m, h1, ws, p) => `${h1}${ws}${def}`);
  html = html.replace(/(<section class="hero">[\s\S]*?<\/p>)\s*<div class="meta">[\s\S]*?<\/div>/, '$1');
  // Old-mode demand-answer blocks and any FAQPage outside the region go.
  html = html.replace(new RegExp(`${DA_START}[\\s\\S]*?${DA_END}`, 'g'), '');
  html = html.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@type":"FAQPage"[\s\S]*?<\/script>/g, '');
  const region = renderDemandRegion(page, cfg);
  if (html.includes(DP_START)) return html.replace(new RegExp(`${DP_START}[\\s\\S]*?${DP_END}`), () => region);
  const defEnd = html.indexOf(def) + def.length;
  const art = html.search(/<article[^>]*>/);
  const artEnd = art >= 0 ? html.indexOf('>', art) + 1 : -1;
  const start = Math.max(defEnd, artEnd);
  const ends = ['<section class="fanout-block"', '<!--link-arch:related-->', '<!--link-arch:neighbours-->', '</article>']
    .map((a) => html.indexOf(a, start)).filter((i) => i >= 0);
  if (!ends.length) throw new Error(`site-head: no end anchor for the demand region in ${page.file}`);
  const end = Math.min(...ends);
  return html.slice(0, start) + region + html.slice(end);
}

// A measured landing page for a top-12 family links to the family's primary
// page, anchored with the query Google showed this page for.
function applyDemandLink(html, entry) {
  html = html.replace(new RegExp(`${DL_START}[\\s\\S]*?${DL_END}`, 'g'), '');
  const links = entry.links.map((l) => `<a href="${l.href}">${escText(l.anchor)}</a>`).join(' · ');
  const block = `${DL_START}<p class="demand-primary-link"><strong>Main guide:</strong> ${links}</p>${DL_END}`;
  if (/<section class="hero">[\s\S]*?<\/section>/.test(html)) return html.replace(/(<section class="hero">[\s\S]*?<\/section>)/, (m) => m + block);
  const m = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*(<p[^>]*>[\s\S]*?<\/p>)?/i);
  if (m) return html.replace(m[0], (x) => x + block);
  throw new Error(`site-head: no H1 to anchor the demand link in ${entry.file}`);
}

// The homepage and the Topics hub (in the nav of every page) list the 12 family pages.
function applyDemandFamilies(html, cfg) {
  html = html.replace(new RegExp(`${DF_START}[\\s\\S]*?${DF_END}`, 'g'), '');
  const pages = (cfg.demand_pages || []).filter((d) => d.full);
  if (!pages.length) return html;
  const cap = (s) => plain(s).replace(/^./, (c) => c.toUpperCase());
  const block = `${DF_START}<section class="demand-families" id="most-searched"><h2>What people search for most</h2>`
    + '<p>The questions people ask Google most often in this field, each answered on one page.</p>'
    + `<ul class="hub-list">${pages.map((d) => `<li><a href="${d.route}">${escText(cap(d.query))}</a></li>`).join('')}</ul></section>${DF_END}`;
  const i = html.lastIndexOf('</main>');
  if (i < 0) throw new Error('site-head: no </main> to anchor the demand-family list');
  return html.slice(0, i) + block + html.slice(i);
}

// FAQPage only where the Q&A is visible: a FAQPage whose questions the reader
// cannot see is rendered as a visible section from the schema's own text.
const normText = (s) => unesc(String(s || '')).replace(/\s+/g, ' ').trim().toLowerCase();
function ensureVisibleFaq(html) {
  html = html.replace(new RegExp(`${FV_START}[\\s\\S]*?${FV_END}`, 'g'), '');
  const qs = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">(\{[^<]*"@type":\s*"FAQPage"[\s\S]*?)<\/script>/g)) {
    try { for (const q of [].concat(JSON.parse(m[1]).mainEntity || [])) if (q && q.name) qs.push(q); } catch { /* validator reports unparseable JSON-LD */ }
  }
  if (!qs.length) return html;
  const body = ((html.match(/<body[\s\S]*<\/body>/i) || [''])[0]).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const text = normText(body);
  const missing = qs.filter((q) => !text.includes(normText(q.name)));
  if (!missing.length) return html;
  const block = `${FV_START}<section class="faq-visible"><h2>Questions people ask</h2>${missing.map((q) => `<div class="qa-block"><h3>${escText(q.name)}</h3><p>${escText((q.acceptedAnswer || {}).text || '')}</p></div>`).join('')}</section>${FV_END}`;
  for (const anchor of ['</main>', '</article>', '<footer']) {
    const i = html.lastIndexOf(anchor);
    if (i >= 0) return html.slice(0, i) + block + html.slice(i);
  }
  return html.replace(/<\/body>/i, `${block}</body>`);
}

function transform(rel, html, cfg) {
  if (!/<\/head>/i.test(html)) return html;
  const demand = (cfg.demand_pages || []).find((d) => d.file === rel);
  if (rel === 'index.html') html = applyHomepage(html, cfg);
  if (rel === 'index.html' || rel === 'topics/index.html') html = applyDemandFamilies(html, cfg);
  if (demand) html = demand.full ? applyFullDemandPage(html, demand, cfg) : applyDemandPage(html, demand, cfg);
  const link = !demand && (cfg.demand_links || []).find((d) => d.file === rel);
  if (link) html = applyDemandLink(html, link);
  html = ensureVisibleFaq(html);
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}\\n?`, "g"), '');
  html = stripStray(html);
  return html.replace(/<\/head>/i, `${headBlock(html, rel, cfg)}\n</head>`);
}

function main() {
  const cfg = loadConfig();
  const pages = ownedPages(ROOT, cfg);
  if (pages.length < 50) {
    console.error(`site-head: only ${pages.length} owned pages found; the walk or the frozen registry is wrong. Refusing to report success.`);
    process.exit(1);
  }
  let changed = 0;
  for (const rel of pages) {
    const abs = path.join(ROOT, rel);
    const before = fs.readFileSync(abs, 'utf8');
    const after = transform(rel, before, cfg);
    if (after !== before) { fs.writeFileSync(abs, after); changed++; }
  }
  console.log(`site-head: ${pages.length} owned page(s), ${changed} updated.`);
}

if (require.main === module) main();
module.exports = { transform, START, END };
