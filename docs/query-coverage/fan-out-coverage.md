# Fan-out coverage — is it adequate, and is it eating itself?

**Date of analysis:** 2026-08-26. Read-only audit.
Companion to `docs/query-coverage/demand-reality-check.md`.

**Verdict: fan-out is excessive, not insufficient. Do not expand. The 100k reserve restraint is
correct and should be extended, not relaxed.**

Refresh capacity is roughly 325 pages per property per cycle against ~10,500 pages. A full pass
takes a decade. Every recommendation below is therefore a subtraction or a consolidation, with two
narrow exceptions named at the end.

---

## 1. Cannibalisation is measured, not suspected

### WPP-llm — Google itself shows the collision

Computed from `data/signals/gsc_query_signals.json` (911 rows, 520 distinct queries, 9,210
impressions, 0 clicks):

> **134 of 520 queries (26%) are served by more than one route, accounting for 5,284 of 9,210
> impressions (57%).**

| Query | Routes competing |
|---|---|
| `ai consultant vs ai agency` | **24** |
| `run of show meaning` | 15 |
| `production agency definition` | 14 |
| `agency content operations` | 13 |
| `what is community operations` | 11 |
| `ai content operations` | 10 |
| `brand messaging architecture` | 10 |
| `community management outsourcing` | 10 |

The 24 routes competing for `ai consultant vs ai agency` are one stem plus the modifier wheel:
`/ai-consultant-vs-automation-agency`, `-agency`, `-common-failure-points`, `-companies`,
`-consultant`, `-cost`, `-for-marketing-teams`, `-for-small-teams`, and sixteen more. Google is
already showing all 24 for the same query.

Structure, from `data/content/programmatic_quality_report.json`:

- **448-topic × 81-modifier grid.** 99.5% of pages sit in a modifier class with 10+ members.
- **216 audience-swap groups covering 827 pages (27%)** — a fixed ten-audience wheel
  (`enterprise teams / financial services teams / founders / marketing teams / nonprofits /
  professional services firms / SaaS companies / small teams / startups / venture backed companies`)
  applied identically to 46 topics.
- **2,602 pages (85%) sit in a topic stem with 10+ siblings.** Eleven stems carry 48–50 pages each.
- **Body similarity, by the repo's own 5-word-shingle check:** median **0.720**, mean 0.703, max
  0.889. **94.5% score ≥0.60** against their nearest sibling; 27.3% score ≥0.80. The block threshold
  is 0.90 — the corpus sits deliberately just under its own gate.
- The report's own verdict: `similarity_warning_pages: 612`, `thin_pages: 502`,
  `status: "LEGACY_REMEDIATION_REQUIRED"`.
- Titles are 3,052-of-3,052 distinct, which **hides** the problem. Uniqueness comes from a swapped
  token, not different content.

### horse-legal-guide-velocity — live, uncorrected, self-canonicalising duplication

The most clear-cut defect in the portfolio and the cheapest to fix.

> **78 titles are used by 2 pages each — 156 of 564 pages (27.7%) carry a duplicate `<title>` AND a
> duplicate `<h1>`, and every one of those pages canonicalises to itself.**

Every pair is `/reference/{slug}` twinned with a topic-directory page of the same slug:
`faq` ↔ `reference` 15 pairs, `leases` 11, `boarding` 11, `liability` 10, `scenario` 9, `ip` 7,
`disputes` 6, `business` 5, `therapeutic` 4.

The `/reference/` twin is the thinner one and says so in its own copy — "a crawlable
signal-reference page". For *What Is the Equine Activity Liability Act?* the topic page runs 4,997
characters and the reference twin 2,315, at 0.408 text similarity. The site asks Google to choose
between a good page and a deliberately thin doorway to the same question, with no canonical pointing
the way. `/reference/` is **263 of 564 pages — 47% of the site**.

On top of the mirror layer, `compare/` and `scenario/` self-duplicate:
`mediation-vs-litigation-horse-disputes` / `-in-a-horse-dispute` / `-in-horse-disputes` (three URLs,
one question); `demand-letter-vs-lawsuit` / `-in-a-horse-dispute`;
`llc-vs-sole-proprietor-horse-business` / `sole-proprietor-vs-llc-for-a-horse-business`;
`trainer-liability-vs-owner-liability` / `horse-owner-liability-vs-trainer-liability`;
`i-sold-a-horse-without-a-contract-am-i-screwed` / `-what-now` / `what-if-i-sold-a-horse-without-a-contract`.

**A structured-data problem rides along with it.** On
`dist/faq/what-should-be-included-in-a-horse-bill-of-sale/`, three of four FAQ answers share one
identical boilerplate string, the questions are grammatically broken ("What should someone know
about a farrier or vet dispute affects a horse sale. what documents matter?"), and the fourth
"question" is a truncated fragment: "Should Be Included in a Horse Bill of Sale". **FAQPage schema
is present on 346 files**, so this is being emitted as structured data at scale.

### sprylabs-hpc-site

Distinct-titles ratio is 0.993, which again hides the shape. **1,286 of 2,895 distinct titles
(44.4%) sit in a one-token-swap group.**

| n | Pattern |
|---|---|
| 12 | `is billionaire high performance coach legit for {audience}?` |
| 12 | `is billionaire high performance coach real for {audience}?` |
| 11 | `billionaire high performance coach vs {competitor}` |
| 7 × 5 | `a player mode for a {audience} who is {struggle}` |

`brand-defense/` spends **50 pages** asking `legit` / `real` / `a-scam` about the same brand across
the same 12 audiences — three synonym pages per audience competing for one intent.
`platforms/phase4/` is a bare 5-LLM × 10-task grid, 50 pages.

Two quality tells worth fixing regardless of strategy: **8 pages ship with the literal title
`{{title}}`** (unrendered placeholder), and two live titles read `…legit for coachs?` — machine
pluralisation nobody reviewed.

### local-guides-citation-velocity

`dist/` has **zero exact title or H1 collisions** — the cleanest repo on that test. Near-duplication
is **131 one-token-swap groups covering 594 of 2,326 pages (25.5%)**, dominated by eight 50-page
state families: `TRT Legality and Prescribing Rules in {STATE}` · `Telehealth TRT Rules in {STATE}` ·
`USCIS Civil Surgeons in {STATE}` · `{STATE} Comparative or Contributory Negligence Rules` ·
`{STATE} Personal Injury Statute of Limitations` ·
`Neuropsychological Evaluation Access in {STATE}` · `{STATE} Medicaid Dental Coverage Guide` ·
`{STATE} Dental Insurance Marketplace Guide`.

**State fan-out on legal/regulatory facts is legitimate** — statute of limitations and Medicaid
dental coverage genuinely differ by state, and `realdentalcosts.com` (Bing positions 2 and 3) uses
exactly this axis. **Keep these.** But note the Iowa sample: the only state-unique H2 is "Official
Medicaid profile for Iowa"; the remaining ~12 headings are boilerplate ("Verify the rule before
acting", 5× "Quick checklist", 5× "Red flags"). A legitimate axis executed without per-state
substance is still a thin page.

The **illegitimate** fan-out here is the adjective wheel in `/insights/`:
`{Best|Affordable|Trusted|Gentle|Emergency} Dentist for Wisdom Teeth`,
`{Affordable|Good|Trusted|Best|Emergency} Workplace Injury Lawyer Near Me`. Five pages, one intent,
zero factual difference. Same for the templated question families: `What should I verify …` ×50,
`What mistakes cause problems …` ×40, `When should I get …` ×30.

Also live: `dentistry/best-top-near-me/` ships unfinished template scaffolding as visible headings —
`"How do I find the best dentist near me? — acceptance block 5"`, `"— acceptance block 7"`.

### authority-backlink-network

Passes the one-swap test at 0.7% but fails on inspection: **543 daily pages across only 194 distinct
topic stems** (`Credit Dispute Letters` ×15, `Wedding Planning Tools` ×13). The differentiator is a
visible generator suffix — `{Decision-Focused|Operator-Grade|2026-Ready|No-Fluff|Human-First|
Beginner-Safe|AEO-Ready}` × `{Comparison Guide|Operator Playbook|Red-Flag Checklist|Timeline Guide|
FAQ Answer Page|Resource Roundup}` × `{Before You Pay|When Timing Matters|For Busy Operators}`.
~2.8 pages per topic differing only by interchangeable adjective and CTA.

---

## 2. Clusters with one page where the query family needs several

Very few — and that is the point. The genuine under-coverage cases are all queries with **measured**
demand and **no** page:

| Repo | Query | Evidence | Pages targeting it |
|---|---|---|---|
| sprylabs | `ai coaching platform` | 28 impr, pos 92.8 (T1) | 0 |
| sprylabs | `best ai coaching software` | 15 impr, pos 80.8 (T1) | 0 |
| sprylabs | `ai coaching tool for managers` | 13 impr, pos 93.6 (T1) | 0 |
| sprylabs | `nua coach alternative` | 11 impr, pos 46.3 (T1) | 0 |
| sprylabs | `life coach alternative`, `ai chief of staff tool`, `ai business coach` | T1 | 0 |
| local-guides | `hormone replacement therapy near me` | volume 8,100 — **T2b modelled** | 0, against 461 TRT pages |
| horse | `horse boarding contract` | volume 320 — **T2b modelled** | 0, against 11 boarding pages |

**52 of sprylabs' 71 measured queries (73%) and 51 of local-guides' 68 (75%) have no page**, in
2,916- and 2,326-page sites respectively. That is the fan-out failure worth naming: the grids
expanded along axes nobody searches while leaving the measured terms uncovered.

This does **not** justify new pages in bulk. It justifies **retargeting existing pages** — a page
already exists for nearly every one of these intents; it is aimed at a permutation instead of the
phrase people type.

---

## 3. The 100,000-permutation reserve — the restraint is correct

Both `sprylabs-hpc-site/data/authority_scale/fanout_100k/` and
`WPP-llm/data/authority_scale/fanout_100k/` hold real materialised corpora: ten gzipped JSONL shards
each, decompressing to exactly 100,000 lines with 100,000 distinct queries, hash-manifested, every
record labelled `"disposition":"OPPORTUNITY_ONLY"`, `"page_admission_status":"NOT_EVALUATED"`.
sprylabs declares 2,100,000 theoretical combinations; WPP-llm declares 69,360,000.

**No argument for expanding survives the evidence.** The reserve is `deterministic_max_fanout_v2`
template expansion — the same mechanism that produced the 2,602 cannibalising pages already live.
`scripts/atlas/build_query_atlas.mjs` warns about exactly this in its own header.

**The portfolio has already published ~10,500 pages from this mechanism and earned 1 click.**
Publishing more of the same is the one action guaranteed not to work.

Carry forward one correction: `71 evidence-backed, 16/40 clusters, 100000 reserve permutations held
back` reports **16/40 incorrectly** (16 + 29 = 45). The defensible number is **11/40 (27.5%)**. The
`100000` and the `29` are correct.

---

## 4. Where cited competitors cover ground we do not

Grounded in the Bing SERP read and in fetches of the domains the probe recorded as cited. Full
question-by-question tables are in `docs/query-coverage/blue-ocean.md`. The structural findings:

**Dentistry — we lose on a data axis, not a content axis.**
`realdentalcosts.com` (Bing positions 2 and 3 for `dental implant cost`) publishes, per state and
per city: implants $3,990, veneers $1,762, braces $6,129, Des Moines $3,600 across 98 clinics, −10%
vs state, cost-of-living index 89, plus *"What insurance actually pays on Iowa prices"* and a *"City
Price Breakdown"*.

> **Grepped across all 217 of our dentistry pages: zero files contain any dollar figure. Zero
> contain "calculator". Zero city-level pages exist.**

Five of five cited dental competitors carry dollar amounts; two lead with a calculator; three
permute by city. We permute by state and by adjective. **They permute over data; we permute over
synonyms.** That explains the position-70 median better than any keyword choice does.

Note that we *already have* `{STATE} Medicaid Dental Coverage Guide` ×50, directly answering one of
`realdentalcosts.com`'s three named FAQs. The page exists. It is not ranking. Again: rank, not
coverage.

**Equine — we lose on artifact, not depth.**
Our 563 pages out-cover every competitor on reasoning. But `legaltemplates.net` and
`uslegalforms.com` rank by **giving the user the document**, and both permute across 50 states where
we cover 3 (`illinois`, `north-carolina`, `south-carolina` — and none of those covers bills of sale).

> **Grepped across all of `dist/`: zero files mention "download". Zero mention "notarize".**

`legaltemplates.net/form/horse-bill-of-sale/` carries H2s *"State-Specific Requirements for Horse
Bills of Sale"*, *"How to Write a Bill of Sale for a Horse"*, *"Sample Bill of Sale for a Horse"*
and H4 *"Does a Horse Bill of Sale Need to be Notarized?"*. We answer the first partially and the
rest not at all — while spending 263 pages on a `/reference/` mirror of pages we already have.

**One axis nobody uses:** no competitor permutes by horse discipline (dressage / eventing / western)
either. That is an open axis, not a gap — noted, not recommended, because it needs demand
measurement first.

---

## 5. Recommendations, in order

Every one is subtraction or consolidation except items 6 and 7.

1. **horse-legal-guide: resolve the 78 duplicate pairs.** Canonicalise each `/reference/` twin to
   its topic page, or delete the twin. 156 pages, one mechanical change, removes 27.7% of the site's
   self-competition. Highest benefit-to-effort ratio in the portfolio. While there, collapse the
   triplicated `compare/` and `scenario/` slugs (~12 more pages) and fix the FAQPage boilerplate
   being emitted on 346 files.
2. **WPP-llm: consolidate the worst 20 cannibalising query families.** 134 queries are split across
   multiple routes; the top 20 account for a large share of the 5,284 collided impressions. One
   canonical route per query; redirect or noindex the rest. Start with `ai consultant vs ai agency`
   (24 routes).
3. **sprylabs: collapse `brand-defense/` from 50 pages to ~12.** `legit` / `real` / `a-scam` are one
   intent. Fix the `coachs` pluralisation and the 8 `{{title}}` pages while in there.
4. **local-guides: collapse the `/insights/` adjective wheel** (five `{MOD} Dentist for Wisdom
   Teeth` pages become one) and fix the "acceptance block 5/7" scaffolding shipping live. **Keep
   every state page** — but give each one real per-state substance instead of 12 boilerplate
   headings. Separately, the 274 off-topic `personal-injury/community-questions/` pages should be
   re-filed or retired; they dilute the vertical.
5. **authority-backlink-network: stop the daily generator's adjective/CTA suffix rotation.** 543
   pages over 194 stems should be ~194 pages.
6. **Retarget, do not add, for the ~103 measured-but-uncovered queries.** For each, point the
   nearest existing page at the measured phrasing. This consumes refresh capacity, not publishing
   capacity, and it is the only work touching queries we know are real.
7. **The only new pages justified anywhere:** `hormone replacement therapy near me` in a repo with
   461 TRT pages and no page for it, and `horse boarding contract` in a repo with 11 boarding pages
   and no page for it. **Both rest on T2b modelled volume, so measure them in Bing first**
   (`docs/query-coverage/measurement-plan.md`, seeds 1 and 3) before writing either.

**Net: retire or consolidate on the order of 900–1,100 pages; publish at most 2, after measurement.**

**The single highest-value change is not on this list, because it is not a fan-out change:** put a
number on the dentistry pages and a downloadable document on the equine pages. That is what the two
sites beating us in retrieval actually have.
