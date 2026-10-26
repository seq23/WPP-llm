#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: a top-12 query-family page that does not serve the family.
 *
 * For every page in data/seo/demand_pages.json (the primary page of a top-12
 * family in data/seo/demand_families.json), the built HTML must have:
 *   - a 30-65 character title that starts with the family's measured query,
 *     and exactly one H1, both as configured;
 *   - a 40-60 word definition as the first paragraph under the H1;
 *   - at least three H2s in the page body, every one phrased as a question;
 *   - a visible FAQ of at least three questions, each taken from a measured
 *     query, and exactly ONE FAQPage in the document matching it;
 *   - a direct contact CTA carrying a ref (mailto subject "ref vaos-<family>"
 *     and a westpeekproductions.com link with utm_content=<family>);
 *   - a link from the homepage and from /topics/ (in every page's nav);
 *   - a comparison-intent page contains a table of at least four named rows; a
 *     checklist query is answered by a numbered list of at least ten steps;
 *   - no claim to be software, and on platform/software-category pages an
 *     explicit statement that West Peek Productions does not sell event
 *     software.
 * Every pinned secondary link (data/seo/demand_links.json) is present on its
 * page, pointing at a family primary. Measured URLs never 404: each family's
 * primary route resolves to a page.
 *
 * WHY. 11 Oct 2026: 482 measured queries, 7,288 impressions in 90 days, 0
 * clicks; the pages Google showed for the top families were generic decision
 * templates that did not answer the query.
 *
 * RULE 0: fewer than 12 demand pages, or zero pinned links, is a failure.
 */
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../lib/site_head.js');
const { resolvePath } = require('../lib/pages_routing.js');

const ROOT = path.resolve(__dirname, '../..');
const DP_START = '<!--demand-page:start-->';
const DP_END = '<!--demand-page:end-->';
const unesc = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const text = (h) => unesc(String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const norm = (s) => unesc(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => text(s).split(/\s+/).filter(Boolean).length;
const SOFTWARE_CLAIMS = [
  /\b(our|west peek(?: productions)?['’]s) (event )?(platform|software|app|saas)\b/i,
  /\bwest peek(?: productions)? is (a|an) (event |virtual event |hybrid event )?(platform|software|saas|app)\b/i,
  /\b(free trial|start (your|a) trial|sign up free|download (the|our) app|log ?in to (the|your) dashboard)\b/i,
];
const NOT_SOFTWARE = 'does not sell event software';

const cfg = loadConfig();
const fams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seo/demand_families.json'), 'utf8'));
const famBy = new Map((fams.families || []).map((f) => [f.family, f]));
const declared = new Set((JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seo/demand_family_rules.json'), 'utf8')).families || []).map((r) => r.id));
const pages = (cfg.demand_pages || []).filter((d) => d.full);
const errors = [];
const warnings = [];
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf8') : null);
const home = read('index.html') || '';
const topics = read('topics/index.html') || '';

if (pages.length < 12) errors.push(`only ${pages.length} demand pages configured; the top 12 families each need one`);
for (const famId of fams.top12 || []) {
  if (!pages.some((p) => p.family === famId)) warnings.push(`top-12 family "${famId}" has no demand page yet (flagged needs_demand_page in data/seo/strengthening_ledger.json)`);
}

for (const d of pages) {
  const e = (m) => errors.push(`${d.file}: ${m}`);
  const fam = famBy.get(d.family);
  if (!declared.has(d.family)) { e(`family "${d.family}" is not declared in demand_family_rules.json`); continue; }
  if (!fam) { e(`family "${d.family}" is declared but missing from demand_families.json; run npm run seo:strengthening-sweep`); continue; }
  if (fam.primary_route !== d.route) e(`route ${d.route} is not the family primary ${fam.primary_route}`);
  const r = resolvePath(d.route, { root: ROOT });
  if (r.kind !== 'page') e(`primary route ${d.route} does not resolve to a page (${r.kind})`);
  const h = read(d.file);
  if (!h) { e('page missing'); continue; }

  const title = unesc((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
  if (title !== unesc(d.title)) e(`title is not the configured title ("${title}")`);
  if (title.length < 30 || title.length > 65) e(`title is ${title.length} chars; must be 30-65`);
  if (!norm(title).startsWith(norm(d.query))) e(`title does not start with the query "${d.query}"`);
  if (!(fam.queries || []).some((q) => q.query === d.query)) warnings.push(`${d.file}: title query "${d.query}" is no longer a measured query of ${d.family}`);

  const h1s = [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  if (h1s.length !== 1) e(`${h1s.length} H1s; must be exactly 1`);
  else if (text(h1s[0][1]) !== text(d.h1)) e('H1 is not the configured H1');

  const def = h.match(/<\/h1>\s*<p class="definition" id="definition">([\s\S]*?)<\/p>/);
  if (!def) e('no definition paragraph directly under the H1');
  else {
    const w = words(def[1]);
    if (w < 40 || w > 60) e(`definition is ${w} words; must be 40-60`);
    if (text(def[1]) !== text(d.definition)) e('definition is not the configured definition');
  }

  const i = h.indexOf(DP_START); const j = h.indexOf(DP_END);
  if (i < 0 || j < i) { e('demand region missing'); continue; }
  const region = h.slice(i, j);
  const h2s = [...region.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]));
  if (h2s.length < 3) e(`${h2s.length} H2s in the body; need at least 3`);
  for (const x of h2s) if (!x.endsWith('?')) e(`H2 is not a question: "${x}"`);

  const faqSec = region.match(/<section class="faq demand-faq"[^>]*>([\s\S]*?)<\/section>/);
  const qas = faqSec ? [...faqSec[1].matchAll(/<div class="qa-block"><h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p><\/div>/g)] : [];
  if (qas.length < 3) e(`visible FAQ has ${qas.length} questions; need at least 3`);
  const measured = new Set((fam.queries || []).map((q) => q.query));
  for (const f of d.faq) if (!measured.has(f.from_query)) warnings.push(`${d.file}: FAQ "${f.q}" comes from "${f.from_query}", no longer a measured query of ${d.family}`);
  const faqLd = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter((x) => x && [].concat(x['@type']).includes('FAQPage'));
  if (faqLd.length !== 1) e(`${faqLd.length} FAQPage blocks; must be exactly 1`);
  else {
    const names = (faqLd[0].mainEntity || []).map((q) => text(q.name));
    const visible = qas.map((m) => text(m[1]));
    if (JSON.stringify(names) !== JSON.stringify(visible)) e('FAQPage questions do not match the visible FAQ');
  }

  const cta = region.match(/<p class="demand-cta">([\s\S]*?)<\/p>/);
  if (!cta) e('direct contact CTA missing');
  else {
    if (!cta[1].includes(`href="mailto:${cfg.demand_page_cta.email}?subject=`) || !cta[1].includes(encodeURIComponent(`ref vaos-${d.family}`))) e('CTA mailto has no ref');
    if (!new RegExp(`href="https://www\\.westpeekproductions\\.com/[^"]*utm_content=${d.family}[&"]`).test(cta[1])) e('CTA has no westpeekproductions.com link with utm_content=<family>');
  }

  if (!home.includes(`href="${d.route}"`)) e('not linked from the homepage');
  if (!topics.includes(`href="${d.route}"`)) e('not linked from /topics/ (the nav hub)');

  const body = text(region);
  if (fam.intent === 'comparison' && !/<table/.test(region)) e('comparison page has no table');
  if (fam.intent === 'comparison') {
    const rows = [...region.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].reduce((a, m) => a + (m[1].match(/<tr>/g) || []).length, 0);
    if (rows < 4) e(`comparison page has ${rows} table rows; need at least 4`);
  }
  if (/checklist/.test(d.query)) {
    const ol = region.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
    if (!ol || (ol[1].match(/<li>/g) || []).length < 10) e('checklist query is not answered by a numbered list of at least 10 steps');
  }
  for (const re of SOFTWARE_CLAIMS) if (re.test(body)) e(`claims to be software: ${re}`);
  if (/platform|software/.test(d.query) && !body.includes(NOT_SOFTWARE)) e(`platform-category page must say West Peek Productions "${NOT_SOFTWARE}"`);
}

const links = cfg.demand_links || [];
if (!links.length) errors.push('zero pinned secondary links (data/seo/demand_links.json); the family pages are not linked from their own landing pages');
const primaries = new Set(pages.map((p) => p.route));
for (const l of links) {
  const h = read(l.file);
  if (!h) { errors.push(`${l.file}: linking page missing`); continue; }
  const blk = (h.match(/<!--demand-link:start-->([\s\S]*?)<!--demand-link:end-->/) || [])[1];
  if (!blk) { errors.push(`${l.file}: no link to its family primary`); continue; }
  for (const x of l.links) {
    if (!primaries.has(x.href)) errors.push(`${l.file}: links to ${x.href}, which is not a family primary`);
    if (!blk.includes(`href="${x.href}"`)) errors.push(`${l.file}: missing the link to ${x.href}`);
  }
}

for (const w of warnings.slice(0, 20)) console.warn(`WARN ${w}`);
if (errors.length) { console.error(`demand pages FAILED (${errors.length}):\n- ${errors.slice(0, 40).join('\n- ')}`); process.exit(1); }
console.log(`demand pages OK: ${pages.length} family pages serve their intent (title, H1, definition, question H2s, one FAQPage, CTA ref, homepage + /topics/ links); ${links.length} landing pages link to their family primary.`);
