'use strict';
/**
 * Shared reader for data/seo/site_head.json and the published-page walk, so the
 * build step (scripts/apply_site_head.js) and its validators decide "which pages,
 * which kind" from one place instead of two lists that drift.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_REL = 'data/seo/site_head.json';
const FROZEN_REL = 'data/release/frozen_output_registry.json';
const SKIP_DIRS = new Set(['.git', 'node_modules', '.pages-output', '.build', 'dist', 'scripts', 'data', 'reports',
  'artifacts', 'docs', 'tests', 'fixtures', 'config', 'content', 'templates', 'logs', 'releases', 'seo', 'distribution_scripts']);

function loadConfig(root = ROOT) {
  const p = path.join(root, CONFIG_REL);
  if (!fs.existsSync(p)) throw new Error(`site-head: missing ${CONFIG_REL}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function frozenFiles(root = ROOT) {
  const p = path.join(root, FROZEN_REL);
  if (!fs.existsSync(p)) return new Set();
  return new Set((JSON.parse(fs.readFileSync(p, 'utf8')).pages || []).map((x) => x.rendered_file));
}

function walk(dir, root, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (e.isDirectory()) { if (!SKIP_DIRS.has(rel.split('/')[0])) walk(abs, root, out); }
    else if (e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

function routeFor(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'/index.html'.length);
  return '/' + rel.replace(/\.html$/, '');
}

/**
 * Pages this step owns: every published page that is not a frozen accepted
 * output, plus the demand pages named in the config (which are refrozen with
 * the result, so a later build's restore + this step is a no-op on them).
 * Frozen pages are hash-locked (data/release/accepted_output_freeze_contract.json,
 * normal_build_may_mutate_frozen: false); touching them here would red
 * validate:authority-scale with UNSCOPED_FROZEN_OUTPUT_DRIFT.
 */
function ownedPages(root = ROOT, cfg = loadConfig(root)) {
  const frozen = frozenFiles(root);
  const demand = new Set((cfg.demand_pages || []).map((d) => d.file));
  return walk(root, root, []).filter((rel) => !frozen.has(rel) || demand.has(rel)).sort();
}

function pageKind(rel, cfg) {
  const route = routeFor(rel);
  if (route === '/' || rel.endsWith('/index.html')) return 'website';
  if ((cfg.website_kind_routes || []).includes(route)) return 'website';
  return 'article';
}

module.exports = { ROOT, CONFIG_REL, loadConfig, frozenFiles, ownedPages, pageKind, routeFor, walk };
