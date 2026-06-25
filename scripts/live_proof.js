#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const outDir = path.join(ROOT, 'logs', 'live-proof');
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.PUBLIC_SITE_URL || 'https://virtualagency-os.com';
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seo/priority_pages.json'), 'utf8')).pages.slice(0, 15);
const urls = [base + '/', base + '/sitemap.xml', base + '/robots.txt', ...pages.map((p) => base + p.path)];
(async () => {
  const results = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      results.push({ url, status: res.status, ok: res.status >= 200 && res.status < 400, final_url: res.url });
      console.log(`${res.status} ${url}`);
    } catch (err) {
      results.push({ url, status: 0, ok: false, error: err.message });
      console.log(`ERROR ${url}: ${err.message}`);
    }
  }
  fs.writeFileSync(path.join(outDir, 'live-proof-results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`Live proof failed for ${failed.length} URLs`);
    process.exit(1);
  }
  console.log(`Live proof OK (${results.length} URLs)`);
})();
