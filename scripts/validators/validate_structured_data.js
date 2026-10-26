#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Structured data and brand capture.
 *  - Every JSON-LD block on an owned page parses.
 *  - Homepage: WebSite (name + alternateName "West Peak Productions"), WebPage
 *    with SpeakableSpecification over #definition, Organization with that
 *    alternateName, and the kept Organization/Person/ContactPoint/Article/
 *    BreadcrumbList; "West Peek Productions" in title, H1 and og:site_name; a
 *    40-60 word "West Peek Productions is ..." paragraph directly under the H1.
 *  - FAQPage only where the Q&A is visible: every Question name in a FAQPage on
 *    an owned page appears in that page's visible text.
 *  - Demand pages (data/seo/site_head.json demand_pages): configured title and
 *    H1, the definition, each configured FAQ visible and in the schema, and a
 *    direct mailto CTA.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadConfig, ownedPages } = require('../lib/site_head.js');

const errors = [];
let cfg;
try { cfg = loadConfig(); } catch (e) { console.error(`structured data FAILED: ${e.message}`); process.exit(1); }
const pages = ownedPages(ROOT, cfg);
if (pages.length < 50) { console.error(`structured data FAILED: ${pages.length} owned page(s); the page walk is not reaching the site.`); process.exit(1); }
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const norm = (s) => unesc(s).replace(/\s+/g, ' ').trim().toLowerCase();
const visible = (h) => norm(((h.match(/<body[\s\S]*<\/body>/i) || [''])[0]).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
function blocks(h, rel) {
  const out = [];
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { out.push(JSON.parse(m[1])); } catch (e) { errors.push(`${rel}: JSON-LD does not parse (${m[1].slice(0, 40)}…)`); }
  }
  return out;
}
function nodes(list) {
  const out = [];
  const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return; } if (n['@type']) out.push(n); Object.values(n).forEach(walk); };
  walk(list);
  return out;
}
const types = (ns) => new Set(ns.flatMap((n) => [].concat(n['@type'])));

let faqPages = 0;
for (const rel of pages) {
  const h = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const ns = nodes(blocks(h, rel));
  const faqs = ns.filter((n) => [].concat(n['@type']).includes('FAQPage'));
  if (faqs.length) {
    faqPages++;
    const text = visible(h);
    for (const f of faqs) for (const q of [].concat(f.mainEntity || [])) {
      if (q && q.name && !text.includes(norm(q.name))) errors.push(`${rel}: FAQPage question not visible on the page: "${q.name.slice(0, 80)}"`);
    }
  }
}

// Homepage
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const hn = nodes(blocks(home, 'index.html'));
const ht = types(hn);
for (const t of ['WebSite', 'WebPage', 'Organization', 'Person', 'ContactPoint', 'Article', 'BreadcrumbList', 'SpeakableSpecification']) if (!ht.has(t)) errors.push(`index.html: JSON-LD has no ${t}`);
const brandAlt = cfg.alternate_names[0];
const site = hn.find((n) => n['@type'] === 'WebSite');
if (site && (site.name !== cfg.site_name || ![].concat(site.alternateName || []).includes(brandAlt))) errors.push(`index.html: WebSite must be named "${cfg.site_name}" with alternateName "${brandAlt}"`);
const org = hn.find((n) => n['@type'] === 'Organization' && n.name === cfg.site_name);
if (!org || ![].concat(org.alternateName || []).includes(brandAlt)) errors.push(`index.html: Organization lacks alternateName "${brandAlt}"`);
const wp = hn.find((n) => n['@type'] === 'WebPage');
if (wp && !([].concat((wp.speakable || {}).cssSelector || [])).includes('#definition')) errors.push('index.html: WebPage speakable does not cover #definition');
const title = unesc((home.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
const h1 = unesc(((home.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]+>/g, ''));
const siteName = (home.match(/<meta property="og:site_name" content="([^"]*)"/) || [])[1] || '';
for (const [k, v] of [['title', title], ['H1', h1], ['og:site_name', siteName]]) if (!v.includes(cfg.site_name)) errors.push(`index.html: ${k} does not contain "${cfg.site_name}"`);
const def = home.match(/<\/h1>\s*<p class="definition" id="definition">([\s\S]*?)<\/p>/);
if (!def) errors.push('index.html: no #definition paragraph directly under the H1');
else {
  const w = unesc(def[1]).split(/\s+/).filter(Boolean).length;
  if (w < 40 || w > 60) errors.push(`index.html: definition is ${w} words; must be 40-60`);
  if (!unesc(def[1]).startsWith(`${cfg.site_name} is `)) errors.push(`index.html: definition must start "${cfg.site_name} is "`);
}
if (!/West Peak/.test(visible(home).replace(/west peak/g, 'West Peak'))) errors.push('index.html: no visible "also written West Peak" line');

// Priced services on the homepage (Search Readiness c3). A Service with no price
// reads as a brochure; a price in schema that the copy no longer states is worse,
// because it outlives the thing it claims to describe. Both are checked: the node
// must carry the configured range, and every configured visible_price_text must
// still appear in the homepage's own words.
const svcCfg = cfg.services || {};
const svcOffers = svcCfg.offers || [];
if (!svcOffers.length) errors.push('data/seo/site_head.json configures no services; the site would have no priced offer anywhere');
const svcNodes = hn.filter((n) => n['@type'] === 'Service');
if (svcNodes.length !== svcOffers.length) errors.push(`index.html: ${svcNodes.length} Service node(s) for ${svcOffers.length} configured service(s)`);
const homeText = visible(home);
for (const o of svcOffers) {
  const node = svcNodes.find((n) => n.name === o.name);
  if (!node) { errors.push(`index.html: no Service node named "${o.name}"`); continue; }
  const offer = node.offers || {};
  if (String(offer.lowPrice) !== String(o.low_price)) errors.push(`index.html: Service "${o.name}" lowPrice is ${offer.lowPrice}, configured ${o.low_price}`);
  if (o.high_price && String(offer.highPrice) !== String(o.high_price)) errors.push(`index.html: Service "${o.name}" highPrice is ${offer.highPrice}, configured ${o.high_price}`);
  if (offer.priceCurrency !== svcCfg.currency) errors.push(`index.html: Service "${o.name}" priceCurrency is ${offer.priceCurrency}, configured ${svcCfg.currency}`);
  if (o.visible_price_text && !homeText.includes(norm(o.visible_price_text))) {
    errors.push(`index.html: Service "${o.name}" is priced in schema but the homepage no longer says "${o.visible_price_text}" in its own words`);
  }
}

// Demand pages
for (const d of cfg.demand_pages || []) {
  const f = path.join(ROOT, d.file);
  if (!fs.existsSync(f)) { errors.push(`${d.file}: demand page missing`); continue; }
  const h = fs.readFileSync(f, 'utf8');
  const e = (m) => errors.push(`${d.file}: ${m}`);
  if (unesc((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '') !== d.title) e('title is not the configured demand title');
  const ph1 = unesc(((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || ''));
  if (ph1 !== unesc(d.h1)) e('H1 is not the configured demand H1');
  const text = visible(h);
  if (!text.includes(norm(d.definition))) e('definition not visible');
  const qs = new Set(nodes(blocks(h, d.file)).filter((n) => n['@type'] === 'Question').map((n) => n.name));
  for (const q of d.faq) {
    if (!text.includes(norm(q.q)) || !text.includes(norm(q.a))) e(`FAQ not visible: "${q.q}"`);
    if (!qs.has(q.q)) e(`FAQ missing from FAQPage schema: "${q.q}"`);
  }
  // Full demand pages (data/seo/demand_pages.json) carry a ref in the mailto subject;
  // validate_demand_pages.js checks that ref. The lighter form uses the bare address.
  const mail = d.full ? `href="mailto:${cfg.demand_page_cta.email}?subject=` : `href="mailto:${cfg.demand_cta.email}"`;
  if (!h.includes(`<p class="demand-cta">`) || !h.includes(mail)) e('direct contact CTA missing');
  const w = d.definition.split(/\s+/).length;
  if (w < 40 || w > 60) e(`definition is ${w} words; must be 40-60`);
}
if (!(cfg.demand_pages || []).length) errors.push('zero demand pages configured');
if (errors.length) { console.error(`structured data FAILED (${errors.length}):\n- ` + errors.slice(0, 40).join('\n- ')); process.exit(1); }
console.log(`structured data OK: ${pages.length} owned page(s) parse; ${faqPages} FAQPage page(s) all visible; homepage WebSite/WebPage/speakable/brand; ${svcNodes.length} priced Service node(s) matching the visible copy; ${cfg.demand_pages.length} demand page(s).`);
