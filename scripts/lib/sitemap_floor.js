'use strict';
/**
 * The page floor every walker shares: the site's own sitemap, never a fixed
 * page count. Owner ruling 3 Nov 2026: consolidating thousands of look-alike
 * pages into a few hundred distinct ones is what restored Google's trust, so a
 * check that demands "at least N pages" pushes the site back toward volume.
 *
 * RULE 0 still holds: an empty or missing sitemap fails, every listed page must
 * exist as a built file, and every listed page must be among the files the
 * caller examined. A walk that stops reaching the site therefore still fails.
 */
const fs = require('fs');
const path = require('path');

function sitemapPaths(root) {
  const file = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(file)) return [];
  return [...fs.readFileSync(file, 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '') || '/')
    .filter((p) => !/\.xml$/i.test(p));
}

/** The repo-relative files a listed URL path can be served from. */
function candidates(urlPath) {
  const p = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (!p) return ['index.html'];
  if (p.endsWith('/')) return [`${p}index.html`];
  if (/\.html$/.test(p)) return [p];
  return [`${p}.html`, `${p}/index.html`];
}

/**
 * Problems with the floor: [] when every sitemap page is built and examined.
 * `under` limits the floor to listed pages below one path (a step that only
 * reads /programmatic/). `examined` is a list of repo-relative (or absolute under root) file paths.
 */
function sitemapFloorProblems(root, examined, label = 'this check', { under = '/' } = {}) {
  const listed = sitemapPaths(root).filter((p) => p.startsWith(under));
  if (!listed.length) return [`${label}: sitemap.xml lists no pages under ${under}, so the page floor examined nothing`];
  const seen = new Set(examined.map((f) => (path.isAbsolute(f) ? path.relative(root, f) : f).replace(/\\/g, '/').replace(/^\.\//, '')));
  const out = [];
  for (const url of listed) {
    const files = candidates(url);
    const built = files.find((f) => fs.existsSync(path.join(root, f)));
    if (!built) out.push(`${label}: sitemap page ${url} is not built (looked for ${files.join(' or ')})`);
    else if (!seen.has(built)) out.push(`${label}: sitemap page ${url} (${built}) was not examined`);
  }
  if (seen.size < listed.length) out.push(`${label}: examined ${seen.size} page(s); the sitemap lists ${listed.length}`);
  return out;
}

module.exports = { sitemapPaths, sitemapFloorProblems, candidates };
