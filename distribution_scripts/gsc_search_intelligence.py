#!/usr/bin/env python3
"""Search Console intelligence for virtualagency-os.com, committed daily.

Writes under data/search_intelligence/:
  search_analytics_28d.json  rolling 28-day Search Analytics, dimensions query x page
  gsc_truth.json             rolling 28-day query and page dimensions asked for separately
                             (Search Console withholds the query on low-volume rows, so a page
                             with impressions can have no query x page row at all), plus a
                             query_history and page_history that are additive and never shrink,
                             so a target does not lose its redirect when it leaves the window
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

    # 1b. The page and query dimensions on their own, plus a history that never
    # forgets.
    #
    # WHY THIS EXISTS. Both collectors in this repo only ever asked for
    # ['query', 'page']. Search Console withholds the query on low-volume rows,
    # so a page can carry impressions for a whole quarter and still have no
    # surviving query x page row. Those pages were invisible to
    # scripts/build_measured_404_redirects.js, which is why 42 root-level URLs
    # that Google measured in the last 90 days were still answering 404 on
    # 26 Oct 2026 while their /programmatic/ twin was live. Asking for the page
    # dimension on its own is what makes them visible.
    #
    # The history is the other half: a query or page that drops out of the
    # rolling 28 days has not stopped mattering, and a redirect it earned must
    # not evaporate when it ages out of the window. first_seen is kept,
    # last_seen advances, and impressions_best_window is the largest single
    # window we have ever measured, so the number never double-counts
    # overlapping windows.
    def dim_rows(dimension, start_date, end_date):
        out, row = [], 0
        while True:
            resp = svc().searchanalytics().query(siteUrl=site, body={
                'startDate': start_date.isoformat(), 'endDate': end_date.isoformat(),
                'dimensions': [dimension], 'rowLimit': 25000, 'startRow': row}).execute()
            batch = resp.get('rows', [])
            out += [{dimension: r['keys'][0], 'clicks': r.get('clicks', 0),
                     'impressions': r.get('impressions', 0), 'ctr': round(r.get('ctr', 0), 4),
                     'position': round(r.get('position', 0), 1)} for r in batch]
            if len(batch) < 25000:
                return out
            row += 25000

    start90 = end - dt.timedelta(days=89)
    pages_28 = dim_rows('page', start, end)
    queries_28 = dim_rows('query', start, end)
    pages_90 = dim_rows('page', start90, end)
    for lst, key in ((pages_28, 'page'), (queries_28, 'query'), (pages_90, 'page')):
        lst.sort(key=lambda r: (-r['impressions'], r[key]))

    # Rule 0: a credentialed run that measured nothing is a broken run, not an
    # empty site. 2,721 URLs are in the sitemap and the property has impressions.
    if not pages_28 and not pages_90:
        print('GSC TRUTH FAILED: credentialed run returned zero pages on both the 28-day and 90-day page dimension.')
        sys.exit(1)

    prior = load('gsc_truth.json', {})
    today = end.isoformat()

    def merge_history(prior_rows, key, windows):
        hist = {r[key]: dict(r) for r in prior_rows or []}
        seen_now = set()
        for rows_in in windows:
            for r in rows_in:
                k = r[key]
                seen_now.add(k)
                h = hist.setdefault(k, {key: k, 'first_seen': today, 'windows_seen': 0,
                                        'impressions_best_window': 0, 'best_position': None,
                                        'sources': []})
                h['impressions_best_window'] = max(int(h.get('impressions_best_window') or 0), int(r['impressions']))
                pos = r.get('position') or None
                if pos and (h.get('best_position') is None or pos < h['best_position']):
                    h['best_position'] = pos
                if 'search_console' not in h.get('sources', []):
                    h.setdefault('sources', []).append('search_console')
        for k in seen_now:
            hist[k]['last_seen'] = today
            hist[k]['windows_seen'] = int(hist[k].get('windows_seen') or 0) + 1
        out = list(hist.values())
        out.sort(key=lambda r: (-int(r.get('impressions_best_window') or 0), r[key]))
        return out

    page_history = merge_history(prior.get('page_history'), 'page', [pages_28, pages_90])
    query_history = merge_history(prior.get('query_history'), 'query', [queries_28])

    # The history is additive by contract: it may only ever grow.
    for name, new, was in (('page_history', page_history, prior.get('page_history') or []),
                           ('query_history', query_history, prior.get('query_history') or [])):
        if len(new) < len(was):
            print(f'GSC TRUTH FAILED: {name} shrank from {len(was)} to {len(new)}; the history is additive.')
            sys.exit(1)

    write('gsc_truth.json', {
        '_comment': [
            'Search Console truth for virtualagency-os.com, refreshed daily by '
            'distribution_scripts/gsc_search_intelligence.py (query-intelligence.yml) and committed.',
            'queries/pages are the rolling 28-day window on the query and page dimensions asked for '
            'separately, so pages whose queries Search Console withholds are still measured.',
            'query_history and page_history are additive and never shrink, so a target that leaves the '
            'window keeps the redirect and the ranking it earned.',
            'Read by scripts/build_measured_404_redirects.js; gated by '
            'scripts/validators/validate_gsc_truth.js.',
        ],
        'generated_at': stamp, 'site': site,
        'window': {'days': 28, 'start_date': start.isoformat(), 'end_date': end.isoformat()},
        'window_90d': {'days': 90, 'start_date': start90.isoformat(), 'end_date': end.isoformat()},
        'totals': {'clicks': t.get('clicks', 0), 'impressions': t.get('impressions', 0),
                   'ctr': round(t.get('ctr', 0), 4), 'position': round(t.get('position', 0), 1)},
        'counts': {'queries_28d': len(queries_28), 'pages_28d': len(pages_28),
                   'pages_90d': len(pages_90), 'query_history': len(query_history),
                   'page_history': len(page_history)},
        'queries': queries_28, 'pages': pages_28, 'pages_90d': pages_90,
        'query_history': query_history, 'page_history': page_history})
    print(f'gsc truth: {len(queries_28)} query row(s), {len(pages_28)} page row(s) 28d, '
          f'{len(pages_90)} page row(s) 90d; history {len(query_history)} quer(y/ies), '
          f'{len(page_history)} page(s)')

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
