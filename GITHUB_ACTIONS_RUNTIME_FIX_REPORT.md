# GitHub Actions Runtime Fix Report

## Failure addressed

GitHub Actions CI failed during dependency install because `package-lock.json` pointed the `yaml` package at an internal OpenAI/CAAS npm registry URL. GitHub-hosted runners cannot reliably reach that internal registry, causing `npm ci` to time out before validation could run.

## Fixes

1. Rewrote `package-lock.json` package resolution back to `https://registry.npmjs.org/`.
2. Added `.npmrc` with public npm registry and retry/timeouts.
3. Added `scripts/ci_npm_install.sh` as the only workflow dependency-install path.
4. Updated all five workflows to use the hardened installer and public setup-node registry.
5. Added validator checks that fail if package metadata contains internal/proxy npm registry URLs.
6. Added workflow trace checks that fail if a workflow uses raw `npm ci` instead of the hardened installer.
7. Fixed IndexNow false skipping by allowing distribution to resolve the key from GitHub secret, GitHub variable, or the public repo-hosted key file.
8. Updated credential checks to recognize the repo-hosted IndexNow key file as a valid configured source.

## Runtime expectations

- CI should no longer attempt to fetch packages from `packages.applied-caas-gateway*.internal.api.openai.org`.
- Distribution should show `INDEXNOW_CONFIGURED=yes` when either the GitHub key is present or the repo public key file exists.
- If IndexNow API itself is temporarily unavailable, distribution logs a warning and continues; repo/build defects still fail.

## Validation run

- Hardened installer offline validation passed.
- `npm run actions:validate` passed.
- `npm run validate:workflow-data-trace` passed.
- `npm run release:deep-validate:isolated` passed.
- `npm run validate:all` passed.
- `npm run credentials:check` now reports `INDEXNOW_KEY: present_valid_shape_repo_public_key_file` with no local secret.
- Distribution dry run reached IndexNow submission instead of skipping it.
- `npm run release:prepush:container` passed.
