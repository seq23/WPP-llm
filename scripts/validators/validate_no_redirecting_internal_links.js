#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * REFUSES: an internal href on a published page whose target Cloudflare Pages
 * answers with a redirect instead of the page.
 *
 * Why: the 25 Sep 2026 crawl of virtualagency-os.com found 34 link targets that
 * answered 308. /pillars/community-as-a-service is a directory index, so Pages
 * sends it to /pillars/community-as-a-service/, and 719 pages linked the
 * slashless form. /insights/*.html links were sent to the extensionless URL.
 * Every such link costs a crawler a hop and tells it the link graph is stale.
 * validate_internal_links.js could not see it: it asks "does a file exist for
 * this href", and a file does exist; the href is still not the final URL.
 *
 * The answer to "what does Pages do with this path" comes from
 * scripts/lib/pages_routing.js, which reads the build output and _redirects,
 * so this gate and validate_redirect_targets.js cannot disagree.
 *
 * RULE 0: fewer than MIN_PAGES pages or MIN_LINKS internal hrefs means the scan
 * examined nothing, which is reported as a failure, not a pass.
 */
const fs = require('fs');
const path = require('path');
const { isPublishedPath } = require('../assemble_pages_output.js');
const { ROOT, parseRedirects, resolvePath, routeOfFile } = require('../lib/pages_routing.js');

const HOST = 'virtualagency-os.com';
const SKIP = new Set(['.pages-output', 'node_modules', '.git', '.build', 'logs', 'artifacts']);
const MIN_PAGES = 100;
const MIN_LINKS = 1000;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    if (dir === ROOT && !isPublishedPath(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** The absolute internal path an href points at, or null when it is external. */
function internalPath(href, fromRoute) {
  const h = href.trim();
  if (!h || /^(mailto:|tel:|#|javascript:|data:)/i.test(h)) return null;
  let url;
  try { url = new URL(h, `https://${HOST}${fromRoute}`); } catch { return null; }
  if (url.hostname !== HOST && url.hostname !== `www.${HOST}`) return null;
  return url.pathname;
}

const rules = parseRedirects(ROOT);
const files = walk(ROOT);
const HREF = /\bhref\s*=\s*["']([^"']+)["']/gi;
const offenders = new Map();
let links = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const route = routeOfFile(rel);
  const html = fs.readFileSync(file, 'utf8');
  HREF.lastIndex = 0;
  let m;
  while ((m = HREF.exec(html))) {
    const p = internalPath(m[1], route);
    if (p === null) continue;
    links += 1;
    const r = resolvePath(p, { root: ROOT, rules });
    if (r.kind !== 'redirect') continue;
    const key = `${p} -> ${r.status} ${r.to} (${r.via})`;
    if (!offenders.has(key)) offenders.set(key, []);
    offenders.get(key).push(rel);
  }
}

if (files.length < MIN_PAGES) {
  console.error(`REDIRECTING-LINK VALIDATION EXAMINED ONLY ${files.length} PUBLISHED PAGES (floor ${MIN_PAGES}). A gate that examines nothing cannot fail; run it after the build.`);
  process.exit(1);
}
if (links < MIN_LINKS) {
  console.error(`REDIRECTING-LINK VALIDATION EXAMINED ONLY ${links} INTERNAL HREFS (floor ${MIN_LINKS}). The scan matched almost nothing, so its silence proves nothing.`);
  process.exit(1);
}

if (offenders.size) {
  console.error(`Internal links that point at a redirect instead of the final URL (${offenders.size} targets). Fix the emitter so the href is the URL Pages serves:`);
  for (const [key, from] of [...offenders.entries()].slice(0, 60)) {
    console.error(`- ${key}: ${from.length} page(s), e.g. ${from.slice(0, 2).join(', ')}`);
  }
  process.exit(1);
}

console.log(`No redirecting internal links: ${files.length} published pages, ${links} internal hrefs, every one the final URL.`);
