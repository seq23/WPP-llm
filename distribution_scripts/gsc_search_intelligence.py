#!/usr/bin/env python3
"""Search Console intelligence for virtualagency-os.com, committed daily.

Writes under data/search_intelligence/:
  search_analytics_28d.json  rolling 28-day Search Analytics, dimensions query x page
  index_coverage.json        URL Inspection results for every sitemap URL, refreshed
                             150 per day in rotation (least recently inspected first),
                             8 requests in parallel, with counts by coverageState
  sitemaps.json              sitemaps.list for the property; sitemap.xml is submitted
                             when Google does not list it

Credentials: GSC_SERVICE_ACCOUNT_JSON (the service-account JSON, as a string) and
GSC_SITE_URL (default sc-domain:virtualagency-os.com). Without the credential this
prints a NAMED STOP with the owner step and exits 0 having changed nothing; the
existing files are never overwritten by an uncredentialed run.

Rule 0: a credentialed run that inspects zero URLs or reads a zero-URL sitemap
exits 1.
"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import pathlib
import re
import sys
import threading

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'search_intelligence'
HOST = 'https://virtualagency-os.com'
SITEMAP_URL = f'{HOST}/sitemap.xml'
PER_DAY = int(os.environ.get('GSC_INSPECTION_PER_DAY', '150'))
PARALLEL = int(os.environ.get('GSC_INSPECTION_PARALLEL', '8'))
SCOPES = ['https://www.googleapis.com/auth/webmasters']


def named_stop():
    print('NAMED STOP: GSC_SERVICE_ACCOUNT_JSON is not set for this run. Owner step: add the repository secret '
          'GSC_SERVICE_ACCOUNT_JSON (the gsc-bot service-account JSON used in local-guides-citation-velocity) at '
          'https://github.com/seq23/WPP-llm/settings/secrets/actions and grant that service account Full access to '
          'sc-domain:virtualagency-os.com in Search Console. Existing data/search_intelligence files left unchanged.')
    sys.exit(0)


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, indent=2, sort_keys=False) + '\n', encoding='utf-8')


def load(name, default):
    p = OUT / name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default


def main():
    raw = os.environ.get('GSC_SERVICE_ACCOUNT_JSON', '').strip()
    if not raw:
        named_stop()
    site = os.environ.get('GSC_SITE_URL', '').strip() or 'sc-domain:virtualagency-os.com'
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)
    local = threading.local()

    def svc():
        if not hasattr(local, 's'):
            local.s = build('searchconsole', 'v1', credentials=creds, cache_discovery=False)
        return local.s

    now = dt.datetime.now(dt.timezone.utc)
    stamp = now.isoformat().replace('+00:00', 'Z')

    # 1. Rolling 28-day search analytics, query x page (data lags ~2 days).
    end = (now - dt.timedelta(days=2)).date()
    start = end - dt.timedelta(days=27)
    rows, start_row = [], 0
    while True:
        resp = svc().searchanalytics().query(siteUrl=site, body={
            'startDate': start.isoformat(), 'endDate': end.isoformat(),
            'dimensions': ['query', 'page'], 'rowLimit': 25000, 'startRow': start_row}).execute()
        batch = resp.get('rows', [])
        rows += [{'query': r['keys'][0], 'page': r['keys'][1], 'clicks': r.get('clicks', 0),
                  'impressions': r.get('impressions', 0), 'ctr': round(r.get('ctr', 0), 4),
                  'position': round(r.get('position', 0), 1)} for r in batch]
        if len(batch) < 25000:
            break
        start_row += 25000
    totals = svc().searchanalytics().query(siteUrl=site, body={
        'startDate': start.isoformat(), 'endDate': end.isoformat()}).execute().get('rows', [{}])
    t = totals[0] if totals else {}
    rows.sort(key=lambda r: (-r['impressions'], r['query'], r['page']))
    write('search_analytics_28d.json', {
        'generated_at': stamp, 'site': site, 'start_date': start.isoformat(), 'end_date': end.isoformat(),
        'dimensions': ['query', 'page'],
        'totals': {'clicks': t.get('clicks', 0), 'impressions': t.get('impressions', 0),
                   'ctr': round(t.get('ctr', 0), 4), 'position': round(t.get('position', 0), 1)},
        'row_count': len(rows), 'pages_with_impressions': len({r['page'] for r in rows}),
        'queries_with_impressions': len({r['query'] for r in rows}), 'rows': rows})
    print(f'search analytics: {len(rows)} query x page row(s), {t.get("impressions", 0)} impressions, {start}..{end}')

    # 2. Sitemaps: list, submit sitemap.xml if Google does not have it.
    listed = svc().sitemaps().list(siteUrl=site).execute().get('sitemap', [])
    submitted = None
    if not any(s.get('path') == SITEMAP_URL for s in listed):
        svc().sitemaps().submit(siteUrl=site, feedpath=SITEMAP_URL).execute()
        submitted = SITEMAP_URL
        listed = svc().sitemaps().list(siteUrl=site).execute().get('sitemap', [])
    write('sitemaps.json', {'generated_at': stamp, 'site': site, 'submitted_this_run': submitted, 'sitemaps': listed})
    print(f'sitemaps: {len(listed)} listed; submitted this run: {submitted or "none"}')

    # 3. URL Inspection, rotating PER_DAY URLs, least recently inspected first.
    xml = (ROOT / 'sitemap.xml').read_text(encoding='utf-8')
    urls = re.findall(r'<loc>([^<]+)</loc>', xml)
    if not urls:
        print('index coverage: sitemap.xml lists zero URLs; refusing to report coverage over nothing', file=sys.stderr)
        sys.exit(1)
    cov = load('index_coverage.json', {'urls': {}})
    known = {u: v for u, v in (cov.get('urls') or {}).items() if u in set(urls)}
    # Priority queue, inspected before the rotation: URLs that were measured, then
    # 404d, and now 301 (data/redirects/measured_404_redirects.json plus the dead
    # list in data/seo/consolidation_candidates.json). Each is inspected once,
    # kept under 'priority_urls' so it never skews the sitemap coverage counts.
    pq_file = ROOT / 'data' / 'redirects' / 'measured_404_redirects.json'
    cand_file = ROOT / 'data' / 'seo' / 'consolidation_candidates.json'
    pq = []
    if pq_file.exists():
        pq += [HOST + r['from'] for r in json.loads(pq_file.read_text(encoding='utf-8')).get('rules', [])]
    if cand_file.exists():
        pq += [d['dead_url'] for d in json.loads(cand_file.read_text(encoding='utf-8')).get('dead_urls_with_live_twin', [])]
    prio_known = dict(cov.get('priority_urls') or {})
    prio_due = [u for u in dict.fromkeys(pq) if u not in prio_known][:PER_DAY]
    due = prio_due + sorted(urls, key=lambda u: (known.get(u, {}).get('inspected_at') or '', u))[:PER_DAY - len(prio_due)]
    prio_set = set(prio_due)

    def inspect(u):
        try:
            r = svc().urlInspection().index().inspect(body={'inspectionUrl': u, 'siteUrl': site}).execute()
            s = r.get('inspectionResult', {}).get('indexStatusResult', {})
            return u, {'coverageState': s.get('coverageState', 'UNKNOWN'), 'verdict': s.get('verdict'),
                       'indexingState': s.get('indexingState'), 'pageFetchState': s.get('pageFetchState'),
                       'robotsTxtState': s.get('robotsTxtState'), 'lastCrawlTime': s.get('lastCrawlTime'),
                       'googleCanonical': s.get('googleCanonical'), 'inspected_at': stamp}, None
        except Exception as e:  # keep the URL's previous result; count the error
            return u, None, f'{type(e).__name__}: {str(e)[:160]}'

    errors = []
    with cf.ThreadPoolExecutor(max_workers=PARALLEL) as ex:
        for u, res, err in ex.map(inspect, due):
            if res:
                (prio_known if u in prio_set else known)[u] = res
            else:
                errors.append({'url': u, 'error': err})
    inspected = len(due) - len(errors)
    counts = {}
    for v in known.values():
        counts[v['coverageState']] = counts.get(v['coverageState'], 0) + 1
    write('index_coverage.json', {
        'generated_at': stamp, 'site': site, 'sitemap_url_count': len(urls),
        'rotation': {'per_day': PER_DAY, 'parallel': PARALLEL, 'full_cycle_days': -(-len(urls) // PER_DAY)},
        'inspected_ever': len(known), 'never_inspected': len(urls) - len(known),
        'counts_by_coverage_state': dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        'last_run': {'at': stamp, 'due': len(due), 'inspected': inspected, 'errors': len(errors), 'error_sample': errors[:5]},
        'priority_queue': {'source': 'data/redirects/measured_404_redirects.json + consolidation_candidates dead_urls_with_live_twin',
                           'queued': len(dict.fromkeys(pq)), 'inspected_ever': len(prio_known), 'inspected_this_run': len(prio_due)},
        'priority_urls': dict(sorted(prio_known.items())),
        'urls': dict(sorted(known.items()))})
    print(f'index coverage: inspected {inspected}/{len(due)} this run ({len(errors)} error(s)); {len(known)}/{len(urls)} sitemap URLs have a result; {counts}')
    if inspected == 0:
        print('index coverage: zero URLs inspected this run', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
