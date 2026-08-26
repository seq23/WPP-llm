# Query coverage audit — pre-Phase-6 gate

**Date:** 2026-08-26. Read-only audit across the portfolio. No page, generator, template or config
was modified.

## The three questions the gate asked, answered

**1. Are we targeting queries people genuinely make?**
Mostly no. **~1–2% of published pages target a query with measured demand.** The measurement itself
is good — four repos hold real, current Google Search Console pulls, and `keyword_difficulty` was
left null rather than fabricated. The pages were simply built from a combinatorial taxonomy instead.
The cleanest reading comes from the only repo with a complete declared page→query map:
**271 of 273 declared targets (99.3%) have no measured demand.**

**2. Is fan-out coverage sufficient without being excessive?**
Excessive. **Do not expand; the 100k reserve restraint is correct.** In WPP-llm, 134 of 520 queries
are served by more than one route, accounting for 57% of all impressions — one query is split across
24 routes. In horse-legal-guide, 156 of 564 pages carry a duplicate title *and* h1 and each
canonicalises to itself. Recommendation: retire or consolidate ~900–1,100 pages; publish at most 2.

**3. Are we taking the low-competition queries?**
The question is not yet binding. **The portfolio has ~9,900 measured impressions, 1 click, and a
median position of ~70.** A less contested query is worth nothing at position 70. The blue-ocean
list is therefore ordered by how cheaply an existing page can be made to win, not by lowest
competition.

## The finding that outranks all three

Two sites that beat us in retrieval do so on **content shape**, not query selection:

- **Dentistry:** grepped across all 217 of our dentistry pages — **zero contain a dollar figure**.
  Every cited competitor publishes prices; `realdentalcosts.com` holds Bing positions 2 and 3 for
  `dental implant cost`. They permute over data; we permute over synonyms.
- **Equine:** grepped across all 563 pages — **zero mention "download"**. `legaltemplates.net` and
  `uslegalforms.com` rank by handing over the document. We explain what should be in it.

Either fix would move more than the entire keyword list.

## Documents

| File | What it settles |
|---|---|
| `docs/query-coverage/demand-reality-check.md` | Measured vs inferred, per repo, with the classification of every cluster. Also flags three wrong numbers in the tooling. |
| `docs/query-coverage/fan-out-coverage.md` | Cannibalisation evidence, the 100k reserve assessment, and the consolidation list. |
| `docs/query-coverage/blue-ocean.md` | Ranked gap list from real retrieval data, with `NEEDS_BING` / `NEEDS_SEMRUSH` markers. |
| `docs/query-coverage/measurement-plan.md` | 22 free Bing lookups that would each change a decision, with exact URLs. |
| `docs/semrush-request.md` | The paid half — KD, keyword gap, SERP features. Copy-pasteable. |

## Three numbers in the tooling that are wrong

Flagged, not fixed — this audit is read-only and other agents are active in these repos.

1. **WPP-llm atlas** reports `clusters_with_evidence: 68` against `clusters_total: 51`. The 68 is
   inflated by tokenisation artefacts (`west-peak`, `silver-peak`, `livekit`, `side-by`).
2. **sprylabs validator** prints `16/40 clusters`; 16 + 29 reserve-only = 45. Five of the 16 are
   phantom clusters from the `derivedCluster()` fallback. The defensible figure is **11/40**.
3. **The `volume` field holds two incompatible units** — on T1 rows it is our own GSC impressions;
   on T2b rows it is Semrush modelled market volume. `rank_score` sorts on it. Every "highest-volume
   query" claim in the portfolio mixes the two.

Items 1 and 2 share a cause: `derivedCluster()` inventing cluster names from query tokens.

## What was measured live during this audit

One Bing Webmaster Tools lookup completed and recorded with source and date:
**`dental implant cost` — 1,000 impressions**, 25 May – 22 Aug 2026, US 736 / UK 67 / IN 56 / CA 6,
plus ten related keywords with impressions and the live top-10 SERP.
`theindustryguides.com` does not appear in that top 10; `realdentalcosts.com` appears twice.

The remaining 21 lookups could not be run — automated navigation to `bing.com/webmasters` was
blocked by the session permission classifier. `docs/query-coverage/measurement-plan.md` lists the exact URLs so the
operator can run them, and explains the three ways to unblock.
