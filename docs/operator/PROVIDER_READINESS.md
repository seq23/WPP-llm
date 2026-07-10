# Provider Readiness

| Provider | Purpose | Credential | Missing behavior |
|---|---|---|---|
| GitHub Actions | CI and autonomous writers | GitHub token | workflows unavailable |
| Google Search Console | query and performance signals | `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL` | continue with zero-cost/manual signals |
| Gemini | optional research expansion | `GEMINI_API_KEY` | skip Gemini and continue |
| IndexNow | URL submission | existing key/variable | record provider unavailable; do not claim submission |
| Cloudflare Pages | deploy | project integration | build can pass; deployment remains unproven |

Provider states: READY_NOT_SUBMITTED, PROVIDER_UNAVAILABLE, SUBMITTED, ACCEPTED, REJECTED, RETRY_SCHEDULED.
