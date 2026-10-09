#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Brings every programmatic guide's <title> and meta description inside the
 * site's meta policy (scripts/lib/page_meta.js): description 110-160 characters,
 * title 30-70, and no two indexable pages sharing either.
 *
 * WHY A BUILD STEP AND NOT ONLY THE RENDERER
 * -----------------------------------------
 * render_programmatic_page.js now writes a compliant description at birth, but
 * the ~3,000 guides already published were rendered once and frozen
 * (data/release/frozen_output_registry.json). Their description was the hero
 * sentence, 200-340 characters, and a later repair pass cut some of those at 160
 * mid-clause ("... the early warning on no."). This step rebuilds the description
 * from the page's own record, read back out of its hero sentence with the same
 * parser the renderer uses, so a re-rendered page and a migrated one agree.
 *
 * Two pages can carry one query (a query governed onto two routes): nine title
 * groups on 25 Sep 2026. The page whose route IS the query keeps it; any other
 * page in the group is named from its own route, which is what makes it a
 * different page. This mirrors repairDuplicateTitle in apply_repairs.js.
 *
 * Frozen pages are restored after this step in `npm run build`, so on a normal
 * build it changes nothing on them; a thawed route (EXACT_ROUTE_THAW_VALIDATE_
 * REFREEZE) picks it up. scripts/validators/validate_page_meta.js is the gate.
 *
 * RULE 0: fewer than MIN_PAGES programmatic pages parsed means the parser has
 * stopped matching the template, and that exits non-zero.
 */
const fs = require('fs');
const path = require('path');
const { TITLE_MIN, fitTitle, programmaticDescriptionFromHero, programmaticDescription, parseHero } = require('./lib/page_meta.js');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'programmatic');
const SUFFIX = ' | VirtualAgency OS';
const MIN_PAGES = 1000;

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unesc = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Same casing rule as render_programmatic_page.js titleCase, so a renamed page
// reads like its siblings.
const titleCase = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and').replace(/\bFor\b/g, 'for').replace(/\bVs\b/g, 'vs.');
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function read(file) {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8');
  const about = html.match(/"about":\{"@type":"Thing","name":"((?:[^"\\]|\\.)*)"\}/);
  const hero = html.match(/<section class="hero"><h1>([\s\S]*?)<\/h1><p>([\s\S]*?)<\/p>/);
  const title = html.match(/<title>([^<]*)<\/title>/);
  const desc = html.match(/<meta name="description" content="([^"]*)">/);
  const robots = (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';
  let query = null;
  if (about) { try { query = JSON.parse(`"${about[1]}"`); } catch { query = null; } }
  return {
    file, html, slug: file.replace(/\.html$/, ''), query,
    h1: hero ? unesc(hero[1]).trim() : null,
    hero: hero ? unesc(hero[2]) : null,
    title: title ? unesc(title[1]) : null,
    desc: desc ? unesc(desc[1]) : null,
    indexable: !/noindex/i.test(robots),
  };
}

const pages = fs.readdirSync(DIR).filter((f) => f.endsWith('.html')).sort().map(read);
const guides = pages.filter((p) => p.query && p.hero && parseHero(p.hero) && p.title && p.desc !== null);

if (guides.length < MIN_PAGES) {
  console.error(`apply_page_meta_policy: parsed only ${guides.length} programmatic guides (floor ${MIN_PAGES}). The hero or about markup has changed shape, so this step would silently do nothing.`);
  process.exit(1);
}

// 1. Description from the page's own record.
// A one-word query ("Livekit", "West Peak") makes a title Bing reads as empty;
// the page's own heading question is the longer name it already answers to.
// A title over 70 characters is cut by Bing ("Title too long"): the suffix goes
// first, then the family's longer phrasings (scripts/lib/page_meta.js SHORTER).
function fitted(title, { truncate = true } = {}) {
  const i = title.lastIndexOf(' | ');
  const name = i >= 0 ? title.slice(0, i) : title;
  const suffix = i >= 0 ? title.slice(i) : '';
  return fitTitle(name, suffix, { truncate }) || title;
}
for (const p of guides) {
  p.nextTitle = fitted(p.title.length < TITLE_MIN && p.h1 ? `${p.h1}${SUFFIX}` : p.title);
  p.nextDesc = programmaticDescriptionFromHero(p.query, p.hero) || p.desc;
}
// Pages outside the guide template (hand-written guides, community frameworks)
// keep their own description; their title loses only its suffix. A hand-written
// title still over the band is left for validate_page_meta.js to name, because
// cutting a person's sentence at a word reads as broken.
const others = pages.filter((p) => !guides.includes(p) && p.title);
for (const p of others) {
  p.nextTitle = fitted(p.title, { truncate: false });
  p.nextDesc = p.desc;
}

// 2. One query on several indexable routes: the route that is the query keeps
//    it, the others are named from their own route.
// A rename can land on another page's title (how-to-host-a-virtual-event, named
// from its route, is the query of host-virtual-events), so this repeats until no
// title is shared. A page already named from its route owns that name: routes
// are unique, so those titles are too, and the loop converges.
const routeTitle = (p) => fitted(`${titleCase(p.slug.replace(/-/g, ' '))}${SUFFIX}`);
let renamed = 0;
for (let pass = 0; pass < 5; pass += 1) {
  const byTitle = new Map();
  for (const p of guides.filter((g) => g.indexable)) {
    if (!byTitle.has(p.nextTitle)) byTitle.set(p.nextTitle, []);
    byTitle.get(p.nextTitle).push(p);
  }
  let changed = 0;
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    const owner = group.find((p) => p.nextTitle === routeTitle(p)) || group.find((p) => p.slug === slugify(p.query));
    for (const p of group) {
      if (p === owner) continue;
      p.nextTitle = routeTitle(p);
      renamed += 1;
      changed += 1;
    }
  }
  if (!changed) break;
}

// A page named from its route is described from its route too, on this run and
// on every later one (when its title no longer collides, this is what keeps its
// description from falling back to the shared query).
for (const p of guides) {
  if (p.nextTitle === routeTitle(p) && p.slug !== slugify(p.query)) {
    p.nextDesc = programmaticDescription({ query: p.slug.replace(/-/g, ' '), ...parseHero(p.hero) }) || p.nextDesc;
  }
}

// 3. Write.
let written = 0;
for (const p of [...guides, ...others]) {
  if (p.nextTitle === p.title && p.nextDesc === p.desc) continue;
  let html = p.html;
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(p.nextTitle)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(p.nextDesc)}">`);
  if (html !== p.html) {
    fs.writeFileSync(path.join(DIR, p.file), html);
    written += 1;
  }
}

console.log(`apply_page_meta_policy: ${guides.length} programmatic guides parsed, ${renamed} renamed from their route to end a shared title, ${written} file(s) rewritten.`);
