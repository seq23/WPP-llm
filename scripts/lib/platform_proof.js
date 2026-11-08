'use strict';
/**
 * The westpeek.live proof line on virtual / online / hybrid conference, summit
 * and virtual-event pages.
 *
 * Owner ruling (2 Nov 2026): West Peek Productions stays the ONE main call to
 * action on every page. Pages whose topic is an online, virtual or hybrid
 * conference, summit or event get one secondary line, "See the platform we run
 * it on", linking to westpeek.live as proof only: never an attendee sign-up,
 * never a second booking ask, never a pricing claim. Every other page gets none.
 *
 * Which pages: decided from the page's own topic field, never from its markup:
 *   - data/content/page_admission_registry.json  admissions[].query (status admitted)
 *   - data/content/wo3_production_pages.json      pages[].query
 *   - data/seo/demand_pages.json                  pages[].query
 * A page with no topic row gets no line.
 *
 * Applied by scripts/apply_site_head.js (the last HTML writer). Hash-locked pages
 * are thawed by scripts/prepare_platform_proof_refreeze.js (npm run
 * platform-proof:refreeze). Proven by scripts/test_platform_proof_line.js.
 */
const fs = require('fs');
const path = require('path');

const START = '<!--platform-proof:start-->';
const END = '<!--platform-proof:end-->';
const PLATFORM_ORIGIN = 'https://westpeek.live/';
const LABEL = 'See the platform we run it on';
// The public demo venue (owner, 7 Nov 2026). Only the pages listed here may link
// it, and on them every westpeek.live link must be the demo venue: a preview,
// never an attendee sign-up. Enquiries stay with the inquiry form.
const DEMO_VENUE = 'https://westpeek.live/venue/demo/lobby';
const DEMO_VENUE_PAGES = new Set(['answers/hopin-alternatives-virtual-events.html']);

// Online / virtual / hybrid, then within a few words a conference, summit or event.
const TOPIC = /\b(?:virtual|online|hybrid)\b[\w\s-]{0,20}?\b(?:conferences?|summits?|events?)\b/i;

function isPlatformProofTopic(topic) {
  return TOPIC.test(String(topic || ''));
}

function routeToFile(route, root) {
  const r = String(route || '').replace(/^\/+/, '').replace(/\/$/, '');
  for (const rel of [`${r}.html`, `${r}/index.html`]) if (fs.existsSync(path.join(root, rel))) return rel;
  return null;
}

/** Map of rendered file -> topic, from every topic source. */
function loadTopics(root) {
  const topics = new Map();
  const read = (rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const adm = read('data/content/page_admission_registry.json');
  for (const a of (adm && adm.admissions) || []) {
    if (a.status !== 'admitted' || !a.query) continue;
    const file = routeToFile(a.route, root);
    if (file) topics.set(file, a.query);
  }
  const wo3 = read('data/content/wo3_production_pages.json');
  for (const p of (wo3 && wo3.pages) || []) if (p.query) topics.set(`programmatic/${p.slug}.html`, p.query);
  const demand = read('data/seo/demand_pages.json');
  for (const p of (demand && demand.pages) || []) if (p.file && p.query) topics.set(p.file, p.query);
  return topics;
}

/** The set of rendered files that must carry the line. */
function platformProofFiles(root) {
  const out = new Set();
  for (const [file, topic] of loadTopics(root)) if (isPlatformProofTopic(topic)) out.add(file);
  return out;
}

function slugFor(rel) {
  return String(rel).replace(/(?:\/index)?\.html$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || 'home';
}

function platformProofBlock(rel) {
  const href = `${PLATFORM_ORIGIN}?utm_source=wpp-llm&amp;utm_medium=referral&amp;utm_campaign=platform-proof&amp;utm_content=${slugFor(rel)}`;
  return `${START}<p class="platform-proof" data-platform-proof="westpeek-live"><a href="${href}" target="_blank" rel="noopener">${LABEL}</a></p>${END}`;
}

/**
 * Remove any existing line, then add exactly one when `matches`. Idempotent.
 * Placed straight after the page's West Peek Productions next-step callout when
 * it has one, otherwise at the end of the article / main content.
 */
function applyPlatformProof(html, rel, matches) {
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`, 'g'), '');
  if (!matches) return html;
  const block = platformProofBlock(rel);
  const callout = html.match(/<div class="callout" data-content-block="cta_callout">[\s\S]*?<\/div>/);
  if (callout) return html.replace(callout[0], (m) => m + block);
  for (const anchor of ['</article>', '</main>']) {
    const i = html.lastIndexOf(anchor);
    if (i >= 0) return html.slice(0, i) + block + html.slice(i);
  }
  throw new Error(`platform-proof: no CTA callout, </article> or </main> to anchor the line in ${rel}`);
}

module.exports = { DEMO_VENUE, DEMO_VENUE_PAGES, START, END, PLATFORM_ORIGIN, isPlatformProofTopic, loadTopics, platformProofFiles, applyPlatformProof };
