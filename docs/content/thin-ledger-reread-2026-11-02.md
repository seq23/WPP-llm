# Thin-ledger re-read, 2 Nov 2026

Supersedes the 25 Oct 2026 portfolio check's NOT ENOUGH DATA call on the
192-page thin ledger (`data/seo/consolidation_candidates.json`, built by
`scripts/build_measured_targets.js`: a sitemap page with zero measured Search
Console impressions and fewer than 700 body words, folding into a hub - "a
list, not an action").

## 1. The re-read

The data gate from 25 Oct is clear. `data/search_intelligence/index_coverage.json`
showed 97 of the 192 pages had never been inspected on 25 Oct; the URL
Inspection rotation (150/day, 8 parallel, 16-day cycle) has since finished.

**192 -> 160.** Ledger history on `data/seo/consolidation_candidates.json`:
25 Oct (`a0c5cb074`) `candidate_count: 192` against a 2,721-URL sitemap.
2 Nov, before this change (`38cd3aa84`), `candidate_count: 160` against a
2,300-URL sitemap - 37 pages left the list (mostly `/programmatic/community-*`
and `/programmatic/marketing-strategy-consulting-*`, removed by the 26 Oct
duplicate consolidation), 5 joined it.

Word counts on the 160, before this change: 3 pages under 300 words, 25 at
300-499, 132 at 500-699.

## 2. Three confirmed defects at source

**Defect A - the repair queue blocked 64 of 65 daily units.**
`data/releases/daily_release_plan.json` recorded `release_units: 1`,
`blocked: 64`, every one `quality_repair_missing_opportunity_metadata`.
`scripts/citation_intelligence/build_release_plan.js`'s repair loop refused a
thin `/programmatic/` page unless `data/opportunities/aeo_geo_opportunities.json`
held a record naming its query - even though the quality report's own row for
that same route (`content_quality.js` `metadataIndex()`, reading the same
opportunity/admission sources) already carried `query`, `cluster`, `pillar`
and `page_family`. **Fix**: when the opportunity lookup has no query, the
repair unit falls back to the quality row's own metadata
(`metadata_source: "quality_report_row"`); it is blocked only when that row
itself names no query. `issue.cluster` is passed through only when it is a
real cluster label, not the page's own route repeated back (the degenerate
default `content_quality.js` uses when no record names a cluster) - passing
that through unchanged would have written a route-shaped "cluster" into the
admission registry and broken `build_link_architecture.js`'s hub-slug
generation.

Proven negatively: with the fallback disabled, `validate:thin-repair-reachable`
failed red on 51 blocked routes whose own quality row already carried a query;
restored, it passes.

**Defect B - the substance gate could not see 74 of the 160 thin pages.**
`content_quality.js`'s `listProgrammaticPages()` was a flat
`readdirSync('programmatic/')`. 74 of the 160 still-thin pages lived outside
`/programmatic/` - `/answers/` 28, `/insights/` 27, `/learn/` 12,
`/case-studies/` 3, plus the four voice pages below - and had no substance row,
no thin flag and no repair-owner anywhere. **Fix**: `listProgrammaticPages()`
is now `listGovernedPages()`, reading every section declared in
`data/content/governed_page_sections.json` (programmatic, answers, insights,
learn, case-studies - each with its own word floor and a declared repair
owner, never a path heuristic). The repair-staging lane in
`build_release_plan.js` still only renders `/programmatic/` units (the only
section `render_programmatic_page.js` and `apply_release_plan.js` know how to
write); the other four sections' pages now get a substance row, a thin flag
and a named repair owner, and their re-render is deferred (section 4).

Proven negatively: with `/learn/` removed from
`governed_page_sections.json`, `validate:substance-scan-covers-sitemap` failed
red ("missing declared section(s): /learn/"); restored, it passes.

**Defect C - two word counters disagreeing by ~10-20 words near the floor.**
The ledger (`build_measured_targets.js`) isolated `<main>`/`<body>` before
counting; the substance gate (`content_quality.js`) counted the whole
document. They disagreed on pages near 700 words, so a page could be thin on
one count and clean on the other. **Fix**: one counter,
`scripts/lib/word_count.js`, used by both. The substance gate's rule wins (it
is the one already driving real repairs): the ledger now matches it rather
than the reverse.

## 3. What changed, measured

Before this change (today, pre-fix): 160 thin-ledger candidates; the
programmatic quality gate's repair lane: `release_units: 1`, `blocked: 64`
(all `quality_repair_missing_opportunity_metadata`).

After the three fixes, in this change, run against the live corpus:

- `npm run release:plan`: `release_units: 52`, `blocked: 18` - every one of
  the 18 confirmed (by direct query) to have no query anywhere, including its
  own quality row; 51 of the 52 repair units sourced their metadata through
  the new fallback (`metadata_source: "quality_report_row"`), 1 through an
  opportunity record.
- `npm run release:content`: 52 pages substantively repaired, 0 skipped, 0
  quality-rejected. Sample: `/programmatic/community-roi-measurement-model`
  686 -> 1,110 words; `/programmatic/community-governance-escalation-matrix`
  -> 1,147 words. Every repaired page is now >=1,100 words, well clear of the
  700-word floor.
- `npm run content:quality:report`: thin pages (across every governed
  section) 142 -> 90 after the 52 repairs landed.
- `npm run seo:measured-targets` (the consolidation ledger, now on the shared
  word counter, after the repairs): candidate_count 160 -> 87.
- `npm run validate:thin-repair-reachable` and
  `npm run validate:substance-scan-covers-sitemap`: both pass; both proven
  negatively (section 2).

## 4. What is deliberately not in this change

- **No redirects and no page removals.** 45 of the original 160 are "Duplicate,
  Google chose different canonical" - already folded by Google. Consolidating
  them with 301s is the duplicate-family lane's job (25 Oct Brief 4), measured
  separately.
- **The 2 pages unknown to Google** are a discovery problem, not a thinness
  problem. No repair attempted.
- **The 74 non-`/programmatic/` pages are made visible and queued, not
  auto-rewritten.** `render_programmatic_page.js` is not their generator;
  `/answers/`, `/insights/`, `/learn/` and `/case-studies/` have none in this
  repo today (confirmed: `git log --diff-filter=A` on each shows baseline-ZIP
  imports, except `/insights/`, which `scripts/build_insights.js` publishes
  daily but does not yet re-render an existing thin one). Each section's
  `governed_page_sections.json` entry declares `repair_owner:
  "none_yet:deferred_2026-11-16"` and a reason. Re-render through each
  section's own generator is deferred:

  `Deferred to 2026-11-16: re-render the 74 thin pages outside /programmatic/
  through their own section generators (answers, insights, learn,
  case-studies), using the repair owners data/content/governed_page_sections.json
  declares.`

## 5. The four voice pages - exempted, not thin

`/about` (474 words, already declared structural), `/ai-human-os` (509),
`/ai-helps-breaks` (617) and `/glossary` (432) are the site's own stated
identity and point of view, not topic pages. Per the owner's approval
(2 Nov 2026, recommended default accepted), all four are declared in
`data/content/structural_pages.json` with a reason each and exempted from the
700-word substance floor. They are not scanned by `listGovernedPages()` (they
are not under any directory `governed_page_sections.json` declares) and
nothing machine-written was added to any of them.

## 6. Measurement and the floor, going forward

- **Today, recorded**: thin-ledger candidates 160 -> 87; programmatic thin
  pages 142 -> 90; repair-lane blocked rows 64 -> 18 (0 of the 18 have a query
  anywhere); 74 non-programmatic thin pages now visible with a declared
  repair owner, 0 re-rendered (deferred 2026-11-16).
- **Day 14 (16 Nov)**: thin pages flagged by the gate (now across all
  sections) continuing to fall as the daily repair lane runs inside its
  ceiling of 100; zero pages blocked for missing metadata that their own
  quality row carries.
- **Day 30 (2 Dec)**: the ledger's `candidate_count` under the 87 this change
  reached, and the indexed share of the repaired routes
  (`data/search_intelligence/index_coverage.json`) holding or rising.
- **Fallback if it misses**: if receipts accumulate but `candidate_count`
  does not keep falling, the 700-word floor is not what Google is judging,
  and the next step is the duplicate-consolidation lane and internal links to
  the thin hubs, not more words.
