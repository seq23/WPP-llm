# Blue ocean — low-competition queries with real demand

**Date of analysis:** 2026-08-26. Read-only audit.
Companion to `docs/query-coverage/demand-reality-check.md`.

**No difficulty score in this document was invented.** Where a decision needs a volume or difficulty
number that could not be measured, the query is marked `NEEDS_BING` (free, see
`docs/query-coverage/measurement-plan.md`) or `NEEDS_SEMRUSH` (paid, see `docs/semrush-request.md`).

---

## Read this before the lists

The blue-ocean framing assumes the constraint is *which* queries we chase. The evidence says
otherwise: **~9,900 measured impressions, 1 click, median position 70, and 0 backlinks on the
flagship domain.** A less contested query is worth nothing to a site that ranks at position 70 on
the queries it already has.

So the lists below are ordered by a different criterion than "lowest competition". They are ordered
by **how cheaply an existing page can be made to win them**, because that is the constraint that is
actually binding.

Two things the gap analysis found are worth more than any keyword on these lists:

1. **Dentistry: 217 pages, zero dollar figures.** Every cited competitor publishes prices. We cannot
   win a "how much does X cost" retrieval without a number on the page, regardless of which cost
   query we target.
2. **Equine: 563 pages, zero mentions of "download".** `legaltemplates.net` and `uslegalforms.com`
   rank by handing over the document. We explain what should be in it.

Fixing either is a content-shape change, not a query-selection change, and either would move more
than the whole list below.

---

## Method, and its limits

Competitor domains were not guessed. Each was recorded as cited in a grounded probe run
(`data/signals/llm_citation_observations.json`) or observed in Bing's live top-10 for one of our
seeds. Their pages were then fetched and their headings and FAQs extracted verbatim, and compared
against our page inventory by grep.

**What this method gives:** a defensible list of questions real incumbents answer and we do not.
**What it cannot give:** volume or difficulty. A gap is not automatically an opportunity — it may be
a gap because nobody searches it. Hence the `NEEDS_BING` / `NEEDS_SEMRUSH` markers.

**Fetch failures, stated rather than papered over:** `dentalcostfinder.com` returned HTTP 522
(origin down) on three attempts — zero headings extracted. `legalclarity.org`'s equine section could
not be located: its homepage nav lists 17 categories, none animal-related, and its `wp-sitemap.xml`
returns an empty `<urlset>`. `equinelegalsolutions.com` returned HTTP 403 to every attempt. Those
three contributed nothing and nothing was invented for them.

---

## Tier A — measured demand, no page, existing page nearby

The strongest candidates in the portfolio: demand is measured in our own GSC, and a page already
exists that could be retargeted rather than written.

| Query | Evidence | Repo | Nearest existing page |
|---|---|---|---|
| `ai coaching platform` | 28 impr, pos 92.8 (T1 GSC) | sprylabs | `answers/ai-executive-coach-alternative.html` |
| `best ai coaching software` | 15 impr, pos 80.8 (T1) | sprylabs | same cluster |
| `ai coaching tool for managers` | 13 impr, pos 93.6 (T1) | sprylabs | `use-cases/phase4/*-manager-*` |
| `nua coach alternative` | 11 impr, pos 46.3 (T1) | sprylabs | `vs/` directory (230 pages, no page for this) |
| `life coach alternative` | T1 | sprylabs | `vs/life-coach/index.html` — exists, mistargeted |
| `ai chief of staff tool` | T1 | sprylabs | `answers/chief-of-staff-and-life-operations.html` |
| `ai business coach` | 5 impr, pos 60.6 (T1) | sprylabs | `vs/founder-coaching/` |
| `webinar production checklist` | 48 impr, **pos 10.3** (T1) | WPP-llm | already ranking — the portfolio's single best position |
| `integrated agency definition` | 34 impr, pos 23.6 (T1) | WPP-llm | 9 routes competing — consolidate, don't create |
| `do i need liability insurance for my horse in nc?` | 7 impr, pos 42.7 (T1) | horse | `state/north-carolina/` exists (3 pages) |
| `partnership agreement vs operating agreement` | 5 impr, pos 74.4 (T1) | horse | `compare/` directory |
| `is equine therapy covered by insurance` | 3 impr, pos 78.0 (T1) | horse | `therapeutic/` (5 pages) |

`webinar production checklist` at **position 10.3 with 48 impressions** is the closest thing to a
live win anywhere in the portfolio. It deserves attention before any new query does.

**Difficulty for all twelve: `NEEDS_SEMRUSH`.** They are in Export 1 or will fall out of Export 2d.

---

## Tier B — dentistry gaps against incumbents Bing confirms

Competitors: `realdentalcosts.com` (Bing pos 2 and 3 for `dental implant cost`), `dentillo.com`
(pos 5), `dentalroundup.com` (pos 1), `mysmilecost.com` (pos 10), `toothprice.com` (probe-cited).

Every query below is one those sites answer and our 217 dentistry pages do not. **All are
`NEEDS_BING`** — run seeds 8 and 17 in `docs/query-coverage/measurement-plan.md`, then the Related
and Question tabs will price this entire list for free.

**B1 — cost specificity we structurally cannot answer today (needs a price on the page):**

```
dental implant cost calculator
how much do dental implants cost by state
all on 4 dental implants cost
full mouth dental implants cost
mini dental implants cost
same day dental implants cost
implant supported bridge cost
cheapest state for dental implants
most expensive state for dental implants
implant vs bridge vs denture cost over 15 years
veneers cost per tooth
root canal cost near me
dental crown cost
tooth extraction cost
teeth whitening cost professional
teeth cleaning cost without insurance
```

**B2 — funding and coverage, where we have adjacent pages and no answer:**

```
does medicare cover dental implants
dental implant cost without insurance
can i use hsa for dental implants
can i use fsa for dental work
delta dental implant coverage
dental savings plan vs dental insurance
carecredit for dental implants
dental implant financing bad credit
dental implant cost at dental school
```

`HSA` and `FSA` appear in **zero** of our 217 dentistry files. Medicare appears in 18 files with no
implant-coverage page. These are the cheapest gaps to close because the surrounding cluster already
exists (`dentistry/cost-insurance/`, `dentistry/cost-financing/`).

**B3 — durability and alternatives, zero coverage:**

```
how long do dental implants last
dental implants in mexico cost
is it worth going abroad for dental implants
```

`how long do dental implants last` is a `dentalroundup.com` heading and returns nothing in our
corpus. It is a question, not a cost — which makes it the most plausible answer-engine target on
this list, since it needs no price data to answer well.

**Deliberately excluded:** `dental implant cost des moines` and city-level variants generally. Going
after cities means opening a new permutation axis in a portfolio already carrying 25% near-duplicate
pages, against a competitor who has the price data we lack. Recommendation is to lose that axis
knowingly rather than contest it badly.

---

## Tier C — equine gaps against incumbents the probe recorded

Competitors: `legaltemplates.net`, `uslegalforms.com`, `madbarn.com`, `equineesquire.com`,
`equinelawuk.co.uk` — all probe-cited for equine queries.

**All `NEEDS_BING`** — run seeds 3, 13 and 18.

**C1 — the document itself (our largest structural gap):**

```
free horse bill of sale template
horse bill of sale pdf
does a horse bill of sale need to be notarized
horse bill of sale requirements by state
how to write a bill of sale for a horse
sample horse bill of sale
horse boarding agreement template free
equine liability release form template
horse lease agreement template
```

`horse bill of sale` is already our **strongest measured query** (16 impressions, position 54.1).
`legaltemplates.net` ranks for it by giving away the form. We have `dist/faq/what-should-be-included-in-a-horse-bill-of-sale/`
and zero files mentioning "download". This is the single highest-leverage gap in the repo — one
downloadable artifact against a query we already have measured demand for.

**C2 — state coverage (they have 50, we have 3, and none of ours covers sales):**

```
texas horse bill of sale
california horse bill of sale requirements
florida equine liability statute
```

Named as illustrations, not a recommendation to build 50 state pages. **Measure first.** If demand
concentrates in 3–5 horse-heavy states (TX, FL, KY, CA, OK), that is a five-page build; if it is
flat across 50, it is a trap of exactly the kind this portfolio has already fallen into.

**C3 — money and lifecycle, zero slugs in our repo:**

```
cost of owning a horse per year
cost of boarding a horse per month
sales tax on horse purchase
horse business hobby loss rule irs
is a working student an employee or independent contractor
barn zoning requirements for horses
equine estate planning what happens to my horse when i die
```

`cost`, `price` and `how-much` appear in **zero slugs** across 563 equine pages. `madbarn.com` —
probe-cited — covers adoption costs directly. The IRS hobby-loss rule and the working-student
classification question are genuinely underserved and sit squarely in this site's competence.

**C4 — paperwork adjacent to ownership, zero coverage:**

```
equine health certificate requirements for travel
coggins test requirements by state
transporting a horse across state lines paperwork
horse registration papers transfer of ownership
horse breeding contract template
stallion service contract
foal sale contract
```

"Health certificate" returns 0 files; "Coggins" returns 1; breeding, stallion and foal return 0
slugs. `uslegalforms.com` sells a "Contract of Sale for Unborn Foal", which tells us the commercial
demand is real enough for somebody to monetise.

**C5 — valuation, an entire service line absent:**

```
horse appraisal for legal purposes
how to value a horse for a legal dispute
```

`equineesquire.com` leads with "Equine Appraisals" as a featured service. We have no valuation
content at all, in a 563-page site about equine legal disputes.

---

## Tier D — the events cluster, where the impressions actually are

WPP-llm carries **8,630 of the portfolio's 9,900 measured impressions**. It is the only property
with enough signal to reason about, and its problem is not query selection — it is that 134 queries
are split across multiple routes.

The blue-ocean move here is **consolidation, not discovery**:

| Query | Measured | Current state |
|---|---|---|
| `hybrid event platform` | 893 impr, pos 74.6 | highest-impression query in the portfolio |
| `virtual event production` | 883 impr, pos 63.3 | — |
| `best virtual event platforms` | 279 impr, **pos 25.9** | best head-term position we hold |
| `best virtual event platform` | 276 impr, pos 32.4 | singular/plural split across routes |
| `audience growth strategy` | 193 impr, **pos 27.1** | — |
| `virtual event platforms` | 169 impr, pos 35.9 | — |
| `best virtual event production companies` | 90 impr, **pos 26.2** | — |

Four queries already sit in positions 25–36 with real impressions. **Those are the portfolio's
genuine near-misses**, and they are worth more than any unmeasured blue-ocean term. `NEEDS_SEMRUSH`
on difficulty for all seven — they are in Export 1 and Export 2c.

Note the singular/plural split (`best virtual event platform` at 32.4 and `best virtual event
platforms` at 25.9 are two routes competing) — that is a consolidation candidate, not two targets.

---

## What is genuinely blue ocean, and what is just empty

Being honest about the difference:

**Genuinely promising** — real incumbents answer them, we have adjacent competence, no price data
required:
1. `how long do dental implants last`
2. `does a horse bill of sale need to be notarized`
3. `is a working student an employee or independent contractor`
4. `horse business hobby loss rule irs`
5. `equine estate planning what happens to my horse when i die`
6. `can i use hsa for dental implants`
7. `horse appraisal for legal purposes`
8. `coggins test requirements by state`

**Probably empty, not blue** — no competitor covers them either, which usually means no demand:
- horse discipline permutations (dressage / eventing / western). No competitor uses this axis. That
  is evidence against it, not an opening.
- UK equine jurisdiction (`equinelawuk.co.uk` exists, but we are a US site with 0 backlinks).
- `mini dental implants cost`, `same day dental implants cost` — thin sub-type splits that would
  reproduce the permutation problem the portfolio already has.

**Unknowable without measurement** — everything in Tiers B and C not listed above. Run the free Bing
seeds before spending a page on any of them.

---

## Recommended sequence

1. **Run the 22 Bing lookups** (`docs/query-coverage/measurement-plan.md`). Free, ~30 minutes,
   prices Tiers B and C entirely.
2. **Fix `webinar production checklist` (pos 10.3)** and the four events near-misses in positions
   25–36. Real demand, real position, no new pages.
3. **Resolve horse-legal-guide's 78 duplicate pairs** before adding a single equine page. Adding
   content to a site where 47% of URLs are a mirror layer wastes the content.
4. **Put a number on the dentistry pages.** No dental cost query on Tier B is winnable without it.
5. **Ship one downloadable horse bill of sale.** We already have measured demand for the query and
   the reasoning content; the artifact is the missing half.
6. Only then request SEMrush KD (`docs/semrush-request.md`) for whatever survives.
