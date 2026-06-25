# GitHub Actions Operating Spine

Status: active
Date: 2026-06-25

## Why this exists

The repo now performs strategy-gated SEO/citation operations, release planning, distribution pings, Search Console reporting, and zero-cost query testing. A single monolithic workflow is technically possible, but it is operationally fragile: one YAML error, missing credential, or external API outage can block everything.

The Actions spine is therefore split by responsibility.

## Workflows

### `ci.yml`

Runs on push, pull request, and manual dispatch.

Purpose:
- validate GitHub workflow YAML
- install dependencies
- build the static site
- run the full local/container prepush validation suite

This is the hard gate.

### `citation-ops.yml`

Runs weekly and manually.

Purpose:
- regenerate strategy-gated release artifacts
- regenerate IndexNow URL batches
- generate the zero-cost query testing packet
- commit regenerated artifacts only when files actually change

This replaces blind daily draft publishing.

### `distribution.yml`

Runs after CI succeeds on `main`, and manually.

Purpose:
- rebuild release artifacts
- check credentials without printing secret values
- submit IndexNow URLs only when `INDEXNOW_KEY` exists
- submit sitemap / inspect URLs / pull query performance only when GSC credentials exist
- upload evidence artifacts

Missing credentials produce SKIP, not failure.

### `credential-check.yml`

Runs manually and weekly.

Purpose:
- confirm whether `INDEXNOW_KEY` exists and has a safe shape
- confirm whether `GSC_SERVICE_ACCOUNT_JSON` parses as a service account
- confirm whether `GSC_SITE_URL` has an accepted Search Console property shape
- write evidence without exposing secret values

### `zero-cost-query-testing.yml`

Runs monthly and manually.

Purpose:
- generate the benchmark query panel
- generate the manual citation logging CSV
- optionally pull Search Console query performance if GSC credentials exist

This is the $0 query testing lane. It does not claim paid AI citation telemetry.

## Credential-bound items

The repo can automate only after credentials are present in GitHub Actions secrets.

Required for IndexNow:
- `INDEXNOW_KEY`

Required for Search Console API:
- `GSC_SERVICE_ACCOUNT_JSON`
- `GSC_SITE_URL`

Recommended variable:
- `PUBLIC_SITE_URL` = `https://virtualagency-os.com`

## Design rule

Credential-bound steps must be SKIP-safe. A missing optional credential cannot fail CI or block deployment validation.

Repo defects still fail hard:
- broken YAML
- broken build
- missing priority pages
- broken sitemap
- broken internal links
- malformed release plan
- malformed backlink remediation packet
