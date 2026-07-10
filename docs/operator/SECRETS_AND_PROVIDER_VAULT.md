# Secrets and Provider Vault

GitHub Secrets: `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL`, `INDEXNOW_KEY`, optional `GEMINI_API_KEY`.
GitHub Variables: optional `PUBLIC_SITE_URL`, `GSC_SITE_URL`, `INDEXNOW_KEY`.
Never store plaintext secrets in the repo. Credential Check reports presence/readiness only. Provider calls must emit receipts and may not claim submission without one. Rotate secrets in the provider and GitHub, then rerun Credential Check.
