#!/usr/bin/env bash
# Search loop (seq23/search-loop), post-build for virtualagency-os.com. The engine
# runs this only when it published pages. It folds them into the site the same way
# the release lane did: `npm run build` (house head order for questions/ pages,
# site head, link architecture, sitemap, redirects), `cta:attribute` (every West
# Peek Productions link carries its UTM), then records the new /questions/ URLs in
# the cadence ledger as source search_loop - they are paced by the loop itself
# (owner ruling 1 Nov 2026: publish straight away), not by the 2/week cap that
# data/cadence/policy.json still applies to everything else.
set -Eeuo pipefail
npm run build
npm run cta:attribute
node scripts/cadence/record_search_loop_pages.js
