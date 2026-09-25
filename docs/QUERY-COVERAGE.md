# Query coverage: missing search questions (2026-09-25)

These questions are really asked. Each source below shows the phrasing in live search results. No page on
virtualagency-os.com answers any of them: each was checked against the live sitemap (2,709 URLs) and
`data/queries/evidence/evidence_queries.json`.

## Why they are listed here and not in the queue

This repo's page queue is `data/demand/measured_demand.json`, which `scripts/lib/demand_gate.js` guards.
The gate admits a record in only two cases:

- the record carries a measured `search_volume` or `impressions_90d` above zero, or
- the record is an `owner_approved_seed` with an `approved_by`.

A research-only phrasing (evidence tier T3, no volume) is refused. This was tested on 2026-09-25: adding these
rows as T3 evidence made `npm run validate:all` fail at `demand_gate`. That is the gate working as designed, so
it was not loosened. To get each question into the queue, do one of these:

1. Measure the question as a Bing Webmaster Tools Keyword Research seed (free, about a minute per seed; the
   method is in `docs/query-coverage/measurement-plan.md`), then add it to `measured_demand.json` with the
   measured figure.
2. Have the owner approve it as an `owner_approved_seed`.

| # | query | source |
|---|---|---|
| 1 | webinar vs virtual event, what is the difference | https://www.cvent.com/en/blog/events/difference-between-virtual-event-and-webinar |
| 2 | how to increase webinar attendance | https://www.cvent.com/en/blog/events/how-to-increase-webinar-attendance |
| 3 | what equipment do i need to live stream an event | https://elitemultimedia.com/virtual-event-production/ |
| 4 | zoom events vs on24 for webinars | https://learn.g2.com/best-virtual-event-platforms |
| 5 | how long should a webinar be | https://www.demio.com/blog/webinars-vs-virtual-events |
| 6 | virtual event ideas for employees | https://www.airmeet.com/hub/blog/webinars-vs-virtual-events-understanding-the-key-differences/ |
| 7 | virtual event vs in person event cost | https://vimeo.com/blog/post/virtual-event-budget |

## Measurement, 2026-09-25

All seven questions were measured through this repo's existing lanes. None passed `scripts/lib/demand_gate.js`, so
none was added to `data/demand/measured_demand.json`. The gate was not loosened and no owner seed was written.

| # | query | measured search volume (keyword tool) | measured GSC impressions_90d | result |
|---|---|---|---|---|
| 1 | webinar vs virtual event, what is the difference | not measurable (named stop below) | **0** | below threshold |
| 2 | how to increase webinar attendance | not measurable | **0** | below threshold |
| 3 | what equipment do i need to live stream an event | not measurable | **0** | below threshold |
| 4 | zoom events vs on24 for webinars | not measurable | **0** | below threshold |
| 5 | how long should a webinar be | not measurable | **0** | below threshold |
| 6 | virtual event ideas for employees | not measurable | **0** | below threshold |
| 7 | virtual event vs in person event cost | not measurable | **0** | below threshold |

- **GSC lane** (`scripts/queries/ingest_gsc_evidence.py`, run by `query-intelligence.yml`, T1): the live ingest at
  2026-09-25T19:19:37Z for `sc-domain:virtualagency-os.com`, window 2026-06-25..2026-09-23, returned 515 query rows
  (row limit 5,000, so not truncated). None of the seven appears in `data/queries/evidence/evidence_queries.json` or
  `data/authority_scale/query_atlas.json`, so each measured 0 impressions. The gate needs a value above zero.
- **Keyword-tool lane** (Bing Webmaster Tools Keyword Research per `docs/query-coverage/measurement-plan.md`, T2a):
  the earlier named stop is cleared. The key is in the credential vault as `bing-webmaster-api-key` and in this repo's
  GitHub secrets as `BING_WEBMASTER_API_KEY` (both set 2026-09-25). The measurement is in the next section.

## Bing keyword measurement, 2026-09-25 (T2a)

Each seed was measured through the Bing Webmaster API `GetKeywordStats` (market `us`/`en-US`, and again with no market
filter). The window is 25 weekly buckets, 2026-03-28..2026-09-19. The sum of weekly `Impressions` is the monthly-volume
proxy. As a control, `webinar` returned non-zero weekly rows in the same call shape. Seeds 1 and 4 were also measured
in shorter form ("webinar vs virtual event", "zoom events vs on24"). The Keyword Research panel in the web UI agreed:
Bing "doesn't have enough data" for these phrasings.

| # | query | Bing impressions, us (26 wk) | Bing impressions, all markets | demand_gate (`search_volume > 0`) | queued |
|---|---|---|---|---|---|
| 1 | webinar vs virtual event, what is the difference | **0** (short form also 0) | **0** | refused | no |
| 2 | how to increase webinar attendance | **0** | **0** | refused | no |
| 3 | what equipment do i need to live stream an event | **0** | **0** | refused | no |
| 4 | zoom events vs on24 for webinars | **0** (short form also 0) | **0** | refused | no |
| 5 | how long should a webinar be | **0** | **0** | refused | no |
| 6 | virtual event ideas for employees | **0** | **0** | refused | no |
| 7 | virtual event vs in person event cost | **0** | **0** | refused | no |

None of the seven clears the gate, so `data/demand/measured_demand.json` is unchanged. A 0 here means the phrasing is
below Bing's reporting floor. It does not prove nobody searches for it. The route that remains is the owner seed.
