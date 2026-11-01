#!/usr/bin/env bash
# Search loop (seq23/search-loop), commit for virtualagency-os.com: the shared
# helper validates the exact candidate commit with `npm run release:push-gate`
# (build, validate:all, cadence gate) in a clean clone before it pushes to main.
set -Eeuo pipefail
./.github/scripts/commit_and_push_if_changed.sh "search loop: daily pages, checks and ledger" search-loop
