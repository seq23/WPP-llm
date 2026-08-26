# Measurement plan — what to measure free in Bing before paying for anything

**Date:** 2026-08-26.
Companion to `docs/query-coverage/demand-reality-check.md` and `docs/semrush-request.md`.

All 19 portfolio domains are verified in Bing Webmaster Tools (list in
`local-guides-citation-velocity/data/signals/bing_webmaster_baseline.json`). Keyword Research there
returns, per seed: 3-month impressions with a country breakdown, related keywords with individual
impressions, a **Question keywords** tab, a **Newly discovered** tab, a **Download all** export, and
a **top-10 URL ranking** for the seed. That last one is a live SERP read and is the most useful part
for gap analysis.

**This is free and takes about a minute per seed. Nothing in `docs/semrush-request.md` should
duplicate it.**

---

## What was measured during this audit

One lookup completed. Recorded here with source and date so a later run can tell measurement from
inference.

### `dental implant cost` — `siteUrl=https://theindustryguides.com`, read 2026-08-26

Impressions **1,000**, window 25 May 2026 – 22 Aug 2026.
Country split: United States 736 · United Kingdom 67 · India 56 · Canada 6.

Related keywords (impressions): `dental implants` 10,700 · `implants` 2,700 ·
`dental implants cost` 1,100 · `cost of dental implants` 690 · `tooth implant cost` 551 ·
`how much do dental implants cost` 522 · `how much are dental implants` 460 ·
`teeth implants cost` 392 · `average cost of dental implants` 326 ·
`dental implant cost per tooth` 105. (30 rows exist; 10 read.)

**Question keywords tab: "No data available"** for this seed. Worth knowing before planning a
programme around that tab — it is sparse on commercial-modifier seeds. Try question-shaped seeds
(`how much do dental implants cost`) instead.

Top-10 URL ranking for the seed, as returned:

1. `dentalroundup.com/guides/dental-implants-cost/`
2. **`realdentalcosts.com/en/iowa/des-moines/`**
3. **`realdentalcosts.com/en/iowa/`**
4. `iowaoralsurgery.com/procedures/dental-implants/cost-of-dental-implants/`
5. `dentillo.com/guide/dental-implant-cost`
6. `affordabledentures.com/locations/ia/west-des-moines/pricing-financing`
7. `desmoinesdenturesandimplants.com/cost/`
8. `affordabledentures.com/locations/ia/west-des-moines`
9. `myspecialtydentist.com/specialties/prosthodontics/treatments/dental-implant-cost`
10. `mysmilecost.com/`

`theindustryguides.com` does not appear. `realdentalcosts.com` holds two of ten — independently
confirming the grounded probe's citation of it, and confirming that the `/en/{state}/{city}/`
data-per-cell pattern is what wins this SERP.

---

## Why the rest was not measured

Automated navigation to `bing.com/webmasters` was **blocked by the session permission classifier**
for this agent. Reading and clicking within a page the operator already had open worked; opening the
tool myself did not, in either a new tab or the existing one. I did not attempt to work around it.

**To unblock:** either the operator navigates to each URL below and I read the result, or the
operator grants navigation permission for `bing.com/webmasters`, or the operator clicks
**Download all** on each and drops the CSVs somewhere I can read.

---

## The 22 lookups that would change a decision

URL pattern — substitute the domain and URL-encode the seed:

```
https://www.bing.com/webmasters/keywordresearch?siteUrl=https%3A%2F%2F<domain>&keyword=<seed>
```

Clicking **Question keywords** appends `&activeTab=question` (confirmed). The parameter for
**Newly discovered** was not confirmed — click the tab.

For each seed, capture: seed impressions + country split, all related keywords with impressions
(use **Download all**), the Question keywords tab, the Newly discovered tab, and the top-10 URL
ranking.

### Tier 1 — measured demand exists but no page does (7 seeds)

These decide whether to build the missing page. Highest priority.

| # | Seed | siteUrl | Why it decides something |
|---|---|---|---|
| 1 | `hormone replacement therapy near me` | `https://hormonesivhair.com` | Volume 8,100 in our own evidence file, **zero pages** against 461 TRT pages. Biggest single uncovered number in the portfolio. |
| 2 | `trt cost per month` | `https://hormonesivhair.com` | Cost intent is where `realdentalcosts.com` wins the adjacent vertical. Does the same demand shape exist here? |
| 3 | `horse boarding contract` | `https://horselegalguide.com` | Volume 320, **zero pages**, 11 boarding pages exist. |
| 4 | `ai coaching platform` | `https://billionairehighperformancecoach.com` | Measured, position 92.8, no page. Decides whether sprylabs' commercial terms are worth a real page. |
| 5 | `best ai coaching software` | `https://billionairehighperformancecoach.com` | Same. |
| 6 | `civil surgeon near me` | `https://uscisexam.com` | 97 pages already match this one query — is the demand big enough to justify any of them? |
| 7 | `virtual event production` | `https://virtualagency-os.com` | 883 GSC impressions, position 63.3. Bing's top-10 read tells us who to actually beat. |

### Tier 2 — Question keywords for every major cluster (9 seeds)

Question-shaped seeds, because the commercial-modifier seed returned no question data. These are
the fan-out findings the programme needs: literal questions people type, to compare against what
pages target.

| # | Seed | siteUrl |
|---|---|---|
| 8 | `how much do dental implants cost` | `https://dentistryguides.com` |
| 9 | `what is a civil surgeon` | `https://uscisexam.com` |
| 10 | `how long does a neuropsychological evaluation take` | `https://neuroevalguides.com` |
| 11 | `how much is a personal injury settlement` | `https://theaccidentguides.com` |
| 12 | `is trt safe` | `https://hormonesivhair.com` |
| 13 | `what should be in a horse bill of sale` | `https://horselegalguide.com` |
| 14 | `how to host a virtual event` | `https://virtualagency-os.com` |
| 15 | `what is community as a service` | `https://virtualagency-os.com` |
| 16 | `can ai replace an executive coach` | `https://billionairehighperformancecoach.com` |

### Tier 3 — Newly discovered, for blue ocean (6 seeds)

Run the same seeds and read only the **Newly discovered** tab. These are queries Bing has recently
started seeing — the only genuine blue-ocean source available without paying.

| # | Seed | siteUrl |
|---|---|---|
| 17 | `dental implant cost` | `https://dentistryguides.com` |
| 18 | `equine liability waiver` | `https://horselegalguide.com` |
| 19 | `ai executive coach` | `https://billionairehighperformancecoach.com` |
| 20 | `virtual event platform` | `https://virtualagency-os.com` |
| 21 | `uscis medical exam` | `https://uscisexam.com` |
| 22 | `adhd evaluation for adults` | `https://neuroevalguides.com` |

---

## Also free, also unread: AI Performance

The Bing sidebar carries an **AI Performance (BETA)** section. `local-guides-citation-velocity/data/signals/bing_webmaster_baseline.json`
already pulled the headline from it — 19 Copilot citations in 3 months across the portfolio
(`spryexecutiveos.com` 8, `theindustryguides.com` 5, `horselegalguide.com` 4,
`virtualagency-os.com` 2, others 0) — and notes that grounding-query detail returns "No data
available" at this volume.

Re-check that tab per property before the next probe run. If any property crosses whatever
threshold unlocks the query breakdown, it becomes the only *real* measurement of answer-engine
citation the portfolio has — and it would replace the `granite-4.0-h-micro` probe in
`data/signals/llm_citation_observations.json`, whose citation lists are a micro-model's output and
should not be read as retrieval evidence.

---

## Recording rule

Every number pulled from Bing should land in a file with:

```
"source": "Bing Webmaster Tools Keyword Research",
"site_url": "<the siteUrl used>",
"measured_at": "<ISO date>",
"window": "<the window Bing displayed>"
```

`local-guides-citation-velocity/data/signals/bing_webmaster_baseline.json` already does this
correctly and is the model to copy. Without the window and the siteUrl, an impressions figure is
indistinguishable from a modelled one six weeks later.
