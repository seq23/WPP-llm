# Retired URLs: HTTP 301s

`update_redirects_clean_to_html.js` combines the prune ledger with legacy rules,
resolves targets to their final page, writes `data/redirects/consolidation_map.json`
and keeps the highest priority static rules within the `_redirects` budget.
The root Pages Function imports the complete map and handles clean, trailing-slash
and `.html` retired paths in one 301, preserving query strings. Unmapped requests
pass unchanged to `next()` for static assets. The generated `_routes.json` excludes
fixed inquiry routes and literal aliases so their static rules still apply.
The assembler excludes both retired HTML and Function source; it creates no stubs.
Pages discovers `functions/` at the project root, outside `.pages-output`.

`test:prune` exercises the real middleware for every map entry, checks ledger
coverage, and requires every target to be an unpruned deployed 200 with no next
redirect. Missing-entry, chain and loop mutations must fail the same check.
The static edge test preserves the exact static response for every sitemap page.
This supersedes the refresh-stub limitation recorded in the 2 November audit.
