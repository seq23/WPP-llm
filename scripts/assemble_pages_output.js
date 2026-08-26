#!/usr/bin/env node
/**
 * Assembles the publishable site into dist/ for Cloudflare Pages.
 *
 * These projects deployed the repository root, so the whole source tree was
 * reachable on the live domain - scripts, lockfiles, and AGENTS.md served as
 * raw text from a marketing hostname. Pages has no exclude mechanism for a
 * root deploy, so the fix is to publish a directory that only ever contained
 * the site.
 *
 * The exclusion list is a deny-list on purpose: an allow-list silently drops
 * site content the day someone adds a directory, whereas an unknown directory
 * here is published (visible) rather than lost. Every URL in sitemap.xml is
 * verified present afterwards, so a wrong exclusion fails the build loudly
 * instead of shipping a site with holes.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, '.pages-output');

const EXCLUDE = new Set([
  '.pages-output', 'dist', 'node_modules', '.git', '.github', '.gitignore',
  'scripts', 'distribution_scripts', 'tests', 'test', 'docs', 'reports',
  // logs/ holds validator and workflow run receipts - internal operating output
  // that no sitemap URL points at, and which the credential guard below refuses
  // to publish once `npm run credentials:check` has written its summary there.
  'logs',
  'artifacts', 'validation', 'data', 'prompts', 'content-bank',
  'content-recipes', '.wrangler', '.astro', 'coverage',
  'package.json', 'package-lock.json', 'AGENTS.md', 'README.md',
  'ARTIFACT_MANIFEST.md', 'REPO_VALIDATION_MATRIX.md',
]);
const EXCLUDE_EXT = new Set(['.md']);

let copied = 0;
function copyInto(srcDir, outDir, depth) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (depth === 0 && EXCLUDE.has(entry.name)) continue;
    if (depth === 0 && EXCLUDE_EXT.has(path.extname(entry.name))) continue;
    const from = path.join(srcDir, entry.name);
    const to = path.join(outDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyInto(from, to, depth + 1);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
      copied += 1;
    }
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
copyInto(root, dist, 0);

// A URL listed in the sitemap that is missing from dist means an exclusion was
// wrong. Fail here rather than deploy a site with holes in it.
const sitemapPath = path.join(dist, 'sitemap.xml');
const missing = [];
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  for (const m of xml.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)) {
    const p = (m[1] || '/').replace(/^\//, '').replace(/\/$/, '');
    const candidates = p === ''
      ? ['index.html']
      : [p, `${p}.html`, path.join(p, 'index.html')];
    if (!candidates.some((c) => fs.existsSync(path.join(dist, c)))) missing.push(m[1] || '/');
  }
}
if (missing.length) {
  console.error(`assemble: ${missing.length} sitemap URL(s) missing from dist, e.g.`);
  console.error(missing.slice(0, 10).map((u) => `  ${u}`).join('\n'));
  process.exit(1);
}

// Nothing credential-shaped may ever reach a deploy directory, no matter how it
// got into the tree. CI recreates service-account keys from secrets, and a key
// written into the workspace instead of $RUNNER_TEMP would otherwise be copied
// here and published. Fail loudly rather than deploy and hope.
const CREDENTIAL_SHAPED = /(service[-_]?account|credentials?|secret|\.pem$|\.key$|\.p12$|id_rsa)/i;
const credentials = [];
(function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { scan(full); continue; }
    if (CREDENTIAL_SHAPED.test(entry.name)) credentials.push(path.relative(dist, full));
  }
})(dist);
if (credentials.length) {
  console.error('assemble: refusing to publish credential-shaped file(s): ' + credentials.join(', '));
  process.exit(1);
}

const leaked = ['README.md', 'package.json', 'AGENTS.md', 'package-lock.json']
  .filter((f) => fs.existsSync(path.join(dist, f)));
if (leaked.length) {
  console.error('assemble: source files still present in dist: ' + leaked.join(', '));
  process.exit(1);
}

console.log(`assemble: ${copied} files into .pages-output/ (sitemap URLs verified)`);
