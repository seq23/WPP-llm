/**
 * What Cloudflare Pages answers for an internal path, decided from the build
 * output and _redirects rather than from the live domain.
 *
 * Two validators need the same answer, so it lives here once:
 *   - validate_redirect_targets.js: a 301 target must be a page, not another hop.
 *   - validate_no_redirecting_internal_links.js: an internal href must point at
 *     the final URL, not at one Pages answers with a 308.
 *
 * The Pages rules this models (observed on virtualagency-os.com, 25 Sep 2026):
 *   - a _redirects rule matches first and wins over any static file;
 *   - /x.html, when x.html exists, is a 308 to /x (and /x/index.html to /x/);
 *   - /x is served from x.html; when only x/index.html exists it is a 308 to /x/;
 *   - /x/ is served from x/index.html; when only x.html exists it is a 308 to /x;
 *   - any other file (css, xml, txt, json) is served at its own path.
 * Only files the deploy publishes count (isPublishedPath from the assembler),
 * so a file excluded from the deploy resolves to "missing", as it does live.
 */
const fs = require('fs');
const path = require('path');
const { isPublishedPath } = require('../assemble_pages_output.js');

const ROOT = path.resolve(__dirname, '../..');

function parseRedirects(root = ROOT) {
  const file = path.join(root, '_redirects');
  if (!fs.existsSync(file)) return [];
  const rules = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const [from, to, status] = line.split(/\s+/);
    rules.push({ from, to, status: Number(status || 302), line: i + 1 });
  });
  return rules;
}

function ruleMatches(rule, p) {
  if (rule.from.endsWith('/*')) return p.startsWith(rule.from.slice(0, -1));
  return rule.from === p;
}

function isFile(root, rel) {
  if (!rel || !isPublishedPath(rel)) return false;
  const abs = path.join(root, rel);
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

/**
 * Resolve one absolute path ("/a/b", no query or hash).
 * Returns { kind: 'page' } | { kind: 'redirect', to, status, via } | { kind: 'missing' }.
 */
function resolvePath(p, { root = ROOT, rules = parseRedirects(root) } = {}) {
  const rule = rules.find((r) => ruleMatches(r, p));
  if (rule) {
    if (rule.status === 404 || rule.status === 200) return rule.status === 404 ? { kind: 'missing', via: `_redirects line ${rule.line}` } : { kind: 'page' };
    return { kind: 'redirect', to: rule.to, status: rule.status, via: `_redirects line ${rule.line}` };
  }
  const rel = decodeURIComponent(p).replace(/^\//, '');
  if (rel === '' ) return isFile(root, 'index.html') ? { kind: 'page' } : { kind: 'missing' };
  if (rel.endsWith('.html')) {
    if (!isFile(root, rel)) return { kind: 'missing' };
    const clean = rel.endsWith('/index.html') || rel === 'index.html'
      ? `/${rel.slice(0, -'index.html'.length)}`
      : `/${rel.slice(0, -'.html'.length)}`;
    return { kind: 'redirect', to: clean, status: 308, via: 'Pages strips .html' };
  }
  if (rel.endsWith('/')) {
    const dir = rel.slice(0, -1);
    if (isFile(root, `${dir}/index.html`)) return { kind: 'page' };
    if (isFile(root, `${dir}.html`)) return { kind: 'redirect', to: `/${dir}`, status: 308, via: 'Pages drops the slash for a file page' };
    return { kind: 'missing' };
  }
  if (isFile(root, `${rel}.html`)) return { kind: 'page' };
  if (isFile(root, `${rel}/index.html`)) return { kind: 'redirect', to: `/${rel}/`, status: 308, via: 'Pages adds the slash for a directory index' };
  if (isFile(root, rel)) return { kind: 'page' };
  return { kind: 'missing' };
}

/** The served route of a built file: a/b.html -> /a/b, a/index.html -> /a/. */
function routeOfFile(rel) {
  const r = rel.replace(/\\/g, '/');
  if (r === 'index.html') return '/';
  if (r.endsWith('/index.html')) return `/${r.slice(0, -'index.html'.length)}`;
  return `/${r.replace(/\.html$/, '')}`;
}

module.exports = { ROOT, parseRedirects, resolvePath, routeOfFile };
