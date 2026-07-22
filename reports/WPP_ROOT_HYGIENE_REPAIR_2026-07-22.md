# WPP Root Hygiene Repair Receipt

Date: 2026-07-22

## Implemented

- Moved generated authority HTML pages from repository root into `programmatic/`.
- Kept only true top-level navigation/operator pages at root.
- Updated route data, sitemap/canonical inputs, and priority-page data to the new `/programmatic/*` route contract.
- Added a root hygiene validator so future releases cannot silently flatten generated pages back into root.
- Updated release generators so future programmatic creates write to `programmatic/` instead of root.

## Counts

- Moved generated root HTML files: 1280
- Root HTML files after cleanup: 10
- Programmatic HTML files after cleanup: 1280

## Validator Rule

Validators now enforce the user-approved repo shape instead of requiring root clutter.
