# Demand reality check — are we targeting queries people actually make?

**Status:** pre-Phase-6 gate analysis. Read-only audit; no page, generator, template or config was
modified. **Date of analysis:** 2026-08-26.
**Scope:** every repo under `/Users/sequoiataylor/GitHub` that carries a query atlas or evidence file.

Every number below is read off a file in the repo, computed from one, or measured live and
attributed. Where a number is not measured anywhere it is marked so, rather than estimated. No
search volume, difficulty score or competition figure in this document was invented.

---

## The headline number

**Roughly 1–2% of published pages target a query with measured demand.**

| Property | Deployed pages | Queries with measured demand | Pages targeting a measured query | Ratio |
|---|---|---|---|---|
| WPP-llm (`virtualagency-os.com`) | 3,052 programmatic (6,434 HTML total) | 521 GSC | 45 (exact stored-`query` match) | **1.5%** |
| sprylabs-hpc-site | 2,916 | 69 GSC | 28 strict / 151 loose slug match | **1.0% – 5.2%** |
| local-guides-citation-velocity | 2,326 in `dist/` | 64 GSC | 0 exact / 151 loose | **0% – 6.5%** |
| horse-legal-guide-velocity | 564 in `dist/` | 60 GSC | 2 of 273 declared targets | **0.7%** |
| authority-backlink-network | 569 | **0** (37 authored terms) | 0 | **0%** |
| approvalprep | 106 | **0** (11 modelled) | — | **0%** |
| p-n-p | 210 | **0** (3 modelled) | — | **0%** |
| dream-wedding-builder | 4 | **0** (13 modelled) | — | **0%** |

"Exact" matches a page's own declared target query against the evidence file. "Loose" is a heuristic
token-subset match of query words against slug words and it **overstates** coverage badly — in
horse-legal-guide 83 of its 126 matches come from the 2-word query `equine legal` (volume 3) hitting
the boilerplate slug suffix `…-in-an-equine-legal-situation`; in local-guides 97 matches are one
civil-surgeon query hitting 97 different pages. **Trust the exact column.**

The cleanest single statement comes from horse-legal-guide, the only repo with a complete declared
page→query map (`data/queries/page_targets.json`, 273 entries):

> **271 of 273 declared page targets (99.3%) target a query with no measured demand.**

The honest expected finding held. **Most of the portfolio is inferred-from-content, not measured.**
But the shape is more specific than "we guessed": the measurement exists and is good. It is just not
what the pages were built from.

---

## A schema defect that invalidates the atlas ranking

Before the classification, one finding that affects how every number in the atlas should be read.

**The `volume` field holds two incompatible units.**

- On **T1** rows, `volume` is a copy of `impressions` — how many times *our page* was shown in
  Google. Verified: `hybrid event platform` volume 893 = impressions 893.
- On **T2b** rows, `volume` is Semrush's modelled *market-wide monthly search volume*. Verified:
  `hormone replacement therapy near me` volume 8,100, no impressions field at all.

These are not comparable, and `rank_score` in `data/authority_scale/query_atlas.json` sorts on
`volume`. Every "highest-volume query" claim in the portfolio therefore mixes "a term the whole
market searches 8,100 times a month" with "a term we were shown for 893 times in 90 days".

This matters concretely: **every large number in local-guides and horse-legal-guide is T2b modelled,
not measured.** `hormone replacement therapy near me` (8,100), `uscis civil surgeon` (5,400),
`civil surgeon near me` (2,400), `horse boarding contract` (320), `horse boarding agreement` (260) —
all modelled. The measured demand in those two repos is 248 and 127 impressions respectively.

This is not fabrication — the tier labels are correct and present on every row. It is a unit
collision in a shared field. Flagged, not fixed: this audit is read-only and other agents are active
in these repos.

---

## Classification of every query cluster

### 1. GSC-measured demand — real, recent, and better than expected

Four repos hold genuine Search Console pulls, all ingested 2026-08-26 over a 90-day window:

| Repo | T1 rows | Window | Site |
|---|---|---|---|
| WPP-llm | 521 | 2026-05-26 → 2026-08-24 | `sc-domain:virtualagency-os.com` |
| sprylabs-hpc-site | 69 | 2026-05-25 → 2026-08-23 | `sc-domain:billionairehighperformancecoach.com` |
| local-guides-citation-velocity | 64 | 2026-05-26 → 2026-08-24 | `sc-domain:theindustryguides.com` |
| horse-legal-guide-velocity | 60 | 2026-05-25 → 2026-08-23 | `sc-domain:horselegalguide.com` |

Each row carries `impressions`, `clicks`, `ctr`, `average_position` and the window. The `note` on
each file is correct that T4 synthetic fan-out is never stored there. **The evidence layer is not
the problem.**

### 2. Bing-measured demand — available, and almost entirely unused

`local-guides-citation-velocity/data/signals/bing_webmaster_baseline.json` is the only Bing artefact
in the portfolio. Measured 2026-08-26 by manual console read. Verbatim:

- **19 portfolio domains are verified in Bing Webmaster Tools**, including all four GSC properties.
- **AI citations, 3 months to 2026-08-26, Microsoft Copilots and Partners: 19 total.**
  `spryexecutiveos.com` 8 · `theindustryguides.com` 5 · `horselegalguide.com` 4 ·
  `virtualagency-os.com` 2 · `billionairehighperformancecoach.com` 0 · `dentistryguides.com` 0.
  Bing will not break down which queries produced them at this volume.
- **`theindustryguides.com` index coverage:** 1,200 indexed, 1,400 known, 167 excluded, 44 warnings,
  0 errors, **17 impressions over six months**, **0 backlinks** (by design — the authority network
  links `rel="sponsored nofollow"`).

The file's own reading is right: about half the library is not in Bing's index, and 17 impressions
across 1,200 indexed pages over six months is effectively no demand reaching them.

One further lookup was completed during this audit and is recorded as measured:

> **`dental implant cost`** — 1,000 impressions, window 25 May – 22 Aug 2026.
> US 736 · UK 67 · IN 56 · CA 6.
> Related: `dental implants` 10,700 · `implants` 2,700 · `dental implants cost` 1,100 ·
> `cost of dental implants` 690 · `tooth implant cost` 551 · `how much do dental implants cost` 522 ·
> `how much are dental implants` 460 · `teeth implants cost` 392 ·
> `average cost of dental implants` 326 · `dental implant cost per tooth` 105.
> **Question keywords tab: "No data available"** for this seed.
> Bing's live top-10 for it places `realdentalcosts.com` at **positions 2 and 3**;
> `theindustryguides.com` does not appear.
> Source: Bing Webmaster Tools Keyword Research, `siteUrl=https://theindustryguides.com`, 2026-08-26.

That single lookup is worth more than any modelled number in the portfolio and took under a minute.
**22 more that would each change a decision are listed in `docs/query-coverage/measurement-plan.md`,
along with why the rest could not be run.**

### 3. Inferred-from-content — the bulk of the portfolio

**WPP-llm.** `data/authority_scale/query_atlas.json` reports `clusters_total: 51` and
`clusters_with_evidence: 68` — internally incoherent, because the second count is inflated by
clusters derived from the query string itself when taxonomy classification fails. Among the 68:
`west-peak`, `silver-peak`, `westpeak`, `side-by`, `need-strong`, `define-run`, `livekit`,
`expoplatform-expofp`, `westmark-productions`. These are tokenisation artefacts of single branded or
nonsense GSC rows, not content clusters.

The corpus is a **448-topic × 81-modifier grid**. Only **40 of the 177 clusters the pages actually
use** appear in the atlas. **1,273 of 3,052 pages (42%) have no evidence lineage of any kind.**

**sprylabs-hpc-site.** The validator prints
`71 evidence-backed, 16/40 clusters, 100000 reserve permutations held back`. Two corrections:

- **`16/40` is wrong** — 16 + 29 reserve-only = 45, not 40. Five of the 16 are phantom clusters
  invented by the `derivedCluster()` fallback in `scripts/atlas/build_query_atlas.mjs`:
  `spry-reddit`, `adhd-activation`, `sprylabs`, `compare-humantelligence`, `phone-vortex`. The
  defensible figure is **11 of 40 (27.5%)**; the `29` is the correct complement of 11.
- **`100000` is real** — `data/authority_scale/fanout_100k/` holds ten gzipped JSONL shards
  decompressing to exactly 100,000 lines, 100,000 distinct queries, hash-manifested, every record
  labelled `"disposition":"OPPORTUNITY_ONLY"`, `"page_admission_status":"NOT_EVALUATED"`.
  "Held back" is accurate.

WPP-llm holds the same structure at `data/authority_scale/fanout_100k/`, declaring 69,360,000
theoretical combinations.

### 4. Fabricated / unknown — small, and honestly labelled

**No fabricated volumes were found.** The closest cases are all self-declared:

- **`authority-backlink-network/data/queries/evidence/evidence_queries.json`** — 37 plain strings,
  no tiers, no volumes. Its own `_why` says it: *"Derived from the topics this network actually
  publishes on, not from measured search demand… inventing plausible queries would have produced a
  measurement of nothing."* That was the right call. Several entries are not queries anyone types —
  `self-service document creation and downloadable document kits`,
  `Memphis porch decorating hotel decor party styling grazing tables`.
- **`authority-backlink-network/data/citation-topic-map.json`** — 15 campaigns, 14 brands, 37
  keywords, **zero volume fields of any kind**. Authored, not measured.
- **T2b `semrush_keyword_magic` rows** — 1 in WPP-llm, 2 in sprylabs, 4 in local-guides, 2 in horse,
  11 in approvalprep, 13 in dream-wedding-builder, 3 in p-n-p. Weighted 0.6 in the atlas and
  labelled modelled. **approvalprep, p-n-p and dream-wedding-builder have no measured demand at
  all.**
- **`WPP-llm/data/seo/priority_queries.json`** — 11 records with `trusted_volume_per_month` and
  `trusted_competition`, sourced `"trusted_semrush_connected_review"`. The only competition figure
  in the portfolio, and its provenance is a review, not an export.
- **`keyword_difficulty` is `null` on 521 of 522 WPP-llm atlas rows.** Nothing was invented to fill
  it. That restraint is correct and must be preserved.

---

## The finding that outranks the ratio

**The portfolio has ~9,900 measured Google impressions and 1 click, at a median position of ~70.**

| Repo | T1 impressions | T1 clicks | Median position | Top 10 | Top 20 |
|---|---|---|---|---|---|
| WPP-llm | 8,630 | **0** | 70.5 | 11 | 24 |
| sprylabs-hpc-site | 895 | **1** | 69.8 | 4 | 9 |
| local-guides-citation-velocity | 248 | **0** | 81.2 | 1 | 4 |
| horse-legal-guide-velocity | 127 | **0** | 72.5 | 1 | 1 |
| **Portfolio** | **9,900** | **1** | **~70** | 17 | 38 |

Position 70 is page seven. The grounded citation probe agrees: `self_cited_rate_pct: 0` on the
latest run in **all five** probed repos, across 107 probe queries.

This reframes the gate. **Choosing better queries is not the binding constraint when nothing ranks
for the queries already chosen.** The 10,500 pages are not competing with `realdentalcosts.com` —
they are not in the same result set. Bing's live top-10 for `dental implant cost` confirms it
directly: `realdentalcosts.com` twice, `theindustryguides.com` not at all.

### A caveat on the citation probe

The engine is `openrouter:ibm-granite/granite-4.0-h-micro` in `mode: "grounded"` — a micro-class
model. Its competitor lists are a useful gap-analysis seed, and several entries were independently
confirmed as real incumbents by the Bing SERP read. But a 3B-class model's citation list is **not**
evidence of what Google's or ChatGPT's answer layer retrieves. Read `self_cited: 0` as "we did not
clear a low bar", not as a calibrated visibility measurement. Bing's AI Performance tab (19 real
Copilot citations) is the better instrument and is already available.

Note also that **`WPP-llm/data/signals/citation_probe_config.json` points at
`data/seo/priority_queries.json`, which holds 11 queries, all in the events vertical.** The
community, brand and AI-workflow clusters that make up the bulk of the 3,052 pages are never probed.

---

## Per-repo detail

### WPP-llm — `virtualagency-os.com`

- 3,052 programmatic pages, flat under `/programmatic/`, no subdirectories.
- Page→query mapping lives in `data/content/page_admission_registry.json` (3,039 admissions) and
  `data/content/programmatic_quality_report.json` (3,052 pages). **No page carries its target query
  in the HTML** — `target_query`, `primary_query`, `evidence_tier` are absent from every file.
- **45 pages** have a stored `query` exactly matching an atlas query. **59 of 509 distinct atlas
  queries (11.6%)** are covered by such a page.
- **1,779 of 3,052 pages (58.3%)** sit in a cluster that appears in the atlas — descendants of an
  evidence-backed cluster, not targets of a measured query.
- Upstream supply is `data/opportunities/aeo_geo_opportunities.json` with **10,911 opportunities**
  against 522 evidence-backed queries — a 21:1 hypothesis-to-evidence funnel.

### sprylabs-hpc-site

- 2,916 pages: `billionairehighperformancecoach.com` 1,674, `spryexecutiveos.com` 1,219, 23
  templates and fixtures. **`aplayermode.com` hosts zero pages** despite being an owned domain with
  2 evidence queries — it appears only as an outbound link target.
- **52 of 71 measured queries (73%) have no page** even under a loose match — including every
  high-intent commercial term GSC surfaced: `ai coaching platform`, `best ai coaching software`,
  `ai coaching tool for managers`, `ai chief of staff tool`, `life coach alternative`,
  `nua coach alternative`, `ai business coach`, `coaching intelligence platform`.
- `scripts/atlas/build_query_atlas.mjs` warns in its own header against generating pages from the
  fan-out taxonomy, calling it the scaled-content-abuse pattern named by the March 2026 core update.
  The 2,916 pages predate the atlas and were built the way the header warns.

### local-guides-citation-velocity

- **One live host, not six.** `content/_shared/canonical_map.json` sets
  `"site_base": "https://theindustryguides.com"`; `REPO_IDENTITY.md` is explicit that
  `dentistryguides.com`, `theaccidentguides.com`, `hormonesivhair.com`, `neuroevalguides.com` and
  `uscisexam.com` are outbound "Find a Provider" destinations, not page hosts. The repo-root tree is
  a byte-for-byte mirror of `dist/` (rendered-text ratio 1.0000), which is why raw file count reads
  4,719.
- Pages by vertical: personal-injury 583, dentistry 511, trt 461, neuro 388, uscis-medical 338,
  portfolio/root 45.
- `content/_shared/query_cluster_registry.json` holds **70 clusters** across 5 verticals;
  `content/_shared/query_to_cluster_map.json` holds 1,242 entries — **all under `/insights/`**. No state page,
  community-question page, hub or disambiguator is mapped. **1,084 of 2,326 pages (46.6%) have no
  cluster assignment at all.**
- **Zero `primary_query` values match any of the 68 evidence queries exactly.**
- Topical contamination: `dist/personal-injury/community-questions/` (274 of 408 personal-injury
  pages) contains pages about TRT vials, minoxidil/PRP, dental costs, child custody, USCIS passports
  and pet grooming. One dentistry community-question page is about a Syrian marriage visa. These
  dilute the entity signal of the vertical they sit in.

### horse-legal-guide-velocity

- 564 deployed pages, single domain `horselegalguide.com`.
- The only repo with a complete declared page→query map, and it gives the worst reading:
  **0 of 273 `primary_query` values are a measured query; 2 of 273 have any measured query in
  primary or supporting position.**
- **291 of 564 pages (51.6%) have no declared query target at all.**
- Measured demand is real but tiny: `horse bill of sale` 16 impressions, `equine bill of sale` 6,
  `horse purchase agreement` 3. Total 127 impressions, 0 clicks, median position 72.5.
- The strongest measured signal is a long-tail question already being served:
  `do i need liability insurance for my horse in nc?` — 7 impressions at position 42.7. That is the
  shape this programme should chase, and it is one row out of 60.

### authority-backlink-network

- 569 pages: `professionalresourcelibrary.com` 387, `founderoperatorlibrary.com` 93,
  `memphisvendorlibrary.com` 89.
- **No measured search data of any kind.** The repo says so itself and does not pretend otherwise.

---

## What to conclude at the gate

1. **The evidence layer is trustworthy and current.** GSC ingests are real, recent, well-labelled,
   and `keyword_difficulty` was left null rather than fabricated. Do not rebuild this.
2. **The page layer was not built from it.** 98–99% of pages descend from a combinatorial taxonomy.
   That is a *targeting* gap, not a measurement gap.
3. **Three numbers in the tooling are wrong and should not be quoted until fixed:** WPP-llm's
   `clusters_with_evidence: 68` against `clusters_total: 51`; sprylabs' `16/40`; and the `volume`
   field's unit collision between T1 impressions and T2b modelled volume. The first two share a
   cause — the `derivedCluster()` fallback inventing cluster names from query tokens.
4. **The binding constraint is rank, not query selection.** 1 click on 9,900 impressions at median
   position 70 says the content is not competitive for queries we already know are real.
5. **Free measurement is sitting unused.** 19 domains verified in Bing; one lookup during this audit
   produced better demand data than any modelled row in the portfolio.

Fan-out findings: `docs/query-coverage/fan-out-coverage.md`.
Blue ocean: `docs/query-coverage/blue-ocean.md`.
Free measurement queue: `docs/query-coverage/measurement-plan.md`.
Paid measurement request: `docs/semrush-request.md`.
