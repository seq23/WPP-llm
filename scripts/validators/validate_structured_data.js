#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Schema never claims what the page does not say.
 *  - Price parity: every Service configured in data/seo/site_head.json has a
 *    homepage Service node carrying the configured price range and currency,
 *    and every configured visible_price_text still appears in the homepage's
 *    own words. A schema price the copy no longer states outlives the thing it
 *    claims to describe.
 *  - FAQ parity: every Question name in a FAQPage on an owned page appears in
 *    that page's visible text.
 *
 * Trimmed 10 Nov 2026 to these two rules (hostile review of the validator cut);
 * the brand, speakable and demand-page SEO checks were cut.
 * Rule 0: zero owned pages, zero configured services or zero FAQPage pages fail.
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

let faqPages = 0;
let faqQuestions = 0;
for (const rel of pages) {
  const h = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const faqs = nodes(blocks(h, rel)).filter((n) => [].concat(n['@type']).includes('FAQPage'));
  if (!faqs.length) continue;
  faqPages++;
  const text = visible(h);
  for (const f of faqs) for (const q of [].concat(f.mainEntity || [])) {
    if (!q || !q.name) continue;
    faqQuestions++;
    if (!text.includes(norm(q.name))) errors.push(`${rel}: FAQPage question not visible on the page: "${q.name.slice(0, 80)}"`);
  }
}
if (!faqQuestions) errors.push('no FAQPage question found on any owned page; the FAQ parity rule compared nothing');

const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const hn = nodes(blocks(home, 'index.html'));
const svcCfg = cfg.services || {};
const svcOffers = svcCfg.offers || [];
if (!svcOffers.length) errors.push('data/seo/site_head.json configures no services; price parity compared nothing');
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
  if (!o.visible_price_text) errors.push(`data/seo/site_head.json: Service "${o.name}" has no visible_price_text to check the schema price against`);
  else if (!homeText.includes(norm(o.visible_price_text))) errors.push(`index.html: Service "${o.name}" is priced in schema but the homepage no longer says "${o.visible_price_text}" in its own words`);
}
if (errors.length) { console.error(`structured data FAILED (${errors.length}):\n- ` + errors.slice(0, 40).join('\n- ')); process.exit(1); }
console.log(`structured data OK: ${faqQuestions} FAQPage question(s) on ${faqPages} page(s) all visible; ${svcNodes.length} priced Service node(s) match the homepage copy.`);
