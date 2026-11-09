#!/usr/bin/env node
/**
 * The sitemap lists published pages only. The search loop writes internal .html snapshots under
 * data/ during its run; on 9 Nov 2026 the sitemap walker listed three of them and the run failed.
 * Plants a page under data/, regenerates, asserts it is not listed, and restores every file.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const planted = path.join(ROOT, 'data/search-loop/snapshots/planted-by-test.html');
const keep = ['sitemap.xml', 'data/cadence/lastmod_ledger.json'].map((f) => [f, fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f)) : null]);
fs.mkdirSync(path.dirname(planted), { recursive: true });
fs.writeFileSync(planted, '<html><head><title>x</title></head><body>x</body></html>');
try {
  execFileSync('node', [path.join(ROOT, 'scripts/update_sitemap_all_html.js')], { cwd: ROOT, stdio: 'ignore' });
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = xml.match(/<loc>/g) || [];
  assert.ok(locs.length > 10, `sitemap has only ${locs.length} pages; the walker examined nothing`);
  assert.ok(!xml.includes('planted-by-test'), 'a page under data/ was listed in the sitemap');
  // data/ is never deployed (assemble_pages_output.js), so no page check may demand it either.
  for (const v of ['validate_sitemap_coverage.js', 'validate_canonical_routes.js', 'validate_internal_links.js']) {
    try { execFileSync('node', [path.join(ROOT, 'scripts', v)], { cwd: ROOT, stdio: 'pipe' }); }
    catch (e) { assert.fail(`${v} failed with a page under data/:\n${String(e.stdout || '').slice(-600)}`); }
  }
} finally {
  fs.rmSync(planted);
  for (const [f, buf] of keep) { const p = path.join(ROOT, f); if (buf === null) fs.rmSync(p, { force: true }); else fs.writeFileSync(p, buf); }
}
console.log('ok: sitemap and page checks skip internal data/ pages');
