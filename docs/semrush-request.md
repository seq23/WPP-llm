# SEMrush request — exactly what to export, and why

**Requested:** 2026-08-26. **Estimated time:** 25–35 minutes.
**Read `docs/query-coverage/measurement-plan.md` first** — it lists 22 lookups that are free in Bing
Webmaster Tools. Nothing below duplicates them.

---

## The split, so it is obvious what came from where

| Number | Source | Cost |
|---|---|---|
| Search volume | **Bing Webmaster Tools** — impressions per keyword, with country split | free |
| Related keywords + impressions | **Bing** — Related keywords tab, Download all | free |
| Literal question phrasings | **Bing** — Question keywords tab | free |
| Emerging queries | **Bing** — Newly discovered tab | free |
| Live top-10 SERP for a seed | **Bing** — top-10 URL ranking panel | free |
| AI/Copilot citation counts | **Bing** — AI Performance (BETA) | free |
| **Keyword Difficulty (KD)** | **SEMrush only** | ← this request |
| **Competitor organic keyword overlap / gap** | **SEMrush only** | ← this request |
| **SERP feature presence (AI Overview, PAA, featured snippet)** | **SEMrush only** | ← this request |
| **Search intent classification** | **SEMrush only** | ← this request |

Bing gives us *how many*. SEMrush is being asked only for *how hard*, *who else*, and *what the SERP
looks like*. Every export below is scoped to a decision that is currently blocked on one of those
three.

---

## Why this is needed at all

Portfolio-wide, measured: **~9,900 Google impressions, 1 click, median position ~70**
(`docs/query-coverage/demand-reality-check.md`). We know demand exists. We do not know whether the
queries we rank at position 70 for are ones a site with 0 backlinks can ever win. **KD is the number
that decides whether to consolidate toward a query or abandon it** — and it is the only number in
this programme that cannot be measured for free.

Nothing here should be filled in by estimate. If a report returns no data for a row, leave it blank.
A blank is more useful than a guess.

---

## Export 1 — Keyword Difficulty for the 12 queries a decision depends on

**Tool:** Keyword Overview (bulk). Paste all 12 at once. **Database: US.**
**Columns needed:** `Keyword`, `Volume`, `KD %`, `Intent`, `SERP Features`, `CPC`.

```
hormone replacement therapy near me
trt cost per month
dental implant cost
how much do dental implants cost
civil surgeon near me
uscis civil surgeon
horse boarding contract
horse bill of sale
ai coaching platform
best ai coaching software
virtual event production
hybrid event platform
```

**The decision each one blocks:**

| Keyword | Our measured position | Decision blocked on KD |
|---|---|---|
| `hormone replacement therapy near me` | no page (volume 8,100 in our evidence) | Build a page, or accept this is a local-pack query we cannot win with a national guide? |
| `trt cost per month` | no page | Is the cost-data pattern (`realdentalcosts.com`'s winning shape) viable in TRT? |
| `dental implant cost` | not in Bing top 10 | Bing shows `realdentalcosts.com` at 2 and 3. Can we displace, or is this a defended SERP? |
| `how much do dental implants cost` | — | Question phrasing may be materially easier than the commercial one. KD gap between these two rows is the whole answer. |
| `civil surgeon near me` / `uscis civil surgeon` | 97 and 96 pages already matching | Volume 2,400 and 5,400. If KD is low this is the portfolio's best asset and should be consolidated to one page immediately. |
| `horse boarding contract` | no page (volume 320) | One of only two new pages recommended anywhere. KD confirms or kills it. |
| `horse bill of sale` | 16 impr, pos 54.1 | Our single strongest equine signal. Worth consolidating toward? |
| `ai coaching platform` | 28 impr, pos 92.8 | 73% of sprylabs' measured queries have no page. KD says whether that is a mistake or a mercy. |
| `best ai coaching software` | 15 impr, pos 80.8 | Same. |
| `virtual event production` | 883 impr, pos 63.3 | Largest single impression count in the portfolio. Position 63 with 883 impressions is either a near-miss or a hopeless SERP. |
| `hybrid event platform` | 893 impr, pos 74.6 | Same, and it is our highest-impression query overall. |

---

## Export 2 — Keyword Gap, five runs

**Tool:** Keyword Gap. **Database: US.** Set to **"Missing"** and **"Weak"** tabs.
**Columns needed:** `Keyword`, `Volume`, `KD %`, `Intent`, `SERP Features`, plus each domain's position.

Competitors below are not guesses. Each was either recorded as cited in a grounded probe run
(`data/signals/llm_citation_observations.json`) or observed in Bing's live top-10 for one of our
seeds.

**Run 2a — dentistry / cost**
```
theindustryguides.com
realdentalcosts.com
dentillo.com
toothprice.com
dentalcostfinder.com
```
*Why these:* `realdentalcosts.com` holds Bing positions 2 and 3 for `dental implant cost`;
`dentillo.com` position 5. `toothprice.com` and `dentalcostfinder.com` were cited in the probe.
*Decision:* we have 511 dentistry pages and 5 measured impressions. This tells us which cost queries
they hold that we do not — and the "Weak" tab tells us where we already rank but badly.

**Run 2b — equine legal**
```
horselegalguide.com
equinelegalsolutions.com
legaltemplates.net
uslegalforms.com
legalclarity.org
```
*Why these:* all five recorded as cited for equine queries in the probe.
*Decision:* 99.3% of this repo's declared page targets have no measured demand. The Missing tab is
the fastest route to a target list that does.

**Run 2c — virtual events**
```
virtualagency-os.com
kinura.com
cvent.com
bizzabo.com
vfairs.com
```
*Why these:* cited in the probe for `virtual event production companies`.
*Decision:* WPP-llm carries 8,630 of the portfolio's 9,900 impressions. If Cvent and Bizzabo own
this space at high KD, the 3,052 programmatic pages need repointing at long-tail, not consolidating
at the head.

**Run 2d — AI coaching**
```
billionairehighperformancecoach.com
coachhub.com
coachvox.ai
the-coach.ai
circle.so
```
*Why these:* cited in the probe for `ai coaching tools`.
*Decision:* 52 of 71 measured queries have no page. Which of them are actually winnable?

**Run 2e — community operations**
```
virtualagency-os.com
feverbee.com
cmxhub.com
communityroundtable.com
higherlogic.com
```
*Why these:* cited in the probe for `community as a service`.
*Decision:* WPP-llm's largest page clusters are community-themed
(`community-building-for-brands` 50 pages, `community-as-a-service` 49, and so on) and **none of
them are in the probe config** — `data/signals/citation_probe_config.json` points at
`data/seo/priority_queries.json`, which holds 11 queries, all events. This run is the only way to
find out whether that entire content investment sits against real demand.

---

## Export 3 — Organic Research, five domains, to size the ceiling

**Tool:** Organic Research → Positions. **Database: US.**
**Columns needed:** `Keyword`, `Position`, `Volume`, `KD %`, `Traffic %`, `URL`, `SERP Features`.
**Filter:** positions 1–20 only. **Limit:** top 200 rows per domain is plenty.

```
realdentalcosts.com
equinelegalsolutions.com
kinura.com
coachvox.ai
feverbee.com
```

*Why:* one competitor per vertical, chosen because each is a **comparable-scale independent site**
rather than an enterprise incumbent — the realistic ceiling, not the aspirational one. What we need
is the shape: how many keywords does a site like `realdentalcosts.com` actually rank top-20 for,
at what KD, and on what URL pattern. That number sets the target for what ~10,500 pages *should*
be producing, against the 1 click they currently produce.

Also capture, if the tool shows it: **each domain's referring-domain count.** Our
`theindustryguides.com` has **0 backlinks** (Bing-confirmed, by design — the authority network links
`rel="sponsored nofollow"`). If the competitors ranking above us have hundreds, KD is not the
binding constraint and no amount of query selection will fix it. That single comparison may be the
most decision-relevant thing in this whole request.

---

## Export 4 — SERP features on the head terms

**Tool:** Keyword Overview, same 12 keywords as Export 1.
**Specifically needed:** does each SERP carry an **AI Overview**, a **Featured Snippet**, **People
Also Ask**, or a **Local Pack**?

*Why:* this programme is built for answer-engine citation. If `hormone replacement therapy near me`
returns a Local Pack, a national guide page cannot win it and the volume-8,100 gap is a mirage. If
`how much do dental implants cost` returns an AI Overview, the target is citation inside that
overview, not position 1 — which is a different content shape and a different success metric.

---

## Marked NEEDS_SEMRUSH elsewhere in this analysis

For traceability, the exact queries flagged `NEEDS_SEMRUSH` in
`docs/query-coverage/blue-ocean.md` are all present in Export 1 or will be produced by Export 2's
Missing tab. No separate list is needed.

---

## Delivery

CSV is ideal. Drop the files anywhere readable and name them by export number
(export-1-kd.csv, export-2a-gap-dentistry.csv, and so on). Keep SEMrush's own column headers — do not
tidy them.

**Please do not fill in blanks.** If a keyword returns no KD, leave the cell empty. Every number in
this analysis is traceable to a source and a date, and one estimated cell would break that.
