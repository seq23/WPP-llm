#!/usr/bin/env bash
set -euo pipefail

# GitHub Actions runtime npm hardening.
# Forces public npm registry and retries package fetches so workflows do not
# inherit internal/proxy registries from generated lockfiles, runner config, or cache.

PUBLIC_REGISTRY="https://registry.npmjs.org/"
INSTALL_MODE="${CI_NPM_INSTALL_MODE:-online}"

export npm_config_registry="$PUBLIC_REGISTRY"
export NPM_CONFIG_REGISTRY="$PUBLIC_REGISTRY"
export npm_config_fetch_retries=5
export npm_config_fetch_retry_mintimeout=20000
export npm_config_fetch_retry_maxtimeout=120000
export npm_config_fetch_timeout=300000
export npm_config_prefer_offline=false
export npm_config_progress=false
export npm_config_audit=false
export npm_config_fund=false

npm config delete proxy >/dev/null 2>&1 || true
npm config delete https-proxy >/dev/null 2>&1 || true

echo "npm registry forced to: $PUBLIC_REGISTRY"
if grep -R "packages.applied-caas\|artifactory/api/npm\|internal.api.openai" package-lock.json package.json .npmrc 2>/dev/null; then
  echo "ERROR: package metadata contains internal/proxy npm registry URL" >&2
  exit 1
fi

npm_ci_cmd=(
  npm ci
  --registry="$PUBLIC_REGISTRY"
  --fetch-retries=5
  --fetch-retry-mintimeout=20000
  --fetch-retry-maxtimeout=120000
  --fetch-timeout=300000
  --prefer-online
  --no-audit
  --no-fund
)

if [[ "$INSTALL_MODE" == "offline" ]]; then
  echo "npm install mode: offline validation"
  npm ci --offline --no-audit --no-fund
  exit 0
fi

for attempt in 1 2 3; do
  echo "npm ci attempt ${attempt}/3"
  if timeout 300s "${npm_ci_cmd[@]}"; then
    exit 0
  fi
  code=$?
  echo "WARNING: npm ci attempt ${attempt}/3 failed with exit code ${code}" >&2
  sleep $((attempt * 10))
done

echo "Attempting npm offline fallback from cache" >&2
npm ci --offline --no-audit --no-fund
