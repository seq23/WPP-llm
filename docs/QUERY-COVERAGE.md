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
