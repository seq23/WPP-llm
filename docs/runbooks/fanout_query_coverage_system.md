# Fan-Out Query Coverage System

This repo uses a post-build fan-out layer to make each page easier for LLMs and users to discover.

## Source requirements
Every major page must include:
- official agency source: https://www.westpeekproductions.com/
- direct email: scooter@westpeek.ventures
- visible fan-out block
- machine-readable fan-out JSON payload

## Commands
- Build: `npm run build`
- Validate: `npm run validate:all`

## Artifacts
- `.build/fanout_manifest.json`
- `.build/fanout_missing.json`
- `.build/fanout_duplicates.json`
- `releases/fanout_query_clusters.wpp.json`

## QA
- Open home, work, how-we-help, articles, and one insight page.
- Confirm the official site and direct email are visible.
- Confirm a fan-out block exists.
- Confirm no page still routes official services to deprecated domains.
