#!/usr/bin/env bash
set -euo pipefail

# Credential-safe distribution wrapper.
# It never fails just because optional credentials are missing.
# It does fail for malformed local artifacts because those are repo defects.

HOST=""
KEY=""
ARTIFACT_DIR=""
GSC_CREDS=""
GSC_SITE_URL=""
ALLOW_MIXED="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?}"; shift 2 ;;
    --key) KEY="${2:?}"; shift 2 ;;
    --artifact-dir) ARTIFACT_DIR="${2:?}"; shift 2 ;;
    --creds) GSC_CREDS="${2:?}"; shift 2 ;;
    --gsc-site) GSC_SITE_URL="${2:?}"; shift 2 ;;
    --allow-mixed) ALLOW_MIXED="1"; shift 1 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$ARTIFACT_DIR" ]]; then
  if [[ -f ".build/indexnow-priority.txt" && -f ".build/indexnow-batch.txt" ]]; then
    ARTIFACT_DIR=".build"
  elif [[ -f "dist/indexnow-priority.txt" && -f "dist/indexnow-batch.txt" ]]; then
    ARTIFACT_DIR="dist"
  else
    echo "ERROR: could not detect artifact dir (.build or dist)" >&2
    exit 1
  fi
fi

PRIORITY_FILE="${ARTIFACT_DIR}/indexnow-priority.txt"
BATCH_FILE="${ARTIFACT_DIR}/indexnow-batch.txt"
[[ -f "$PRIORITY_FILE" ]] || { echo "ERROR: missing $PRIORITY_FILE" >&2; exit 1; }
[[ -f "$BATCH_FILE" ]] || { echo "ERROR: missing $BATCH_FILE" >&2; exit 1; }

if [[ -z "$HOST" ]]; then
  HOST="virtualagency-os.com"
fi

mkdir -p "${ARTIFACT_DIR}"

cat > "${ARTIFACT_DIR}/distribution-summary.json" <<JSON
{
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "host": "$HOST",
  "artifact_dir": "$ARTIFACT_DIR",
  "indexnow_configured": $( [[ -n "$KEY" ]] && echo true || echo false ),
  "gsc_configured": $( [[ -n "$GSC_CREDS" && -n "$GSC_SITE_URL" && -f "$GSC_CREDS" ]] && echo true || echo false )
}
JSON

echo "== Distribution config =="
echo "HOST=$HOST"
echo "ARTIFACT_DIR=$ARTIFACT_DIR"
echo "INDEXNOW_CONFIGURED=$( [[ -n "$KEY" ]] && echo yes || echo no )"
echo "GSC_CONFIGURED=$( [[ -n "$GSC_CREDS" && -n "$GSC_SITE_URL" && -f "$GSC_CREDS" ]] && echo yes || echo no )"
echo

if [[ -n "$GSC_CREDS" && -n "$GSC_SITE_URL" && -f "$GSC_CREDS" ]]; then
  echo "== 1) Submit Google sitemap =="
  python3 distribution_scripts/gsc_submit_sitemaps.py "$GSC_CREDS" "$GSC_SITE_URL" "https://${HOST}/sitemap.xml"
else
  echo "== 1) Submit Google sitemap =="
  echo "SKIP: GSC credentials/site not configured."
fi

echo
if [[ -n "$KEY" ]]; then
  echo "== 2) Submit IndexNow priority URLs =="
  if [[ "$ALLOW_MIXED" == "1" ]]; then
    bash distribution_scripts/indexnow_submit.sh --host "$HOST" --key "$KEY" --file "$PRIORITY_FILE" --allow-mixed
  else
    bash distribution_scripts/indexnow_submit.sh --host "$HOST" --key "$KEY" --file "$PRIORITY_FILE"
  fi
  echo
  echo "== 3) Submit IndexNow batch URLs =="
  if [[ "$ALLOW_MIXED" == "1" ]]; then
    bash distribution_scripts/indexnow_submit.sh --host "$HOST" --key "$KEY" --file "$BATCH_FILE" --allow-mixed
  else
    bash distribution_scripts/indexnow_submit.sh --host "$HOST" --key "$KEY" --file "$BATCH_FILE"
  fi
else
  echo "== 2-3) Submit IndexNow URLs =="
  echo "SKIP: INDEXNOW_KEY not configured."
fi

echo
if [[ -n "$GSC_CREDS" && -n "$GSC_SITE_URL" && -f "$GSC_CREDS" ]]; then
  echo "== 4) Inspect priority URLs in GSC API =="
  python3 distribution_scripts/gsc_inspect_urls.py "$GSC_CREDS" "$GSC_SITE_URL" "$PRIORITY_FILE" "${ARTIFACT_DIR}/inspection-results.json"
else
  echo "== 4) Inspect priority URLs in GSC API =="
  echo "SKIP: GSC credentials/site not configured."
fi

echo
if [[ -n "$GSC_CREDS" && -n "$GSC_SITE_URL" && -f "$GSC_CREDS" && -f "data/seo/benchmark_query_panel.json" ]]; then
  echo "== 5) Pull $0 Search Console query performance =="
  python3 distribution_scripts/gsc_query_performance.py "$GSC_CREDS" "$GSC_SITE_URL" "data/seo/benchmark_query_panel.json" "logs/query-testing/gsc-query-performance.json"
else
  echo "== 5) Pull $0 Search Console query performance =="
  echo "SKIP: GSC credentials/site or query panel not configured."
fi

echo "Done."
