#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Build the internal link architecture.
 *
 * The problem this exists to solve, measured by scripts/link_graph_report.js:
 * 3,016 of 3,241 pages had zero inbound internal links, and 3,062 were not
 * reachable from the homepage at any depth. The /programmatic/ tree - 3,052
 * pages - had no hub above it. Every one of those URLs was in the sitemap and
 * had been pushed to Bing via IndexNow; 234 got indexed, and they were the ones
 * that happened to be linked. Announcing a URL is not a claim that the page
 * matters. An inbound internal link is.
 *
 * What it builds, and why in this shape:
 *
 *   /                     the homepage
 *   /topics/              one directory page, in the main nav          depth 1
 *   /topics/<cluster>     ~71 hubs, one per topic cluster              depth 2
 *   /programmatic/<page>  every generated page, from its own hub       depth 3
 *
 * The taxonomy is not invented here. It is the `cluster` and `pillar` fields
 * already carried in data/content/page_admission_registry.json, with a slug
 * prefix fallback for pages admitted before the cluster field existed. A hub
 * therefore groups pages that the repo already considered one topic.
 *
 * Three things this deliberately does NOT do, because each is a doorway or
 * link-farm pattern that gets links discounted rather than counted:
 *
 *   - No single page listing 3,000 links. The directory page lists 71 hubs
 *     grouped under 9 pillars; each hub lists its own ~45 members, sectioned by
 *     what the reader is actually trying to decide.
 *   - No sitewide footer link block. The only sitewide addition is one main
 *     navigation entry pointing at /topics/.
 *   - No repeated anchor text. Every link's anchor is the target page's own h1
 *     question, so the anchor describes the destination and varies by
 *     construction - 2,895 distinct anchors across the generated set.
 *
 * Sibling links use a ring with fixed skips over each cluster's member list,
 * ordered so consecutive positions sit in different intent sections. Every page
 * gets the same number of siblings out and in: even distribution, no page
 * accumulating link equity at the expense of the rest, and no page left at one
 * inbound link from its hub alone.
 *
 * Second pass, 2026-08-26. The first pass fixed reachability; it left the
 * corpus at a median of 12 unique internal links out per page, against the 17
 * measured on the most-cited property in the estate
 * (local-guides-generator/docs/strategy/cited-property-profile.md), and it only
 * ever touched /programmatic/. Three things changed:
 *
 *   - the sibling ring widened from five to eight,
 *   - every generated page gained a short block of neighbouring topics inside
 *     its own pillar, so a reader who has decided this is not their question
 *     has somewhere sideways to go rather than only back up,
 *   - the other 261 pages - /answers/, /query-atlas/, /learn/, /insights/,
 *     /case-studies/, /pillars/ and the root pages - got breadcrumbs and a
 *     related block of their own. 169 of them carried no BreadcrumbList at all.
 *
 * The second-pass blocks are sized to the page: a page already at the standard
 * gets nothing, because filler links to hit a number are their own signal.
 *
 * Idempotent. Every injected region is delimited by <!--link-arch:NAME--> and
 * stripped before being rewritten, so re-running after a freeze/restore cycle
 * converges rather than compounding. It never removes markup it did not write:
 * pre-existing hrefs and visible text are asserted unchanged by
 * scripts/verify_no_links_lost.js.
 *
 * Usage:
 *   node scripts/build_link_architecture.js --plan          # report, write nothing
 *   node scripts/build_link_architecture.js --scope-only    # write mutation scope only
 *   node scripts/build_link_architecture.js                 # generate and inject
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOMAIN = 'https://virtualagency-os.com';
const TOPICS_DIR = path.join(ROOT, 'topics');
const SCOPE_FILE = path.join(ROOT, 'data/release/active_mutation_scope.json');

const args = process.argv.slice(2);
const PLAN_ONLY = args.includes('--plan');
const SCOPE_ONLY = args.includes('--scope-only');
// Writing the mutation scope thaws frozen routes for one transaction, so it is
// off by default. The build runs this script without it: if a normal build
// wants to change a frozen page, that should surface as drift and be decided
// deliberately, not be waved through by a scope file the build wrote itself.
const WRITE_SCOPE = args.includes('--write-scope') || SCOPE_ONLY;

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content/page_admission_registry.json'), 'utf8'));
const admissions = new Map(registry.admissions.map((a) => [a.route, a]));

// Clusters the registry already names.
const registryClusters = [...new Set(registry.admissions.map((a) => a.cluster).filter(Boolean))];

// Three clusters the registry never got a name for. These are not new topics:
// they are existing page groups whose admission records predate the cluster
// field. Each is assigned to the pillar its members already carry.
const EXTRA_CLUSTERS = {
  'virtual-event-planning': { pillar: 'experiences', label: 'virtual event planning' },
  'community-operating-frameworks': { pillar: 'community', label: 'community operating frameworks' },
  'virtual-event-platform-selection': { pillar: 'experiences', label: 'virtual event platform selection' },
};

// Pages whose slug matches no cluster prefix. Filed by what the page is about,
// against a cluster that already exists or one of the three above.
const EXPLICIT = {
  'best-virtual-event-platforms': 'virtual-event-platform-selection',
  'online-conference-platforms': 'virtual-event-platform-selection',
  'hybrid-event-platform': 'virtual-event-platform-selection',
  'hybrid-event-platforms': 'virtual-event-platform-selection',
  'livekit-virtual-events': 'virtual-event-platform-selection',
  'streamyard-livekit-daily-stack': 'virtual-event-platform-selection',
  'streamyard-virtual-event-production': 'virtual-event-platform-selection',
  'software-vs-production': 'virtual-event-platform-selection',
  'community-30-60-90-day-launch-plan': 'community-operating-frameworks',
  'community-budget-planning-framework': 'community-operating-frameworks',
  'community-engagement-operating-cadence': 'community-operating-frameworks',
  'community-events-programming-framework': 'community-operating-frameworks',
  'community-governance-escalation-matrix': 'community-operating-frameworks',
  'community-health-scorecard': 'community-operating-frameworks',
  'community-launch-readiness-framework': 'community-operating-frameworks',
  'community-monetization-decision-framework': 'community-operating-frameworks',
  'community-platform-decision-matrix': 'community-operating-frameworks',
  'community-roi-measurement-model': 'community-operating-frameworks',
  'community-staffing-matrix': 'community-operating-frameworks',
  'founder-community-operating-model': 'community-operating-frameworks',
  'professional-community-operating-model': 'community-operating-frameworks',
  'saas-community-strategy-framework': 'community-operating-frameworks',
  'daily-backup-event-systems': 'event-run-of-show',
  'virtual-event-backup-systems': 'event-run-of-show',
  'virtual-event-failure-prevention': 'event-run-of-show',
  'why-virtual-events-fail': 'event-run-of-show',
  'event-not-a-mess': 'event-run-of-show',
  'run-of-show-planning': 'event-run-of-show',
  'speaker-onboarding-and-rehearsals': 'event-run-of-show',
  'broadcast-style-virtual-events': 'virtual-event-production',
  'executive-event-production': 'virtual-event-production',
  'investor-event-production': 'virtual-event-production',
  'multi-speaker-event-production': 'virtual-event-production',
  'virtual-career-fair-production': 'virtual-event-production',
  'virtual-conference-production': 'virtual-event-production',
  'virtual-event-management': 'virtual-event-production',
  'virtual-event-marketing': 'virtual-event-production',
  'virtual-event-services': 'virtual-event-production',
  'virtual-event-pricing': 'virtual-event-production',
  'virtual-event-trends-2026': 'virtual-event-production',
  'how-to-host-a-virtual-event': 'virtual-event-production',
  'host-virtual-events': 'virtual-event-production',
  'virtual-events-value': 'virtual-event-production',
  'visual-event-portfolio': 'virtual-event-production',
  'brand-look-legit': 'startup-brand-strategy',
  'branding-trust': 'startup-brand-strategy',
  'marketing-growth-2025': 'marketing-strategy-consulting',
  'marketing-without-content-machine': 'marketing-strategy-consulting',
  // Slugs that only exist under /answers/ or /query-atlas/, filed with the
  // programmatic cluster that covers the same question.
  'town-hall-production': 'executive-broadcast-production',
  'virtual-event-trends': 'virtual-event-production',
  'virtual-event-production-pricing': 'virtual-event-production',
  'how-many-producers-for-virtual-event': 'virtual-event-production',
  'streamyard-vs-livekit': 'virtual-event-platform-selection',
  'virtual-event-platform-stack': 'virtual-event-platform-selection',
};

const ALL_CLUSTERS = [...new Set([...registryClusters, ...Object.keys(EXTRA_CLUSTERS)])];
const BY_LENGTH = [...ALL_CLUSTERS].sort((a, b) => b.length - a.length);

const PILLAR_LABEL = {
  community: 'Community and Community as a Service',
  'agency-decisions': 'Agency and Consulting Decisions',
  experiences: 'Virtual and Hybrid Experiences',
  authority: 'Authority and Trust Building',
  'ai-workflows': 'AI Workflows and Creative Operations',
  marketing: 'Marketing and Audience Growth',
  creative: 'Creative Strategy and Production',
  storytelling: 'Storytelling and Narrative',
  brand: 'Brand Strategy',
};
// Pillars that already have a hub page at /pillars/<slug>.
const PILLAR_PAGE = {
  'agency-decisions': '/pillars/agency-decisions',
  'ai-workflows': '/pillars/ai-workflows',
  brand: '/pillars/brand',
  creative: '/pillars/creative',
  experiences: '/pillars/experiences',
  marketing: '/pillars/marketing',
  storytelling: '/pillars/storytelling',
  community: '/pillars/community-as-a-service',
};

/** Intent sections. Order is the reading order on a hub page. */
const SECTIONS = [
  {
    id: 'start', heading: 'Start here',
    blurb: 'The overview page for the topic, and the definition if you need the term settled first.',
    suffixes: ['', 'definition', 'strategy-framework', 'framework', 'strategy'],
  },
  {
    id: 'choose', heading: 'Choosing who does the work',
    blurb: 'Comparisons between the options, and the question of whether to hire out at all.',
    suffixes: ['comparison', 'how-to-choose', 'how-to-compare-vendors', 'vs-in-house-team',
      'when-to-hire', 'agency', 'consultant', 'companies', 'services', 'company', 'n-agency'],
  },
  {
    id: 'cost', heading: 'Cost, scope and timeline',
    blurb: 'What it costs, what is in scope, how long it takes, and what returns are realistic.',
    suffixes: ['cost', 'pricing', 'roi-factors', 'scope-of-work', 'deliverables', 'timeline',
      'how-to-avoid-scope-creep', 'what-a-good-engagement-includes'],
  },
  {
    id: 'run', heading: 'How the work actually runs',
    blurb: 'Process, operating model, and the measurement that tells you whether it is working.',
    suffixes: ['process', 'workflow', 'operating-model', 'implementation-guide', 'measurement',
      'how-to-measure-success', 'how-to-build-an-internal-workflow', 'operations'],
  },
  {
    id: 'prepare', heading: 'Templates, checklists and questions to ask',
    blurb: 'The artefacts you can take into a meeting: checklists, briefs, and vendor questions.',
    suffixes: ['checklist', 'template', 'questions-to-ask', 'examples', 'case-pattern',
      'how-to-brief-a-partner', 'what-to-prepare-before-kickoff', 'best-practices'],
  },
  {
    id: 'risk', heading: 'Where it goes wrong',
    blurb: 'Failure patterns, warning signs, and the audit that catches them before they cost money.',
    suffixes: ['red-flags', 'common-failure-points', 'mistakes', 'why-it-fails', 'audit'],
  },
  {
    id: 'who', heading: 'By team and organisation type',
    blurb: 'The same decision, sized for the kind of team making it.',
    suffixes: null, // matched by prefix `for-`
  },
  {
    id: 'outlook', heading: 'What changes in 2026',
    blurb: 'What is worth re-verifying this year, and what stays durable.',
    suffixes: ['2026'],
  },
];
const SECTION_BY_SUFFIX = new Map();
for (const s of SECTIONS) for (const suf of s.suffixes || []) SECTION_BY_SUFFIX.set(suf, s.id);

const ACRONYM = {
  ai: 'AI', rfp: 'RFP', roi: 'ROI', saas: 'SaaS', os: 'OS', b2b: 'B2B',
  faq: 'FAQ', kpi: 'KPI', ceo: 'CEO', vs: 'vs',
};
const deslug = (s) => s.split('-').map((w) => ACRONYM[w] || w).join(' ');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sentenceCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A one-line note under a link. Taken from the target page's own meta
 * description, cut at a sentence end where there is one inside the budget and
 * at a word boundary otherwise - never mid-word, and never at the first colon,
 * which on these pages lands two words in.
 */
function note(description, budget = 150) {
  const d = String(description || '').trim();
  if (!d) return '';
  if (d.length <= budget) return d;
  const stop = d.lastIndexOf('. ', budget);
  if (stop > 60) return d.slice(0, stop + 1);
  const space = d.lastIndexOf(' ', budget);
  return `${d.slice(0, space > 60 ? space : budget).replace(/[,;:]$/, '')}\u2026`;
}

// ---------------------------------------------------------------------------
// Read every programmatic page
// ---------------------------------------------------------------------------

const progFiles = fs.readdirSync(path.join(ROOT, 'programmatic'))
  .filter((n) => n.endsWith('.html')).sort();

function clusterFor(slug, route) {
  const fromRegistry = admissions.get(route)?.cluster;
  if (fromRegistry) return fromRegistry;
  if (EXPLICIT[slug]) return EXPLICIT[slug];
  const m = BY_LENGTH.find((c) => slug === c || slug.startsWith(`${c}-`));
  if (m) return m;
  const wi = BY_LENGTH.find((c) => slug === `what-is-${c}`);
  return wi || null;
}

function suffixFor(slug, cluster) {
  if (slug === cluster) return '';
  if (slug === `what-is-${cluster}`) return 'definition';
  if (slug.startsWith(`${cluster}-`)) return slug.slice(cluster.length + 1);
  return '__other__';
}

function sectionFor(suffix) {
  if (suffix === '__other__') return 'run';
  if (suffix.startsWith('for-')) return 'who';
  if (SECTION_BY_SUFFIX.has(suffix)) return SECTION_BY_SUFFIX.get(suffix);
  // Compound suffixes such as `agency-2026-for-startups` are audience cuts.
  if (suffix.includes('-for-')) return 'who';
  if (/(^|-)2026$/.test(suffix)) return 'outlook';
  return 'run';
}

const pages = [];
for (const name of progFiles) {
  const slug = name.replace(/\.html$/, '');
  const route = `/programmatic/${slug}`;
  const html = fs.readFileSync(path.join(ROOT, 'programmatic', name), 'utf8');
  const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const dm = html.match(/<meta name="description" content="([^"]*)"/);
  const cluster = clusterFor(slug, route);
  if (!cluster) throw new Error(`No cluster for ${route}`);
  const suffix = suffixFor(slug, cluster);
  pages.push({
    slug, route, file: `programmatic/${name}`,
    heading: h1m ? h1m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : slug,
    description: dm ? dm[1] : '',
    cluster,
    pillar: admissions.get(route)?.pillar || EXTRA_CLUSTERS[cluster]?.pillar || null,
    suffix,
    section: sectionFor(suffix),
  });
}

// Cluster records
const clusters = new Map();
for (const p of pages) {
  if (!clusters.has(p.cluster)) clusters.set(p.cluster, { slug: p.cluster, members: [], pillars: {} });
  const c = clusters.get(p.cluster);
  c.members.push(p);
  if (p.pillar) c.pillars[p.pillar] = (c.pillars[p.pillar] || 0) + 1;
}
for (const c of clusters.values()) {
  c.pillar = EXTRA_CLUSTERS[c.slug]?.pillar
    || Object.entries(c.pillars).sort((a, b) => b[1] - a[1])[0]?.[0]
    || 'authority';
  // Every member inherits the cluster's pillar so breadcrumbs are consistent.
  for (const m of c.members) m.pillar = c.pillar;
  const root = c.members.find((m) => m.suffix === '');
  c.label = EXTRA_CLUSTERS[c.slug]?.label
    || admissions.get(root?.route)?.query
    || deslug(c.slug);
  // Order members by section, then alphabetically inside it. The ring below
  // walks this order, so consecutive positions land in different sections.
  const rank = new Map(SECTIONS.map((s, i) => [s.id, i]));
  c.members.sort((a, b) => (rank.get(a.section) - rank.get(b.section)) || a.slug.localeCompare(b.slug));
}

const clusterList = [...clusters.values()].sort((a, b) => a.label.localeCompare(b.label));

// ---------------------------------------------------------------------------
// The other answer surfaces: /answers/ and /query-atlas/ cover the same topics
// in different formats - a short direct answer, and the search phrasings people
// actually type. 18 of those pages were orphaned too. File each one under the
// cluster its slug belongs to so the hub carries all three formats of a topic.
// ---------------------------------------------------------------------------

function relatedSurface(dirName, routePrefix) {
  const dir = path.join(ROOT, dirName);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.html') || name === 'index.html') continue;
    const slug = name.replace(/\.html$/, '');
    const cluster = clusterFor(slug, `${routePrefix}${slug}`)
      || BY_LENGTH.find((c) => c.startsWith(`${slug}-`));
    const c = cluster && clusters.get(cluster);
    if (!c) continue;
    const html = fs.readFileSync(path.join(dir, name), 'utf8');
    const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const tm = html.match(/<title>([\s\S]*?)<\/title>/);
    const heading = (h1m ? h1m[1] : tm ? tm[1].split(' | ')[0] : slug)
      .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    (c.surfaces ||= []).push({ route: `${routePrefix}${slug}`, heading, kind: dirName });
  }
}
relatedSurface('answers', '/answers/');
relatedSurface('query-atlas', '/query-atlas/');

// ---------------------------------------------------------------------------
// Sibling ring
// ---------------------------------------------------------------------------

// Skips chosen coprime-ish to typical cluster sizes so the ring does not close
// into small disconnected sub-rings on a 44- or 54-member cluster. Each skip is
// a fixed offset applied to every member, so each skip is a permutation of the
// cluster: a page gets SIBLING_TARGET siblings out and, in a cluster larger
// than the target, the same number in.
//
// The target was five. It is eight because the measured median for this corpus
// was 12 unique internal links out per page against a standard of 17, and the
// sibling block is the one per-page link surface where more links are more
// useful rather than more noise: every one of them is another page in the same
// cluster, i.e. another framing of the decision the reader is already on.
const SIBLING_TARGET = 8;
const SKIPS = [1, 5, 7, 13, 19, 23, 31, 37];
for (const c of clusters.values()) {
  const n = c.members.length;
  c.members.forEach((m, i) => {
    const seen = new Set([m.route]);
    m.siblings = [];
    for (const s of SKIPS) {
      if (m.siblings.length >= SIBLING_TARGET) break;
      for (let k = 0; k < n; k++) {
        const t = c.members[(i + s + k) % n];
        if (seen.has(t.route)) continue;
        seen.add(t.route);
        m.siblings.push(t);
        break;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Neighbouring topics
// ---------------------------------------------------------------------------
//
// A sibling block only ever points inside one cluster, so a reader who has
// decided this is not their question has nowhere to go but back up. The pillar
// is the taxonomy that already answers "what is next to this" - it is carried
// on every admission record - so each page also gets neighbouring topic hubs
// from its own pillar, each with the one page that opens that topic.
//
// Which neighbours a page gets rotates by its position in the cluster. Three
// thousand pages all pointing at the same three hubs would concentrate every
// cross-topic link on three destinations; rotating spreads it across the
// pillar, and means two pages in one cluster do not read identically.
const NEIGHBOUR_TOPICS = 3;
// Unique internal links out per page. The most-cited property in the estate
// measures at 17; this leaves a link of headroom.
const LINK_TARGET = 18;
// What a generated page already links to before this script adds anything: the
// main-nav entries. The breadcrumb hub, pillar page and siblings are counted
// per page below.
const NAV_ROUTES = ['/', '/topics', '/articles', '/query-atlas', '/how-west-peek-helps'];

const byPillarClusters = new Map();
for (const c of clusterList) {
  if (!byPillarClusters.has(c.pillar)) byPillarClusters.set(c.pillar, []);
  byPillarClusters.get(c.pillar).push(c);
}

/** The page that opens a topic: its overview, else its definition, else first. */
function openerOf(c) {
  return c.members.find((m) => m.suffix === '')
    || c.members.find((m) => m.suffix === 'definition')
    || c.members[0];
}

/**
 * Topics related to `c`, nearest first: everything in its own pillar, then -
 * only where the pillar is too small to fill the list - the closest topics
 * elsewhere, ranked by how many slug tokens they share with it.
 *
 * The token overlap is not a new taxonomy. It reads the slugs the repo already
 * assigned, so `founder-community-strategy` reaches `community-onboarding`
 * and `community-retention` rather than an unrelated topic picked to pad a
 * number. Pillars of six topics exist; without this a two-page cluster in one
 * of them cannot fill a block from real neighbours at all.
 */
const tokensOf = (slug) => new Set(String(slug).split('-').filter((t) => t.length > 2));
function relatedClusters(c, limit) {
  const own = (byPillarClusters.get(c.pillar) || []).filter((o) => o.slug !== c.slug);
  if (own.length >= limit) return own.slice(0, limit);
  const taken = new Set([c.slug, ...own.map((o) => o.slug)]);
  const mine = tokensOf(c.slug);
  const rest = clusterList
    .filter((o) => !taken.has(o.slug))
    .map((o) => ({ o, shared: [...tokensOf(o.slug)].filter((t) => mine.has(t)).length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.o.label.localeCompare(b.o.label))
    .map((x) => x.o);
  return [...own, ...rest].slice(0, limit);
}

for (const c of clusters.values()) {
  const ring = relatedClusters(c, Math.max(NEIGHBOUR_TOPICS * 4, 12));
  c.members.forEach((m, i) => {
    m.neighbours = [];
    if (!ring.length) return;
    // Projected unique link set for this page, so the top-up is measured
    // rather than assumed.
    const projected = new Set([
      ...NAV_ROUTES,
      `/topics/${c.slug}`,
      ...(PILLAR_PAGE[c.pillar] ? [PILLAR_PAGE[c.pillar]] : []),
      ...m.siblings.map((s) => s.route),
    ]);
    projected.delete(m.route);
    for (let k = 0; k < ring.length; k++) {
      if (m.neighbours.length >= NEIGHBOUR_TOPICS && projected.size >= LINK_TARGET) break;
      const o = ring[(i + k) % ring.length];
      const opener = openerOf(o);
      m.neighbours.push({ cluster: o, opener });
      projected.add(`/topics/${o.slug}`);
      if (opener && opener.route !== m.route) projected.add(opener.route);
    }
  });
}

// ---------------------------------------------------------------------------
// Shared page furniture
// ---------------------------------------------------------------------------

const CLARITY = `<script data-clarity-loader>(function(w,d,m){var h=(w.location.hostname||"").toLowerCase().replace(/^www\\./,"");var id=m[h];if(!id)return;w.clarity=w.clarity||function(){(w.clarity.q=w.clarity.q||[]).push(arguments)};var s=d.createElement("script");s.async=1;s.src="https://www.clarity.ms/tag/"+id;var f=d.getElementsByTagName("script")[0];f.parentNode.insertBefore(s,f)})(window,document,{"virtualagency-os.com":"y7l1m6cxec"})</script>`;

const PERSON_NODE = `{"@type":"Person","@id":"https://www.westpeekproductions.com/#scooter-taylor","name":"Scooter Taylor","url":"https://scootertaylor.com/","jobTitle":"Founder","worksFor":{"@id":"https://www.westpeekproductions.com/#organization"},"sameAs":["https://scootertaylor.com/","https://www.linkedin.com/in/scootertaylor/"],"knowsAbout":["virtual event production","hybrid event production","broadcast production","community strategy"]}`;

const ORG_LD = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"West Peek Productions","url":"https://www.westpeekproductions.com/","sameAs":["https://www.westpeekproductions.com/"],"contactPoint":[{"@type":"ContactPoint","contactType":"sales","email":"scooter@westpeek.ventures"}],"email":"scooter@westpeek.ventures"}</script>`;

const SITE_NAV = `<nav class="nav" aria-label="Primary"><a href="/">Home</a><a href="/topics/">Topics</a><a href="/articles">Articles</a><a href="/query-atlas">Query Atlas</a><a href="/how-west-peek-helps">How West Peek helps</a></nav>`;

const SITE_HEADER = `<header><div class="header-inner"><div class="brand"><a href="/">VirtualAgency OS</a><div class="name">by West Peek Productions</div></div>${SITE_NAV}</div></header>`;

const SITE_FOOTER = `<footer><p>VirtualAgency OS is the educational and citation layer for West Peek Productions.</p><p>Commercial inquiries: <a href="mailto:scooter@westpeek.ventures">scooter@westpeek.ventures</a></p></footer>`;

function breadcrumbLd(trail) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: DOMAIN + t.route,
    })),
  });
}

function breadcrumbHtml(trail, currentName) {
  const links = trail.map((t) => `<a href="${t.route}">${esc(t.name)}</a>`).join('<span aria-hidden="true"> / </span>');
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${links}<span aria-hidden="true"> / </span><span aria-current="page">${esc(currentName)}</span></nav>`;
}

function head({ title, description, route, ldGraph, robots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="stylesheet" href="/assets/site.css"><link rel="canonical" href="${DOMAIN}${route}"><meta name="robots" content="${robots}"><script type="application/ld+json">${ldGraph}</script>${ORG_LD}
  <meta name="author" content="Scooter Taylor">
${CLARITY}</head><body>`;
}

const CTA = `<div class="callout" data-content-block="cta_callout"><strong>Next step:</strong> this library is the educational layer. When the work needs an owner, a schedule and a rehearsed fallback, that is what <a href="https://www.westpeekproductions.com/" target="_blank" rel="noopener">West Peek Productions</a> does directly. Commercial enquiries: <a href="mailto:scooter@westpeek.ventures">scooter@westpeek.ventures</a>.</div>`;

// ---------------------------------------------------------------------------
// Hub pages
// ---------------------------------------------------------------------------

function hubHtml(c) {
  const route = `/topics/${c.slug}`;
  const label = c.label;
  const n = c.members.length;
  const pillarLabel = PILLAR_LABEL[c.pillar] || sentenceCase(deslug(c.pillar));
  const present = SECTIONS.filter((s) => c.members.some((m) => m.section === s.id));
  const h1 = `Which ${label} question are you trying to answer?`;
  const description = `A guide to the ${n} ${label} pages in this library: what each one settles, grouped by whether you are choosing a partner, sizing cost and scope, running the work, or checking what usually goes wrong.`;

  const trail = [{ name: 'Home', route: '/' }, { name: 'Topics', route: '/topics/' }];

  const ldGraph = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: `${sentenceCase(label)}`,
        headline: h1,
        description,
        url: DOMAIN + route,
        isPartOf: { '@type': 'CollectionPage', '@id': `${DOMAIN}/topics/` },
        about: { '@type': 'Thing', name: label },
        author: { '@id': 'https://www.westpeekproductions.com/#scooter-taylor' },
        publisher: { '@id': 'https://www.westpeekproductions.com/#organization' },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: n,
          itemListElement: c.members.map((m, i) => ({
            '@type': 'ListItem', position: i + 1, name: m.heading, url: DOMAIN + m.route,
          })),
        },
      },
      JSON.parse(PERSON_NODE),
      JSON.parse(breadcrumbLd([...trail, { name: sentenceCase(label), route }])),
    ],
  });

  const sectionsHtml = present.map((s) => {
    const items = c.members.filter((m) => m.section === s.id);
    const lis = items.map((m) => {
      const summary = note(m.description);
      return `<li><a href="${m.route}">${esc(m.heading)}</a>${summary ? ` <span class="hub-note">${esc(summary)}</span>` : ''}</li>`;
    }).join('');
    return `<section class="hub-section" id="${s.id}"><h2>${esc(s.heading)}</h2><p>${esc(s.blurb)}</p><ul class="hub-list">${lis}</ul></section>`;
  }).join('\n');

  const pillarRoute = PILLAR_PAGE[c.pillar];
  // Twelve, not eight: a two-page cluster cannot carry a hub on its own members
  // alone, and neighbouring topics are the next decision along rather than
  // filler.
  const siblingClusterList = relatedClusters(c, 12);
  const crossPillar = siblingClusterList.some((o) => o.pillar !== c.pillar);
  const siblingClusters = siblingClusterList
    .map((o) => `<li><a href="/topics/${o.slug}">${esc(sentenceCase(o.label))}</a> <span class="hub-note">${o.members.length} pages${o.pillar !== c.pillar ? `, in ${esc(PILLAR_LABEL[o.pillar] || o.pillar)}` : ''}</span></li>`)
    .join('');

  const surfaces = (c.surfaces || []);
  const surfacesHtml = surfaces.length
    ? `<section class="hub-section" id="other-formats"><h2>The same topic in other formats</h2><p>Short direct answers and the search phrasings people actually type, for the same ${esc(label)} question.</p><ul class="hub-list">${surfaces.map((s) => `<li><a href="${s.route}">${esc(s.heading)}</a> <span class="hub-note">${s.kind === 'answers' ? 'direct answer' : 'query atlas entry'}</span></li>`).join('')}</ul></section>`
    : '';

  const answer = `The ${n} pages under ${label} split into ${present.length} decisions, not ${n} separate topics: ${present.map((s) => s.heading.toLowerCase()).join('; ')}. Pick the section that matches the decision in front of you rather than reading in order - each page ends in something observable, so the next one starts from evidence.`;

  return `${head({ title: `${sentenceCase(label)} | VirtualAgency OS`, description, route, ldGraph })}${SITE_HEADER}<div class="container">
<!--link-arch:breadcrumb-->${breadcrumbHtml(trail, sentenceCase(label))}<!--/link-arch:breadcrumb-->
<section class="hero"><h1>${esc(h1)}</h1><p>${esc(description)}</p><div class="meta"><span class="pill">${esc(c.pillar)}</span><span class="pill">${n} pages</span><span class="pill">topic hub</span></div></section><main><article>
<section class="callout recommendation-summary" id="recommendation-summary" data-content-block="recommendation_summary"><h2>Direct answer</h2><p class="recommendation-summary__answer"><strong>${esc(answer)}</strong></p></section>
<h2>What this topic covers</h2><p>${esc(sentenceCase(label))} sits inside the ${esc(pillarLabel)} pillar of this library. ${esc(sentenceCase(label))} is treated here as a decision with an owner and a date attached, not as a subject to read about: every page below names what has to be settled, what evidence the call should rest on, and what the early warning looks like if it is going wrong.</p>
<p>Two people searching the same phrase rarely need the same page. Someone still deciding whether to hire out at all needs a different page from someone with a shortlist and a budget, which is why the ${n} pages are grouped by decision below rather than listed alphabetically.</p>
<h2>How to use this hub</h2><ol><li><strong>Name the decision.</strong> The ${present.length} section headings below are decisions, not subjects. Pick the one that matches where you actually are.</li><li><strong>Read the one page that matches it.</strong> Each page is written to settle one question, so reading three is usually a sign the decision is not yet framed.</li><li><strong>Take the checklist into the meeting.</strong> The templates section holds the artefacts meant to leave this site: briefs, vendor questions, and checklists.</li></ol>
${sectionsHtml}
${surfacesHtml}
${siblingClusters ? `<section class="hub-section" id="related-topics"><h2>Related topics</h2><p>Neighbouring decisions in ${esc(pillarLabel)} that usually come up in the same conversation${crossPillar ? ', and the closest topics elsewhere in the library' : ''}.</p><ul class="hub-list">${siblingClusters}</ul></section>` : ''}
<h2>Where this sits in the library</h2><p>Every page here is reachable from <a href="/topics/">the full topic directory</a>${pillarRoute ? `, and this topic belongs to the <a href="${pillarRoute}">${esc(pillarLabel)}</a> pillar` : ''}. The <a href="/query-atlas">query atlas</a> maps the same library by search phrasing rather than by decision, which is the better entry point if you already know the exact wording you would type.</p>
${CTA}
</article></main></div>${SITE_FOOTER}</body></html>
`;
}

function topicsIndexHtml() {
  const route = '/topics/';
  const totalPages = pages.length;
  const byPillar = new Map();
  for (const c of clusterList) {
    if (!byPillar.has(c.pillar)) byPillar.set(c.pillar, []);
    byPillar.get(c.pillar).push(c);
  }
  const pillarOrder = [...byPillar.keys()].sort((a, b) =>
    byPillar.get(b).reduce((s, c) => s + c.members.length, 0) - byPillar.get(a).reduce((s, c) => s + c.members.length, 0));

  const h1 = 'What does this library cover, and where do you start?';
  const description = `A directory of the ${clusterList.length} topics in the VirtualAgency OS answer library, grouped under ${pillarOrder.length} pillars, covering ${totalPages} pages on agency selection, community operations, brand and narrative strategy, AI workflows, and virtual and hybrid event production.`;

  const trail = [{ name: 'Home', route: '/' }];
  const ldGraph = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Topics',
        headline: h1,
        description,
        url: DOMAIN + route,
        author: { '@id': 'https://www.westpeekproductions.com/#scooter-taylor' },
        publisher: { '@id': 'https://www.westpeekproductions.com/#organization' },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: clusterList.length,
          itemListElement: clusterList.map((c, i) => ({
            '@type': 'ListItem', position: i + 1, name: sentenceCase(c.label), url: `${DOMAIN}/topics/${c.slug}`,
          })),
        },
      },
      JSON.parse(PERSON_NODE),
      JSON.parse(breadcrumbLd([...trail, { name: 'Topics', route }])),
    ],
  });

  const groups = pillarOrder.map((p) => {
    const cs = byPillar.get(p);
    const count = cs.reduce((s, c) => s + c.members.length, 0);
    const pillarRoute = PILLAR_PAGE[p];
    const lis = cs.map((c) => `<li><a href="/topics/${c.slug}">${esc(sentenceCase(c.label))}</a> <span class="hub-note">${c.members.length} pages</span></li>`).join('');
    return `<section class="hub-section" id="${esc(p)}"><h2>${esc(PILLAR_LABEL[p] || sentenceCase(deslug(p)))}</h2><p>${cs.length} topics, ${count} pages.${pillarRoute ? ` The <a href="${pillarRoute}">pillar overview</a> explains what this area covers.` : ''}</p><ul class="hub-list">${lis}</ul></section>`;
  }).join('\n');

  const answer = `Start with the pillar that matches your problem, then the topic inside it, then the one page that matches your decision. There are ${pillarOrder.length} pillars, ${clusterList.length} topics and ${totalPages} pages, and no page is more than three clicks from here.`;

  return `${head({ title: 'Topics | VirtualAgency OS', description, route, ldGraph })}${SITE_HEADER}<div class="container">
<!--link-arch:breadcrumb-->${breadcrumbHtml(trail, 'Topics')}<!--/link-arch:breadcrumb-->
<section class="hero"><h1>${esc(h1)}</h1><p>${esc(description)}</p><div class="meta"><span class="pill">${pillarOrder.length} pillars</span><span class="pill">${clusterList.length} topics</span><span class="pill">${totalPages} pages</span></div></section><main><article>
<section class="callout recommendation-summary" id="recommendation-summary" data-content-block="recommendation_summary"><h2>Direct answer</h2><p class="recommendation-summary__answer"><strong>${esc(answer)}</strong></p></section>
<h2>How the library is organised</h2><p>VirtualAgency OS is the educational layer published by West Peek Productions. It answers the operating questions that come up before and during agency, community, brand and production work: what to decide, in what order, who owns it, and what evidence the decision should rest on.</p>
<p>Three levels, and only three. A <strong>pillar</strong> is an area of work. A <strong>topic</strong> is one decision inside it, with every page that bears on that decision collected in one place. A <strong>page</strong> settles one question and ends in something you can observe. If you already know the exact phrase you would type into a search box, <a href="/query-atlas">the query atlas</a> indexes the same library that way instead.</p>
<h2>Other ways in</h2><ul><li><a href="/articles">Articles</a> - longer written pieces rather than reference pages.</li><li><a href="/insights/">Insights</a> - the working notes behind the frameworks.</li><li><a href="/answers/">Answers</a> - short direct answers to single questions.</li><li><a href="/learn/">Learn</a> - the sequenced explainers for community operations.</li><li><a href="/pillars/">Pillars</a> - the nine top-level areas, each with its own overview.</li><li><a href="/glossary">Glossary</a> - the terms used across the library, defined once.</li><li><a href="/case-studies/">Case studies</a> - production work with the constraints named.</li><li><a href="/ai-human-os">AI and human operating systems</a> and <a href="/ai-helps-breaks">where AI helps and where it breaks trust</a> - the position underneath the AI workflow pages.</li></ul>
${groups}
${CTA}
</article></main></div>${SITE_FOOTER}</body></html>
`;
}

// ---------------------------------------------------------------------------
// Injection into existing pages
// ---------------------------------------------------------------------------

/**
 * Remove a previously injected region, including the whitespace inserted with
 * it. Leaving the trailing newline behind makes the script non-idempotent: the
 * blank line accumulates on every run, the file hash changes, and the frozen
 * output guard reports drift on 3,020 pages that did not actually change.
 */
function stripRegion(html, name) {
  const re = new RegExp(`\\n?<!--link-arch:${name}-->[\\s\\S]*?<!--/link-arch:${name}-->\\n?`, 'g');
  return html.replace(re, '');
}

/** Add one main-nav entry to /topics/ in the first <nav> of a page. */
function addTopicsNav(html) {
  if (/<a href="\/topics\/">/.test(html)) return html;
  const m = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/);
  if (!m) return html;
  const nav = m[0];
  if (!/<a\s/.test(nav)) return html;
  // Insert after the Home link where there is one, otherwise before </nav>.
  const homeRe = /(<a[^>]*href="\/"[^>]*>[\s\S]*?<\/a>)/;
  const updated = homeRe.test(nav)
    ? nav.replace(homeRe, '$1<a href="/topics/">Topics</a>')
    : nav.replace(/<\/nav>$/, '<a href="/topics/">Topics</a></nav>');
  return html.replace(nav, updated);
}

function injectProgrammatic(page) {
  const abs = path.join(ROOT, page.file);
  let html = fs.readFileSync(abs, 'utf8');
  const before = html;

  html = stripRegion(html, 'breadcrumb');
  html = stripRegion(html, 'related');
  html = stripRegion(html, 'neighbours');
  html = addTopicsNav(html);

  const c = clusters.get(page.cluster);
  const pillarRoute = PILLAR_PAGE[c.pillar];
  const trail = [
    { name: 'Home', route: '/' },
    { name: 'Topics', route: '/topics/' },
    { name: sentenceCase(c.label), route: `/topics/${c.slug}` },
  ];
  const crumbName = page.heading.length > 70 ? `${sentenceCase(deslug(page.slug))}` : page.heading;
  const crumb = `\n<!--link-arch:breadcrumb--><nav class="breadcrumb" aria-label="Breadcrumb">${trail.map((t) => `<a href="${t.route}">${esc(t.name)}</a>`).join('<span aria-hidden="true"> / </span>')}<span aria-hidden="true"> / </span><span aria-current="page">${esc(crumbName)}</span></nav><script type="application/ld+json">${breadcrumbLd([...trail, { name: crumbName, route: page.route }])}</script><!--/link-arch:breadcrumb-->`;

  // Before the <article> - after any hero, inside the page's own container.
  const artIdx = html.indexOf('<article');
  if (artIdx < 0) throw new Error(`no <article> in ${page.file}`);
  const heroIdx = html.indexOf('<section class="hero">');
  let insertAt;
  if (heroIdx >= 0 && heroIdx < artIdx) {
    insertAt = heroIdx;
  } else {
    insertAt = artIdx;
  }
  html = html.slice(0, insertAt) + crumb.trimStart() + html.slice(insertAt);

  const sibs = page.siblings.map((s) => {
    const summary = note(s.description, 120);
    return `<li><a href="${s.route}">${esc(s.heading)}</a>${summary ? ` <span class="hub-note">${esc(summary)}</span>` : ''}</li>`;
  }).join('');

  const related = `\n<!--link-arch:related--><section class="related-links" data-related="true"><h2>Related ${esc(c.label)} decisions</h2><p>Other pages in this topic that usually come up in the same conversation. The full set is on the <a href="/topics/${c.slug}">${esc(sentenceCase(c.label))} hub</a>${pillarRoute ? `, under <a href="${pillarRoute}">${esc(PILLAR_LABEL[c.pillar] || c.pillar)}</a>` : ''}.</p><ul class="hub-list">${sibs}</ul></section><!--/link-arch:related-->`;

  const closeIdx = html.lastIndexOf('</article>');
  html = html.slice(0, closeIdx) + related + '\n' + html.slice(closeIdx);

  // Neighbouring topics: where to go when this is not the reader's question.
  const nbrs = (page.neighbours || []).filter((n) => n.opener && n.opener.route !== page.route);
  if (nbrs.length) {
    const pillarLabel = PILLAR_LABEL[c.pillar] || sentenceCase(deslug(c.pillar));
    const lis = nbrs.map((n) => `<li><a href="/topics/${n.cluster.slug}">${esc(sentenceCase(n.cluster.label))}</a> <span class="hub-note">${n.cluster.members.length} pages, opening with <a href="${n.opener.route}">${esc(n.opener.heading)}</a></span></li>`).join('');
    const neighbours = `\n<!--link-arch:neighbours--><section class="related-links" data-related="neighbours"><h2>If this is not the decision in front of you</h2><p>Neighbouring topics in ${esc(pillarLabel)}, each with the page that opens it. ${pillarRoute ? `The <a href="${pillarRoute}">pillar overview</a> lists them all` : `<a href="/topics/">The topic directory</a> lists them all`}.</p><ul class="hub-list">${lis}</ul></section><!--/link-arch:neighbours-->`;
    const closeNbr = html.lastIndexOf('</article>');
    html = html.slice(0, closeNbr) + neighbours + '\n' + html.slice(closeNbr);
  }

  return { abs, html, changed: html !== before, route: page.route };
}

// ---------------------------------------------------------------------------
// Site-wide nav + pillar wiring
// ---------------------------------------------------------------------------

const SITE_SKIP = new Set(['.git', '.github', '.pages-output', '.build', '.clarity', 'node_modules',
  'logs', 'artifacts', 'reports', 'docs', 'scripts', 'distribution_scripts', 'data', 'content',
  'releases', 'seo', 'admin', 'topics', 'programmatic']);

function siteFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SITE_SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) siteFiles(full, out);
    else if (e.name.endsWith('.html') && e.name !== '404.html') out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}

/** Pillar hubs currently list no member pages. Give each one its topic hubs. */
function injectPillar(rel, pillarKey) {
  const abs = path.join(ROOT, rel);
  let html = fs.readFileSync(abs, 'utf8');
  const before = html;
  html = stripRegion(html, 'pillar-topics');
  html = addTopicsNav(html);

  const cs = clusterList.filter((c) => c.pillar === pillarKey);
  if (!cs.length) {
    if (html !== before) fs.writeFileSync(abs, html);
    return { rel, changed: html !== before, count: 0 };
  }
  const total = cs.reduce((s, c) => s + c.members.length, 0);
  const lis = cs.map((c) => {
    const root = c.members.find((m) => m.suffix === '') || c.members[0];
    return `<li><a href="/topics/${c.slug}">${esc(sentenceCase(c.label))}</a> <span class="hub-note">${c.members.length} pages, starting with &ldquo;${esc(root.heading)}&rdquo;</span></li>`;
  }).join('');
  const block = `\n<!--link-arch:pillar-topics--><section class="hub-section" id="topics"><h2>Topics in this pillar</h2><p>${cs.length} topics, ${total} pages. Each topic hub groups its pages by the decision they settle rather than listing them alphabetically. <a href="/topics/">All topics across the library</a>.</p><ul class="hub-list">${lis}</ul></section><!--/link-arch:pillar-topics-->`;

  const close = html.lastIndexOf('</main>');
  if (close < 0) throw new Error(`no </main> in ${rel}`);
  html = html.slice(0, close) + block + '\n' + html.slice(close);
  if (html !== before) fs.writeFileSync(abs, html);
  return { rel, changed: html !== before, count: cs.length };
}

// ---------------------------------------------------------------------------
// The rest of the library
// ---------------------------------------------------------------------------
//
// /programmatic/ is 3,052 of 3,313 pages, so it dominated the first pass. The
// remaining 261 kept whatever their own generators gave them: 169 of them
// carry no BreadcrumbList at all, and /query-atlas/ sits at a median of 7
// unique internal links out against a corpus median of 12.
//
// Those pages are not a separate site. An /answers/ page and a /query-atlas/
// page are the same topic in a different format - the hub generator already
// files both under a cluster, in `c.surfaces` - so the same taxonomy places
// them. Where a page belongs to no cluster (an insight, a case study, a pillar
// overview) the directory it already ships in is the taxonomy.
//
// Nothing here invents a grouping: a page is filed by the cluster the repo
// already assigns it, or by the directory it already ships in.

const SITE_SECTION = {
  answers: { name: 'Answers', index: '/answers/', kind: 'the short direct answer' },
  'query-atlas': { name: 'Query atlas', index: '/query-atlas', kind: 'the query atlas entry' },
  insights: { name: 'Insights', index: '/insights/', kind: 'a working note' },
  learn: { name: 'Learn', index: '/learn/', kind: 'a sequenced explainer' },
  pillars: { name: 'Pillars', index: '/pillars/', kind: 'a pillar overview' },
  'case-studies': { name: 'Case studies', index: '/case-studies/', kind: 'a case study' },
};
// Directories whose pages are hubs in their own right, not one format of a
// topic. Filing a pillar overview under a single cluster would be wrong: it
// sits above several of them.
const SITE_NO_CLUSTER_DIRS = new Set(['pillars']);
// The block is sized to the page rather than fixed. A page already carrying 20
// internal links does not need twelve more bolted on to satisfy a target, and a
// /query-atlas/ entry sitting at 7 needs more than a fixed five. So a page at
// or above LINK_TARGET gets no block at all; a page below it lists at least
// SITE_RELATED_MIN and then only enough to reach the target, capped at
// SITE_RELATED_MAX so no page turns into a list of links.
const SITE_RELATED_MIN = 5;
const SITE_RELATED_MAX = 14;
// /admin is an internal console, not part of the reader-facing graph: it is the
// one page the link report deliberately leaves orphaned, and it stays that way.
// siteFiles() already skips it, along with 404.html.

const normRoute = (r) => (r === '/' ? '/' : String(r).replace(/\/+$/, ''));
const textOf = (v) => String(v || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function pageMeta(rel) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const h1 = textOf((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  const title = textOf((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').split(' | ')[0];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const parts = rel.split('/');
  const dirIndex = parts[parts.length - 1] === 'index.html';
  const route = dirIndex ? `/${parts.slice(0, -1).join('/')}/` : `/${rel.replace(/\.html$/, '')}`;
  const dir = parts.length > 1 ? parts[0] : '';
  // A directory index one level down (pillars/community-as-a-service/) is a
  // page in its own right; a section index (answers/) is the section itself.
  const isSectionIndex = dirIndex && parts.length === 2;
  const slug = dirIndex ? (parts[parts.length - 2] || 'index') : path.basename(rel, '.html');
  return {
    rel, route: normRoute(route), dir, slug, isSectionIndex,
    heading: h1 || title || slug, description: desc,
  };
}

/** Collect the non-programmatic, non-hub pages and file each one. */
function collectSitePages() {
  const metas = siteFiles().map(pageMeta);
  for (const m of metas) {
    if (m.isSectionIndex || SITE_NO_CLUSTER_DIRS.has(m.dir)) continue;
    const cluster = clusterFor(m.slug, m.route) || BY_LENGTH.find((c) => c.startsWith(`${m.slug}-`));
    m.cluster = (cluster && clusters.get(cluster)) || null;
  }
  return metas;
}

function crumbRegion(trail, currentName, route) {
  return `<!--link-arch:breadcrumb-->${breadcrumbHtml(trail, currentName)}<script type="application/ld+json">${breadcrumbLd([...trail, { name: currentName, route }])}</script><!--/link-arch:breadcrumb-->`;
}

function linkItem(t, noteText) {
  const summary = noteText === undefined ? note(t.description, 120) : noteText;
  return `<li><a href="${t.route}">${esc(t.heading)}</a>${summary ? ` <span class="hub-note">${esc(summary)}</span>` : ''}</li>`;
}

/**
 * Candidates for a page that belongs to no cluster: its neighbours in the
 * directory it already ships in, taken in a rotating window so a section does
 * not collapse into every page listing the same few, then the pillar
 * overviews - the library's own published entry points, not an invented list -
 * for sections too small to fill a block and for root pages with no section.
 */
function sectionCandidates(m, all) {
  const pool = all.filter((o) => o.dir === m.dir && o.dir !== '' && !o.isSectionIndex
    && o.route !== m.route && !o.cluster);
  const out = [];
  const start = Math.max(0, pool.findIndex((o) => o.slug > m.slug));
  for (let k = 0; k < pool.length; k++) out.push({ page: pool[(start + k) % pool.length] });
  const seen = new Set([m.route, ...out.map((x) => x.page.route)]);
  for (const route of Object.values(PILLAR_PAGE)) {
    const q = all.find((o) => o.route === normRoute(route));
    if (!q || seen.has(q.route)) continue;
    seen.add(q.route);
    out.push({ page: q, why: 'pillar overview' });
  }
  return out;
}

/**
 * The unique internal routes a page already links to, resolved the way
 * scripts/link_graph_report.js resolves them. Links in this repo are
 * root-relative clean URLs; `.html` and `/index.html` suffixes and trailing
 * slashes are folded so `/topics/`, `/topics` and `/topics.html` count once.
 * Measuring rather than assuming is the point: the same block is under target
 * on a /query-atlas/ entry and padding on an /insights/ note.
 */
function uniqueInternalRoutes(html, selfRoute) {
  const out = new Set();
  const re = /<a\b[^>]*?href=["']([^"']+)["']/gi;
  let mm;
  while ((mm = re.exec(html))) {
    let href = mm[1];
    const absolute = href.match(/^https?:\/\/(?:www\.)?virtualagency-os\.com(\/[^\s"']*)?$/i);
    if (absolute) href = absolute[1] || '/';
    else if (/^(https?:|mailto:|tel:|javascript:|data:|#|\/\/)/i.test(href)) continue;
    if (!href.startsWith('/')) continue;
    let r = href.split('#')[0].split('?')[0];
    r = normRoute(r.replace(/\/index\.html$/, '/').replace(/\.html$/, ''));
    if (!r || r === normRoute(selfRoute)) continue;
    out.add(r);
  }
  return out;
}

function injectSitePage(m, all) {
  const abs = path.join(ROOT, m.rel);
  let html = fs.readFileSync(abs, 'utf8');
  const before = html;
  html = stripRegion(html, 'breadcrumb');
  html = stripRegion(html, 'site-related');
  html = addTopicsNav(html);

  const section = SITE_SECTION[m.dir];
  const crumbName = m.heading.length > 70 ? sentenceCase(deslug(m.slug)) : m.heading;

  // --- Breadcrumb. A page that already ships its own BreadcrumbList keeps it.
  if (!/"@type"\s*:\s*"BreadcrumbList"/.test(html)) {
    const trail = [{ name: 'Home', route: '/' }];
    if (m.cluster) {
      // The hub links down to this page in its "same topic in other formats"
      // section, so hub -> page is a real parent-child edge, not a fiction.
      trail.push({ name: 'Topics', route: '/topics/' });
      trail.push({ name: sentenceCase(m.cluster.label), route: `/topics/${m.cluster.slug}` });
    } else if (section && !m.isSectionIndex) {
      trail.push({ name: section.name, route: section.index });
    }
    const mainIdx = html.search(/<main\b/);
    if (mainIdx < 0) throw new Error(`no <main> in ${m.rel}`);
    html = `${html.slice(0, mainIdx)}${crumbRegion(trail, crumbName, m.route)}${html.slice(mainIdx)}`;
  }

  // --- Related links, sized to what the page is short of.
  const have = uniqueInternalRoutes(html, m.route);
  let block = '';
  const takeUntilTarget = (candidates) => {
    // A page already at the standard gets nothing: a section index that lists
    // its own children, an /insights/ note with a full nav, /atlas with 85
    // links. Adding a block there would be filler.
    if (have.size >= LINK_TARGET) return [];
    const picks = [];
    for (const cand of candidates) {
      const route = normRoute(cand.page.route);
      if (route === m.route || have.has(route)) continue;
      if (picks.length >= SITE_RELATED_MIN && have.size >= LINK_TARGET) break;
      if (picks.length >= SITE_RELATED_MAX) break;
      picks.push(cand);
      have.add(route);
    }
    return picks;
  };

  if (m.cluster) {
    const c = m.cluster;
    const span = Math.max(1, c.members.length);
    const idx = Math.abs([...m.slug].reduce((h, ch) => ((h * 31 + ch.charCodeAt(0)) | 0), 7)) % span;
    const ordered = [];
    for (let k = 0; k < c.members.length; k++) ordered.push({ page: c.members[(idx + k * 5) % c.members.length] });
    for (const su of c.surfaces || []) {
      ordered.push({ page: su, why: su.kind === 'answers' ? 'direct answer' : 'query atlas entry' });
    }
    // A cluster of two members cannot fill a block on its own. Its pillar can:
    // the neighbouring topics are the next decision along, and each opener is a
    // page the library already publishes.
    for (const o of relatedClusters(c, 12)) {
      ordered.push({
        page: { route: `/topics/${o.slug}`, heading: sentenceCase(o.label), description: '' },
        why: `${o.members.length} pages on this topic`,
      });
      const opener = openerOf(o);
      if (opener) ordered.push({ page: opener, why: `opens ${sentenceCase(o.label)}` });
    }
    const picks = takeUntilTarget(ordered);
    if (picks.length) {
      const pillarRoute = PILLAR_PAGE[c.pillar];
      const lis = picks.map((x) => linkItem(x.page, x.why)).join('');
      block = `<!--link-arch:site-related--><section class="related-links" data-related="cluster"><h2>The rest of the ${esc(c.label)} coverage</h2><p>This page is ${esc(section ? section.kind : 'one format')} on ${esc(c.label)}. The <a href="/topics/${c.slug}">${esc(sentenceCase(c.label))} hub</a> holds all ${c.members.length} pages on it${pillarRoute ? `, inside the <a href="${pillarRoute}">${esc(PILLAR_LABEL[c.pillar] || c.pillar)}</a> pillar` : ''}.</p><ul class="hub-list">${lis}</ul></section><!--/link-arch:site-related-->`;
    }
  } else {
    const picks = takeUntilTarget(sectionCandidates(m, all));
    if (picks.length) {
      const lis = picks.map((x) => linkItem(x.page, x.why)).join('');
      const inSection = picks.some((x) => !x.why);
      const where = section && inSection
        ? `Other pages in <a href="${section.index}">${esc(section.name)}</a>, and the pillar overviews that place them.`
        : 'The pillar overviews: the top-level areas this library covers, each with its own topics underneath.';
      block = `<!--link-arch:site-related--><section class="related-links" data-related="section"><h2>Where to go next</h2><p>${where} <a href="/topics/">The topic directory</a> indexes the whole library by the decision each page settles.</p><ul class="hub-list">${lis}</ul></section><!--/link-arch:site-related-->`;
    }
  }

  if (block) {
    const mainClose = html.lastIndexOf('</main>');
    const artClose = html.lastIndexOf('</article>');
    const at = artClose > 0 && artClose < mainClose ? artClose : mainClose;
    if (at < 0) throw new Error(`no </main> in ${m.rel}`);
    html = `${html.slice(0, at)}\n${block}\n${html.slice(at)}`;
  }

  return { abs, html, changed: html !== before, route: m.route };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const touchedRoutes = new Set();

if (PLAN_ONLY) {
  console.log(`clusters: ${clusterList.length}`);
  for (const c of clusterList) {
    const secs = SECTIONS.filter((s) => c.members.some((m) => m.section === s.id)).length;
    console.log(`  ${String(c.members.length).padStart(4)}  ${c.pillar.padEnd(17)} ${c.slug.padEnd(42)} ${secs} sections  "${c.label}"`);
  }
  const other = pages.filter((p) => p.suffix === '__other__');
  console.log(`pages: ${pages.length}; unmatched suffix: ${other.length}`);
  process.exit(0);
}

// 1. Hubs
fs.mkdirSync(TOPICS_DIR, { recursive: true });
if (!SCOPE_ONLY) {
  fs.writeFileSync(path.join(TOPICS_DIR, 'index.html'), topicsIndexHtml());
  for (const c of clusterList) fs.writeFileSync(path.join(TOPICS_DIR, `${c.slug}.html`), hubHtml(c));
}
touchedRoutes.add('/topics/');
for (const c of clusterList) touchedRoutes.add(`/topics/${c.slug}`);

// 2. Programmatic pages
let progChanged = 0;
for (const p of pages) {
  touchedRoutes.add(p.route);
  if (SCOPE_ONLY) continue;
  const r = injectProgrammatic(p);
  if (r.changed) { fs.writeFileSync(r.abs, r.html); progChanged += 1; }
}

// 3. Pillar hubs
const pillarResults = [];
for (const [pillarKey, route] of Object.entries(PILLAR_PAGE)) {
  const rel = fs.existsSync(path.join(ROOT, `${route.slice(1)}.html`))
    ? `${route.slice(1)}.html`
    : `${route.slice(1)}/index.html`;
  if (!fs.existsSync(path.join(ROOT, rel))) continue;
  touchedRoutes.add(route);
  if (!SCOPE_ONLY) pillarResults.push(injectPillar(rel, pillarKey));
}

// 4. Everything that is neither a generated page nor a hub: breadcrumbs, and
//    related links drawn from the cluster the page belongs to or the section
//    it ships in.
const sitePages = collectSitePages();
let siteChanged = 0;
let siteClusterFiled = 0;
for (const m of sitePages) {
  touchedRoutes.add(m.route);
  if (m.cluster) siteClusterFiled += 1;
  if (SCOPE_ONLY) continue;
  const r = injectSitePage(m, sitePages);
  if (r.changed) { fs.writeFileSync(r.abs, r.html); siteChanged += 1; }
}

// 5. One main-nav entry site-wide
let navChanged = 0;
for (const rel of siteFiles()) {
  const abs = path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const next = addTopicsNav(html);
  const route = rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel.replace(/\.html$/, '')}`;
  // Scope covers every page this architecture owns a link on, whether or not
  // this particular run was the one that put it there. Scoping only what
  // changed on the current run would leave already-edited frozen routes
  // outside the transaction and fail the freeze.
  if (/<a href="\/topics\/">/.test(next)) touchedRoutes.add(route.replace(/(.)\/$/, '$1'));
  if (next !== html) {
    if (!SCOPE_ONLY) { fs.writeFileSync(abs, next); navChanged += 1; }
  }
}

// 6. Mutation scope, so the freeze transaction accepts exactly these routes.
const norm = (r) => (r === '/' ? '/' : r.replace(/\/+$/, ''));
const routes = [...new Set([...touchedRoutes].map(norm))].sort();
if (WRITE_SCOPE) fs.writeFileSync(SCOPE_FILE, `${JSON.stringify({
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  source: 'scripts/build_link_architecture.js',
  reason: 'Internal link architecture: topic hubs, breadcrumbs, sibling links, neighbouring-topic links, section related links, one main-nav entry.',
  routes,
}, null, 2)}\n`);

console.log(JSON.stringify({
  clusters: clusterList.length,
  hub_pages_written: SCOPE_ONLY ? 0 : clusterList.length + 1,
  programmatic_pages_updated: progChanged,
  pillar_hubs_updated: pillarResults.filter((r) => r.changed).length,
  nav_entries_added: navChanged,
  site_pages_total: sitePages.length,
  site_pages_updated: siteChanged,
  site_pages_filed_under_a_cluster: siteClusterFiled,
  mutation_scope_routes: routes.length,
}, null, 2));
