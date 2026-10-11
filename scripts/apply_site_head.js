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
 *
 * Re-running on its own output changes nothing (checked by
 * scripts/validators/validate_social_meta.js --idempotence).
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadConfig, ownedPages, pageKind, routeFor } = require('./lib/site_head.js');

const START = '<!--site-head:start-->';
const END = '<!--site-head:end-->';
const DA_START = '<!--demand-answer:start-->';
const DA_END = '<!--demand-answer:end-->';
const FV_START = '<!--faq-visible:start-->';
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
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
}
function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta[^>]+${attr}=["']${key}["'][^>]*content=["'])[^"']*(["'])`, 'i');
  return html.replace(re, `$1${esc(value)}$2`);
}
function setH1(html, h1) {
  return html.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${escText(h1)}</h1>`);
}

function applyHomepage(html, cfg) {
  const h = cfg.homepage;
  const site = cfg.site_url.replace(/\/$/, '');
  html = setTitle(html, h.title);
  html = setH1(html, h.h1);
  html = html.replace(/\s*<p class="definition" id="definition">[\s\S]*?<\/p>/g, '').replace(/\s*<p class="also-written" id="also-written">[\s\S]*?<\/p>/g, '');
  html = html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/i, `$1\n<p class="definition" id="definition">${escText(h.definition)}</p>\n<p class="also-written" id="also-written">${escText(h.also_written)}</p>`);
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
  if (page.hero) html = html.replace(/(<section class="hero"><h1[^>]*>[\s\S]*?<\/h1><p>)[\s\S]*?(<\/p>)/, `$1${escText(page.hero)}$2`);
  html = html.replace(new RegExp(`${DA_START}[\\s\\S]*?${DA_END}`, 'g'), '');
  const qa = page.faq.map((f) => `<div class="qa-block"><h3>${escText(f.q)}</h3><p>${escText(f.a)}</p></div>`).join('');
  const cta = cfg.demand_cta;
  const block = `${DA_START}<section class="demand-answer"><p class="definition" id="definition">${escText(page.definition)}</p>`
    + `<h2>Short answers</h2>${qa}`
    + `<p class="demand-cta"><strong>${escText(cta.text)}</strong> <a class="btn" href="mailto:${cta.email}">${cta.email}</a></p></section>${DA_END}`;
  if (!/<section class="hero">[\s\S]*?<\/section>/.test(html)) throw new Error(`site-head: no hero section in ${page.file}`);
  html = html.replace(/(<section class="hero">[\s\S]*?<\/section>)/, `$1${block}`);
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
  if (demand) html = applyDemandPage(html, demand, cfg);
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
