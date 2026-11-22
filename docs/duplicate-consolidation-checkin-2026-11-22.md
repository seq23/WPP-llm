# Duplicate consolidation check-in, 22 Nov 2026

The target set on 26 Oct 2026 (#51): by 22 Nov, duplicates under 150 and at
least 70% of inspected URLs indexed. It used to be a prose line in
`data/seo/duplicate_family_consolidation.json`; it is now measured by
`scripts/validators/validate_duplicate_consolidation.js` into
`data/seo/duplicate_consolidation_status.json` on every CI run.

## The read (coverage generated 21 Nov 2026, 176 sitemap URLs + 308 priority URLs)

| Gate | Target | Measured | Verdict |
|---|---|---|---|
| Duplicates, "Google chose different canonical" | < 150 | 24 (from 454) | met |
| Duplicates, all duplicate states (+ alternate canonical) | < 150 | 135 | met |
| Indexed share, sitemap set | >= 70% | 16.5% (29 / 176) | missed |
| Indexed share, all inspected | >= 70% | 24.6% (119 / 484) | missed |

(The plan, read on the 10 Nov coverage, had 27 / 138 / 26.2% / 28.1%.)

## What was wrong with "run the consolidation again"

`--plan` selected duplicates by Google's verdict with no condition on when
Google formed it. Every one of the 24 duplicates was last crawled 23 Jul - 9 Sep
2026, before its own content last changed (26 Oct - 3 Nov: page finish, accepted
rewrites, site head). A re-plan would have 301'd 18 kept, rewritten pages on a
verdict about content that no longer exists, and lifted the indexed share only by
shrinking the sitemap. It would also have dropped all 424 earlier retirements
from the ledger (retired URLs are no longer reported as duplicates), taking
their 301s with them.

## What the rule is now

- A duplicate retires only when `lastCrawlTime` is on or after the date its
  content last changed (`data/cadence/lastmod_ledger.json`, else the page's
  `dateModified`). Stale or undated verdicts go to `unresolved` with both dates.
- Retirements already made are carried forward on every re-plan.
- Re-planned today: 424 retired (unchanged), 21 parked as stale, 2 demand
  primaries left up. Nothing served changes.

## Indexed share

Not a repo setting. The validator records it against the 70% floor and does not
fail on it: a red gate would reward shrinking the sitemap. The stale pages are
already announced to IndexNow after every CI run on main
(`build_release_plan.js` writes `.build/indexnow-batch.txt`,
`distribution.yml` submits it). When Google re-crawls a parked page and still
calls it a duplicate, the next `--plan` retires it on fresh evidence.
