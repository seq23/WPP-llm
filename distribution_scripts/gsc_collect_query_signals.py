#!/usr/bin/env python3
import json, os, sys, datetime
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'data' / 'signals' / 'gsc_query_signals.json'
out.parent.mkdir(parents=True, exist_ok=True)
site = os.environ.get('GSC_SITE_URL','')
creds_json = os.environ.get('GSC_SERVICE_ACCOUNT_JSON','')
records=[]
status='skipped_missing_credentials'
try:
    if creds_json and site:
        import tempfile
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        info=json.loads(creds_json)
        credentials=service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/webmasters.readonly'])
        service=build('searchconsole','v1',credentials=credentials)
        end=datetime.date.today()-datetime.timedelta(days=2)
        start=end-datetime.timedelta(days=90)
        body={'startDate':start.isoformat(),'endDate':end.isoformat(),'dimensions':['query','page'],'rowLimit':5000}
        resp=service.searchanalytics().query(siteUrl=site, body=body).execute()
        for row in resp.get('rows',[]):
            keys=row.get('keys',[])
            if len(keys)>=2:
                records.append({'query_or_topic':keys[0], 'target_route':keys[1].replace(site.rstrip('/'),'') or '/', 'signal_type':'gsc_query_performance', 'strength':min(100, int(row.get('impressions',0)) + int(row.get('clicks',0))*5), 'impressions':row.get('impressions',0), 'clicks':row.get('clicks',0), 'ctr':row.get('ctr',0), 'position':row.get('position',0), 'observed_at':datetime.datetime.utcnow().isoformat()+'Z', 'actionability':'repair_or_expand'})
        status='collected'
except Exception as e:
    status='collector_error:'+str(e)[:300]
packet={'generated_at':datetime.datetime.utcnow().isoformat()+'Z','status':status,'site_url':site,'records':records}
out.write_text(json.dumps(packet,indent=2), encoding='utf-8')
print(f'GSC query signal collection: {status}; records={len(records)}')
