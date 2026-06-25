#!/usr/bin/env python3
import datetime as dt
import json
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build


def main():
    if len(sys.argv) != 5:
        print('Usage: gsc_query_performance.py <service-account.json> <siteUrl> <benchmarkPanelJson> <outputJson>')
        sys.exit(1)

    creds_path, site_url, panel_path, output_json = sys.argv[1:]
    panel = json.loads(Path(panel_path).read_text(encoding='utf-8'))
    queries = [q['query'] for q in panel.get('queries', [])]
    end = dt.date.today() - dt.timedelta(days=2)
    start = end - dt.timedelta(days=28)

    scopes = ['https://www.googleapis.com/auth/webmasters.readonly']
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
    service = build('searchconsole', 'v1', credentials=creds)

    body = {
        'startDate': start.isoformat(),
        'endDate': end.isoformat(),
        'dimensions': ['query', 'page'],
        'rowLimit': 25000,
    }
    resp = service.searchanalytics().query(siteUrl=site_url, body=body).execute()
    rows = resp.get('rows', [])
    wanted = {q.lower(): q for q in queries}
    matches = []
    for row in rows:
        keys = row.get('keys', [])
        if not keys:
            continue
        query = keys[0]
        if query.lower() in wanted:
            matches.append({
                'query': query,
                'page': keys[1] if len(keys) > 1 else None,
                'clicks': row.get('clicks', 0),
                'impressions': row.get('impressions', 0),
                'ctr': row.get('ctr', 0),
                'position': row.get('position', 0),
            })

    out = {
        'generated_at': dt.datetime.utcnow().isoformat() + 'Z',
        'site_url': site_url,
        'date_range': {'start': start.isoformat(), 'end': end.isoformat()},
        'matched_rows': len(matches),
        'matches': matches,
        'note': 'Search Console query performance is a $0 signal. It is not the same as paid AI citation telemetry.'
    }
    Path(output_json).parent.mkdir(parents=True, exist_ok=True)
    Path(output_json).write_text(json.dumps(out, indent=2), encoding='utf-8')
    print(f'Wrote {len(matches)} matched query rows to {output_json}')


if __name__ == '__main__':
    main()
