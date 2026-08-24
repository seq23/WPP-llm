#!/usr/bin/env node
// Retrofit canonical author attribution across already-published pages.
//
// Idempotent: a page already carrying PERSON_ID is left untouched, so this can run
// repeatedly and in batches. Use --limit to process incrementally and --dry-run to
// inspect before writing.
//
// What it does per page:
//   1. injects the Person node into the JSON-LD @graph (once)
//   2. points author on authored nodes at the Person @id
//   3. adds <meta name="author"> when absent
//
// It does not invent content, headings, or links.

import fs from 'node:fs';
import path from 'node:path';
import { SCOOTER_TAYLOR, PERSON_ID, AUTHORED_TYPES } from './lib/entity.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(args[limIdx + 1]) : Infinity;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist-cache', 'reports', 'artifacts']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.isFile() && e.name.endsWith('.html')) out.push(abs);
  }
  return out;
}

const LD_RE = /(<script[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/gi;
const stats = { scanned: 0, already: 0, changed: 0, meta_added: 0, author_bound: 0, unparseable: 0, no_jsonld: 0, skipped_nonpublic: 0 };
const touched = [];

for (const abs of walk(ROOT)) {
  if (stats.changed >= LIMIT) break;
  const rel = path.relative(ROOT, abs);
  let html = fs.readFileSync(abs, 'utf8');
  stats.scanned++;

  if (html.includes(PERSON_ID)) { stats.already++; continue; }
  // Operator/admin views and any noindex page are not public content and must not
  // carry the author entity - attributing them would pollute the entity graph.
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html) || /^admin\//.test(rel) || rel.includes('/admin/')) {
    stats.skipped_nonpublic++; continue;
  }
  if (!/application\/ld\+json/i.test(html)) { stats.no_jsonld++; continue; }

  let injected = false, boundHere = 0, bad = false;
  html = html.replace(LD_RE, (m, open, body, close) => {
    if (injected || bad) return m;
    let data;
    try { data = JSON.parse(body.trim()); } catch { bad = true; return m; }

    const isGraph = data && typeof data === 'object' && Array.isArray(data['@graph']);
    const nodes = isGraph ? data['@graph'] : (Array.isArray(data) ? data : [data]);
    if (!nodes.some(n => n && typeof n === 'object')) return m;

    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue;
      const t = n['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (types.some(x => AUTHORED_TYPES.has(x))) { n.author = { '@id': PERSON_ID }; boundHere++; }
    }
    if (!nodes.some(n => n && n['@id'] === PERSON_ID)) nodes.push(SCOOTER_TAYLOR);
    injected = true;

    let next;
    if (isGraph) { data['@graph'] = nodes; next = data; }
    else if (Array.isArray(data)) next = nodes;
    else next = { '@context': 'https://schema.org', '@graph': nodes };
    return `${open}${JSON.stringify(next)}${close}`;
  });

  if (bad) { stats.unparseable++; continue; }
  if (!injected) continue;

  if (!/<meta[^>]+name=["']author["']/i.test(html) && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, '  <meta name="author" content="Scooter Taylor">\n</head>');
    stats.meta_added++;
  }

  stats.author_bound += boundHere;
  stats.changed++;
  touched.push(rel);
  if (!DRY) fs.writeFileSync(abs, html);
}

console.log(`[entity-attribution]${DRY ? ' DRY-RUN' : ''} ` +
  Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(' '));
if (touched.length) console.log('  first:', touched.slice(0, 3).join(', '));
