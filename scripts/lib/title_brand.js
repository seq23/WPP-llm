/* eslint-disable no-console */
/**
 * THE ONE DEFINITION OF A TITLE THAT NAMES THIS SITE AND FITS THE BAND.
 *
 * Search Readiness b1 wants "30-65 characters, unique, the query first, the site
 * name once"; b10 wants every title to name its own site and never a sibling's.
 * Both are decided here, so the step that WRITES the titles
 * (scripts/apply_title_suffix_band.js) and the step that THAWS the hash-locked
 * routes those titles change (scripts/prepare_title_brand_refreeze.js) cannot
 * disagree about which pages move. Two components each keeping their own list is
 * exactly how a route gets rewritten outside its thaw scope and reds
 * validate:authority-scale.
 */
const { TITLE_MIN, TITLE_MAX, fitTitle } = require('./page_meta.js');

/** The canonical brand clause. 19 characters, so a page name has 46. */
const BRAND = ' | VirtualAgency OS';

/*
 * The brand forms b10 accepts, normalized the way the check normalizes them: the
 * host's own stem, and the homepage's og:site_name / Organization name. "West
 * Peek" and "West Peek Community Authority" are NOT on this list, which is exactly
 * why pages carrying them failed the check while looking branded.
 */
const ACCEPTED = ['virtualagencyos', 'westpeekproductions'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const namesTheSite = (title) => ACCEPTED.some((b) => norm(title).includes(b));
const inBand = (t) => t.length >= TITLE_MIN && t.length <= TITLE_MAX;

/** A trailing West Peek / VirtualAgency brand clause, whether or not it qualifies. */
const BRAND_CLAUSE = /\s*[|·–—]\s*(?:West\s*Peek(?:\s+[A-Za-z]+)*|Virtual\s*Agency\s*OS|VirtualAgency\s*OS|WPP)\s*$/i;

/** The name a title carries once any brand clause is taken off it. */
function nameOf(title) {
  const had = BRAND_CLAUSE.exec(title);
  return { name: had ? title.slice(0, -had[0].length).trim() : title, hadClause: Boolean(had) };
}

/**
 * What every page's title should become.
 *
 * `pages` is [{ rel, title }]. Returns { changes: Map rel -> next, kept, tooLong,
 * collisions }. A title that already names the site AND fits the band is left
 * strictly alone, so the pages that were already right are never churned.
 *
 * b1 also asks that no two pages share a title, so every page is read before any
 * is written and a change that would duplicate an existing title is refused. That
 * is not theoretical: /programmatic/brand-community-strategy-framework carried the
 * bare name while its duplicate-family sibling
 * /programmatic/brand-community-strategy-strategy-framework already carried the
 * branded one, so branding the first would have made the two identical. Two routes
 * sharing a name is a job for consolidate_duplicate_families.js, not something
 * this step papers over.
 *
 * It never truncates. page_meta.js says a hand-written title is "rewritten by a
 * person, never cut at a word", and cutting to buy room for the brand produced
 * "What should a community moderation | VirtualAgency OS". A name that cannot be
 * compressed into its budget keeps its whole self and is reported in `tooLong`.
 */
function planTitles(pages) {
  const sorted = [...pages].sort((a, b) => a.rel.localeCompare(b.rel));
  const taken = new Map();
  for (const p of sorted) taken.set(p.title, (taken.get(p.title) || 0) + 1);
  const changes = new Map();
  const tooLong = [];
  const collisions = [];
  let kept = 0;

  for (const { rel, title } of sorted) {
    if (namesTheSite(title) && inBand(title)) { kept++; continue; }
    const { name } = nameOf(title);

    /*
     * b1: "the site name once", and its own example of the defect is "Memphis
     * Vendor Library | Memphis Vendor Library". A page whose NAME already says
     * VirtualAgency OS never gets a second brand clause bolted on: /admin reads
     * "VirtualAgency OS Admin", 22 characters, which is under the band - and the
     * answer to a short title is a fuller name, not the brand said twice.
     */
    if (namesTheSite(name)) {
      tooLong.push({ rel, title, name, why: `"${title}" is ${title.length} chars; its name already says the site, so the band is a naming job, not a brand job` });
      continue;
    }

    const next = fitTitle(name, BRAND, { truncate: false });

    if (!next || next === title) {
      tooLong.push({ rel, title, name, why: `"${title}" is ${title.length} chars and its name is ${name.length}; no compression leaves room for "${BRAND.trim()}"` });
      continue;
    }
    if (!namesTheSite(next)) {
      // fitTitle fell through to the bare name: compression could not make room
      // for the brand, and this step does not cut a name to buy it.
      tooLong.push({ rel, title, name, why: `"${name}" is ${name.length} chars, over the ${TITLE_MAX - BRAND.length} a name has beside "${BRAND.trim()}"` });
      if (next === title) continue;
    }
    if (taken.has(next) && next !== title) {
      collisions.push({ rel, next, why: `"${next}" is already another page's title; the duplicate family needs consolidating` });
      continue;
    }
    // RULE 0 for this step: a rewrite that says the site's name twice is a defect,
    // not a fix, and it stops the run rather than being written.
    for (const b of ACCEPTED) {
      const n = norm(next);
      let at = -1, seen = 0;
      while ((at = n.indexOf(b, at + 1)) !== -1) seen++;
      if (seen > 1) throw new Error(`title_brand: "${next}" would name the site twice (${b}); refusing to write it for ${rel}`);
    }
    taken.set(title, (taken.get(title) || 1) - 1);
    if (!taken.get(title)) taken.delete(title);
    taken.set(next, (taken.get(next) || 0) + 1);
    changes.set(rel, next);
  }
  return { changes, kept, tooLong, collisions };
}

/** The brand clause the finished chrome uses (header, og:site_name). 24 characters. */
const FINISH_BRAND = ' | West Peek Productions';

/**
 * The title a page gets on the live site (scripts/lib/page_finish.js).
 *
 * Until 7 Nov 2026 the finish appended " | West Peek Productions" to any rewrite
 * title of 44 characters or fewer and left every longer one bare. 44 + 24 = 68, over
 * the band (b1: /answers/west-peek-productions-fit served "When Is West Peek
 * Productions the Right Fit? | West Peek Productions", 68 chars and the name twice),
 * and every title of 45+ shipped naming nobody (b10:
 * /programmatic/best-virtual-conference-platforms served "Best Virtual Conference
 * Platforms Buyer Guide"). This is the same ladder the build uses (planTitles):
 * a name that already says the site and fits is kept alone; otherwise the
 * finish's own brand, then the shorter canonical one, each through fitTitle's
 * compression and never a cut at a word. Only when neither fits does the page
 * keep `fallback` (its committed title, already fitted by the build) if that
 * names the site and fits, else the bare name.
 */
function finishTitle(rawTitle, fallback = '') {
  const { name } = nameOf(String(rawTitle || '').trim());
  const fallbackOk = namesTheSite(fallback) && inBand(fallback);
  if (!name) return fallback;
  if (namesTheSite(name)) return inBand(name) || !fallbackOk ? name : fallback;
  for (const suffix of [FINISH_BRAND, BRAND]) {
    const next = fitTitle(name, suffix, { truncate: false });
    if (next && namesTheSite(next)) return next;
  }
  return fallbackOk ? fallback : name;
}

module.exports = { BRAND, FINISH_BRAND, ACCEPTED, BRAND_CLAUSE, namesTheSite, inBand, nameOf, planTitles, finishTitle };
