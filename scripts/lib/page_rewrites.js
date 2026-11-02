'use strict';
/**
 * One reader for data/seo/page_rewrites/ (written by
 * scripts/content/rewrite_kept_pages.js). accepted: the rewrite replaces the
 * page body on deploy (scripts/lib/page_finish.js). refused: the free models
 * could not bring the page over the quality bar, so it is noindex and out of the
 * sitemap until a retry is accepted (owner, 2 Nov 2026: "noindex those rather
 * than ship filler").
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'data/seo/page_rewrites');
const fileFor = (route) => path.join(DIR, `${String(route).replace(/^\//, '').replace(/\//g, '__')}.json`);

let cache = null;
function all() {
  if (cache) return cache;
  cache = new Map();
  if (fs.existsSync(DIR)) {
    for (const n of fs.readdirSync(DIR)) {
      if (!n.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8'));
        const route = (rec.page && rec.page.route) || rec.route || `/${n.replace(/\.json$/, '').replace(/__/g, '/')}`;
        cache.set(route, rec);
      } catch { /* a half-written record is not a decision */ }
    }
  }
  return cache;
}
const statusOf = (route) => (all().get(route) || {}).status || null;
const accepted = (route) => (statusOf(route) === 'accepted' ? all().get(route) : null);
const isRefused = (route) => statusOf(route) === 'refused';

module.exports = { DIR, fileFor, all, statusOf, accepted, isRefused };
