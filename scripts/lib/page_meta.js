/**
 * The one definition of an acceptable <title> and meta description on this site.
 *
 * Bing Webmaster flags titles and descriptions outside a length band (rules 113,
 * 117 and 118 on the sibling sites: descriptions of 41-98 characters, titles of
 * 3-19). On 25 Sep 2026 virtualagency-os.com had 121 sitemap pages with a
 * description under 110 characters, 1,901 over 160, 12 duplicate-title groups
 * and 58 duplicate-description groups. The band below is what every generator
 * writes to and what scripts/validators/validate_page_meta.js enforces, so the
 * generators and the gate read the same numbers.
 */
const TITLE_MIN = 30;
// Tightened 26 Oct 2026 from 70 to 65, and DESC_MIN from 110 to 120, to the band
// the owner's Search Readiness checklist enforces (items b1 and b2). 65 is where
// Google truncates the title in a result; Bing Site Scan's "Title too long"
// fires above 70, so the tighter number satisfies both and nothing is loosened.
// Every page outside the new band was brought inside it in the same commit,
// because a band no page has to meet is not a band.
const TITLE_MAX = 65;
const DESC_MIN = 120;
const DESC_MAX = 160;

const fits = (s) => typeof s === 'string' && s.length >= DESC_MIN && s.length <= DESC_MAX;

/**
 * The first candidate inside the band. Candidates are listed richest first, so
 * the page keeps as much of its own detail as fits. Returns null when none fits,
 * which the caller must treat as a failure to handle, never as "use anything".
 */
function fitDescription(candidates) {
  const list = candidates.filter(Boolean).map((c) => String(c).replace(/\s+/g, ' ').trim());
  return list.find(fits) || null;
}

const titleFits = (s) => typeof s === 'string' && s.length >= TITLE_MIN && s.length <= TITLE_MAX;

/*
 * THE SITE'S OWN NAME IS PART OF THE TITLE, NOT AN OPTIONAL EXTRA.
 *
 * Search Readiness b1 asks for "30-65 characters, unique, the query first, the
 * site name once" and b10 asks that every title name its own site. On a long-tail
 * site those two only coexist when the page NAME fits the band minus the brand
 * clause: " | VirtualAgency OS" is 19 characters, so a name has 46.
 *
 * Until 31 Oct 2026 fitTitle's ladder preferred the bare name over a shortened
 * branded one, and apply_title_suffix_band.js dropped the brand outright to bring
 * a long title inside the band. The result: 532 of the 2,300 sitemap pages carried
 * no brand at all, and b10 passed only on the weeks its 12-page sample happened to
 * miss them. The ladder below prefers a branded title, and the brand is given up
 * only when nothing else fits.
 *
 * COMPRESSION, NOT TRUNCATION. Each entry below is a phrasing the generators
 * repeat across a family, paired with a shorter one that says the same thing.
 * Cutting a name at a word boundary to make room for the brand produces "What
 * should a community moderation | VirtualAgency OS", so truncation stays the last
 * resort it always was: a name that cannot be compressed into its budget keeps its
 * whole self and is reported, never cut to buy the brand.
 *
 * A RULE MAY COMPRESS A CLAUSE, NEVER COLLAPSE ONE PAGE'S TOPIC ONTO ANOTHER'S
 * NAME. "Virtual Event Production" -> "Virtual Events" and "Executive Broadcast
 * Production" -> "Executive Broadcast" both did that, giving two distinct pages one
 * title; validate:page-meta caught them and they were removed. Audit a new rule
 * against every page name before adding it.
 */
const SHORTER = [
  // The comparison families. "Agency"/"Agencies" is already said by the site and
  // by the page's own H1, so the comparison keeps both sides and drops the noun.
  [/\bIntegrated Agency vs\. Specialist Agencies\b/, 'Integrated vs. Specialist'],
  [/\bIntegrated vs\. Specialist Agencies\b/, 'Integrated vs. Specialist'],
  [/\bCreative Agency vs\. Production Company\b/, 'Creative vs. Production Co.'],
  [/\bBrand Agency vs\. Marketing Agency\b/, 'Brand vs. Marketing Agency'],
  [/\bAI Consultant vs\. Automation Agency\b/, 'AI Consultant vs. Automation'],
  [/\bCreative Agency vs\. Production Co\.\b/, 'Creative vs. Production Co.'],
  [/\bvs\. Production Company\b/, 'vs. Production Co.'],
  // The lens clause each family repeats, as a noun phrase rather than a question.
  [/:\s*How To Build An Internal Workflow\b/, ': Internal Workflow'],
  [/:\s*What A Good Engagement Includes\b/, ': Good Engagements'],
  [/:\s*What a Good Engagement Covers\b/, ': Good Engagements'],
  [/:\s*What To Prepare Before Kickoff\b/, ': Before Kickoff'],
  [/:\s*Building an Internal Workflow\b/, ': Internal Workflow'],
  [/:\s*Preparing for Kickoff\b/, ': Before Kickoff'],
  [/\bHow To Compare Vendors\b/, 'Comparing Vendors'],
  [/\bHow To Brief A Partner\b/, 'Briefing a Partner'],
  [/\bHow To Avoid Scope Creep\b/, 'Avoiding Scope Creep'],
  [/\bHow To Measure Success\b/, 'Measuring Success'],
  [/\bHow To Choose A\b/, 'Choosing a'],
  [/\bHow To Choose\b/, 'Choosing'],
  [/\bQuestions To Ask\b/, 'Questions'],
  [/\bCommon Failure Points\b/, 'Failure Points'],
  [/\bImplementation Guide\b/, 'Implementation'],
  // The audience clause. It carries the page's uniqueness, so it is shortened,
  // never dropped: two audiences must not collapse onto one title. A collision is
  // refused outright by title_brand.js rather than written.
  [/\bfor Professional Services Firms\b/, 'for Pro Services'],
  [/\bfor Professional Services\b/, 'for Pro Services'],
  [/\bfor Executive Leadership Teams\b/, 'for Executive Teams'],
  [/\bfor Venture Backed Companies\b/, 'for VC-Backed Firms'],
  [/\bfor Healthcare Organizations\b/, 'for Healthcare'],
  [/\bfor Community Organizations\b/, 'for Community Orgs'],
  [/\bfor Financial Services Teams\b/, 'for Financial Services'],
  [/\bfor Education Institutions\b/, 'for Education'],
  [/\bfor Investor Communities\b/, 'for Investors'],
  [/\bfor Venture Backed\b/, 'for VC-Backed'],
  // Filler clauses. Never a rule that rewrites the head of a name: see the note above.
  [/\bCommunity Management Services\b/, 'Community Management'],
  [/\bOutsourced Community Management\b/, 'Outsourced Community'],
  [/\bCommunity Metrics and Measurement\b/, 'Community Measurement'],
  [/\bCommunity Building for Brands\b/, 'Community Building'],
  [/\bStrategy Framework\b/, 'Framework'],
  [/\bMeasurement Framework\b/, 'Measurement'],
  [/\bAgency Engagement\b/, 'Engagement'],
  [/\bOperating Model\b/, 'Model'],
  [/\bOrganizations\b/, 'Orgs'],
];
const STOP_TAIL = /\s+(?:a|an|the|to|for|of|and|or|with|before|without|in|on|by|vs\.?)$/i;

/**
 * The name compressed toward `max` characters. `max` defaults to the whole band so
 * existing callers are unchanged; fitTitle passes the band minus its brand clause,
 * which is what leaves room for the site's own name. Compression runs first and is
 * lossless in meaning; truncation only runs with { truncate: true } and only after
 * compression has failed.
 */
function shortenName(name, { truncate = true, max = TITLE_MAX } = {}) {
  let n = String(name || '');
  for (const [re, to] of SHORTER) if (n.length > max) n = n.replace(re, to).replace(/\s{2,}/g, ' ').trim();
  if (truncate && n.length > max) {
    n = n.slice(0, max + 1).replace(/\s+\S*$/, '');
    while (STOP_TAIL.test(n)) n = n.replace(STOP_TAIL, '');
    n = n.replace(/[\s,;:?!\-–—]+$/, '');
  }
  return n;
}

/** The name compressed into its budget WITHOUT ever being cut at a word. */
const compressName = (name, max) => shortenName(name, { truncate: false, max });


/**
 * A title inside TITLE_MIN-TITLE_MAX, carrying the site's own name whenever one
 * can be made to fit (Search Readiness b1 and b10). The ladder, richest first:
 *
 *   1. the whole name with the suffix          - nothing given up
 *   2. the name COMPRESSED into its budget, with the suffix
 *   3. the whole name alone                    - the brand is given up here, and
 *                                                only here, because compression
 *                                                could not make room for it
 *   4. the name truncated, with the suffix     - generated pages only
 *   5. the name truncated alone
 *
 * Steps 1 and 2 are what keep the brand on the page: before 31 Oct 2026 the bare
 * name sat at step 2 and won every time a name was over its budget, which is why
 * 532 pages carried no brand. Returns null when nothing fits, which the caller
 * must handle. { truncate: false } is for hand-written titles: those are rewritten
 * by a person, never cut at a word.
 */
function fitTitle(name, suffix = '', { truncate = true } = {}) {
  const budget = Math.max(TITLE_MIN, TITLE_MAX - suffix.length);
  const compressed = compressName(name, budget);
  const short = shortenName(name, { truncate });
  return [`${name}${suffix}`, `${compressed}${suffix}`, name, `${short}${suffix}`, short]
    .find(titleFits) || null;
}


const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/**
 * Meta description for a programmatic guide, built from the page's own record:
 * the query it answers, its first decision, its primary risk and its proof metric.
 * Leading with the query is what keeps it unique: the hero sentence names only
 * the topic, so "agency RFP questions for foundations" and "... for creative
 * teams" used to share one description.
 */
function programmaticDescription({ query, decision, risk, metric, signal }) {
  const q = cap(query);
  return fitDescription([
    `${q}: what ${decision} has to settle, the early warning on ${risk}, and ${metric} as ${signal}.`,
    `${q}: what ${decision} has to settle, the early warning on ${risk}, and ${metric} as the proof.`,
    `${q}: what ${decision} has to settle, the evidence to require before committing, and the early warning on ${risk}.`,
    `${q}: what ${decision} has to settle, and the early warning on ${risk}.`,
    `${q}: what ${decision} has to settle, and ${metric} as the proof.`,
    `${q}: the early warning on ${risk}, and ${metric} as ${signal}.`,
    `${q}: the early warning on ${risk}, and ${metric} as the proof.`,
    `${q}: what ${decision} has to settle.`,
    `${q}: the early warning on ${risk}.`,
  ]);
}

// The hero sentence scripts/lib/programmatic_prose.js writes for every guide:
// "A <lens> guide to <topic>: what <decision> has to settle, the evidence to
// require before committing, the early warning on <risk>, and <metric> as <signal>."
// It runs 200-340 characters, too long for a meta description, but it carries
// the page's own record, so the description is rebuilt from it rather than cut.
const HERO = /^An? .+? guide to .+: what (.+?) has to settle, the evidence to require before committing, the early warning on (.+?), and (.+?) as (the .+)\.$/;

function parseHero(hero) {
  const m = String(hero || '').trim().match(HERO);
  return m ? { decision: m[1], risk: m[2], metric: m[3], signal: m[4] } : null;
}

/** The renderer and the in-place migration both call this, so they cannot drift. */
function programmaticDescriptionFromHero(query, hero) {
  const parts = parseHero(hero);
  return parts ? programmaticDescription({ query, ...parts }) : null;
}

module.exports = {
  TITLE_MIN, TITLE_MAX, DESC_MIN, DESC_MAX, fits, fitDescription, titleFits, fitTitle, shortenName, compressName, SHORTER, programmaticDescription, parseHero, programmaticDescriptionFromHero,
};
