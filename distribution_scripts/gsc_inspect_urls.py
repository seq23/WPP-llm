#!/usr/bin/env python3
import json, os, datetime
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

def load_urls(path):
    urls = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("http://") or line.startswith("https://"):
                urls.append(line)
    return urls

def main():
    if len(sys.argv) != 5:
        print("Usage: gsc_inspect_urls.py <service-account.json> <siteUrl> <urlFile> <outputJson>")
        sys.exit(1)

    creds_path = sys.argv[1]
    site_url = sys.argv[2]
    url_file = sys.argv[3]
    output_json = sys.argv[4]

    scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
    service = build("searchconsole", "v1", credentials=creds)

    urls = load_urls(url_file)

    # Inspecting every priority URL on every run cost 19 minutes of a 19.5 minute
    # job - 177 URLs at roughly 6.5s each against the URL Inspection API, five times
    # a day. Index status does not change minute to minute, so almost all of that
    # was re-asking Google a question it had already answered.
    #
    # Cache by URL with a TTL and cap each run, least-recently-inspected first.
    # Coverage is unchanged over a couple of days; wall clock drops by an order of
    # magnitude and the daily inspection quota stops being burned on no-op checks.
    cache_path = os.environ.get("GSC_INSPECTION_CACHE", "data/seo/gsc_inspection_cache.json")
    ttl_days = int(os.environ.get("GSC_INSPECTION_TTL_DAYS", "7"))
    limit = int(os.environ.get("GSC_INSPECTION_LIMIT", "50"))

    cache = {}
    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as fh:
                cache = json.load(fh).get("entries", {})
        except Exception:
            cache = {}

    now = datetime.datetime.now(datetime.timezone.utc)
    def age_days(u):
        ts = (cache.get(u) or {}).get("inspected_at")
        if not ts:
            return 10**6
        try:
            return (now - datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))).days
        except Exception:
            return 10**6

    stale = [u for u in urls if age_days(u) >= ttl_days]
    stale.sort(key=age_days, reverse=True)
    due = stale[:limit]
    skipped = len(urls) - len(due)

    fresh = {}
    for url in due:
        print(f"Inspecting: {url}", flush=True)
        body = {"inspectionUrl": url, "siteUrl": site_url, "languageCode": "en-US"}
        resp = service.urlInspection().index().inspect(body=body).execute()
        fresh[url] = resp
        cache[url] = {"inspected_at": now.isoformat().replace("+00:00", "Z"), "result": resp}

    # Emit a complete picture: freshly inspected results plus cached ones for URLs
    # still inside their TTL. Downstream consumers see every priority URL either way.
    results = []
    for url in urls:
        if url in fresh:
            results.append(fresh[url])
        elif (cache.get(url) or {}).get("result"):
            results.append(cache[url]["result"])

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"schema_version": "1.0", "updated_at": now.isoformat().replace("+00:00", "Z"), "ttl_days": ttl_days, "entries": cache}, f, indent=2)

    print(f"Wrote {len(results)} inspection results to {output_json}")
    print(f"GSC inspection: inspected={len(due)} skipped_fresh={skipped} ttl_days={ttl_days} limit={limit}")

if __name__ == "__main__":
    main()
