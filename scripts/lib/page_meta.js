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
// Bing Site Scan flags "Title too long" above 70 characters.
const TITLE_MAX = 70;
const DESC_MIN = 110;
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

// Longer phrasings the programmatic generator repeats across a family, and a
// shorter one that says the same thing. Used only when a title is over the band.
const SHORTER = [
  [/\bIntegrated Agency vs\. Specialist Agencies\b/, 'Integrated vs. Specialist Agencies'],
  [/: How To Build An Internal Workflow$/, ': Building an Internal Workflow'],
  [/: What A Good Engagement Includes$/, ': What a Good Engagement Covers'],
  [/: What To Prepare Before Kickoff$/, ': Preparing for Kickoff'],
  [/\bfor Executive Leadership Teams$/, 'for Executive Teams'],
];
const STOP_TAIL = /\s+(?:a|an|the|to|for|of|and|or|with|before|without|in|on|by|vs\.?)$/i;

function shortenName(name, { truncate = true } = {}) {
  let n = String(name || '');
  for (const [re, to] of SHORTER) if (n.length > TITLE_MAX) n = n.replace(re, to);
  if (truncate && n.length > TITLE_MAX) {
    n = n.slice(0, TITLE_MAX + 1).replace(/\s+\S*$/, '');
    while (STOP_TAIL.test(n)) n = n.replace(STOP_TAIL, '');
    n = n.replace(/[\s,;:?!\-–—]+$/, '');
  }
  return n;
}

/**
 * A title inside TITLE_MIN-TITLE_MAX: the page name with the site suffix when
 * both fit, the name alone when only it fits, then a shortened name. Returns
 * null when nothing fits, which the caller must handle. { truncate: false } is
 * for hand-written titles: those are rewritten by a person, never cut at a word.
 */
function fitTitle(name, suffix = '', { truncate = true } = {}) {
  const short = shortenName(name, { truncate });
  return [`${name}${suffix}`, name, `${short}${suffix}`, short].find(titleFits) || null;
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
  TITLE_MIN, TITLE_MAX, DESC_MIN, DESC_MAX, fits, fitDescription, titleFits, fitTitle, shortenName, programmaticDescription, parseHero, programmaticDescriptionFromHero,
};
