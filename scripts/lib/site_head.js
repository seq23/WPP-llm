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

const DEMAND_PAGES_REL = 'data/seo/demand_pages.json';
const DEMAND_FAMILIES_REL = 'data/seo/demand_families.json';
const DEMAND_LINKS_REL = 'data/seo/demand_links.json';

/** The file a route is served from, or null when neither form exists. */
function fileForRoute(route, root = ROOT) {
  const r = String(route || '').replace(/^\//, '');
  if (!r) return 'index.html';
  for (const rel of [`${r}.html`, `${r}/index.html`]) if (fs.existsSync(path.join(root, rel))) return rel;
  return null;
}

/**
 * Secondary-page links for the top-12 query families: every page Google showed
 * one of the family's queries on (after redirects) that is not itself a family
 * primary gets a link to the family primary, anchored with the family query
 * that landed there (highest impressions first). One entry per page, listing
 * every family that points at it.
 */
function demandLinks(root, pages, families) {
  const primaries = new Set(pages.map((p) => p.route));
  const byRoute = new Map(pages.map((p) => [p.family, p]));
  const out = new Map();
  for (const fam of families.families || []) {
    if (!fam.top12) continue;
    const page = byRoute.get(fam.family);
    if (!page) continue;
    const resolved = new Map((fam.landing_pages || []).map((l) => [l.page, l.resolves_to]));
    for (const q of fam.queries || []) {
      for (const landed of q.pages || []) {
        const route = resolved.get(landed);
        if (!route || primaries.has(route)) continue;
        const file = fileForRoute(route, root);
        if (!file) continue;
        if (!out.has(file)) out.set(file, { file, route, links: [] });
        const entry = out.get(file);
        if (entry.links.some((l) => l.family === fam.family)) continue;
        entry.links.push({ family: fam.family, href: page.route, anchor: q.query.replace(/\s+--.*$/, '').trim(), impressions: q.impressions });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.file.localeCompare(b.file));
}

function loadConfig(root = ROOT) {
  const p = path.join(root, CONFIG_REL);
  if (!fs.existsSync(p)) throw new Error(`site-head: missing ${CONFIG_REL}`);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  // Full demand pages (the top-12 query families) live in their own file and
  // join the same demand_pages list, so one step applies both and one
  // validator proves both.
  const dp = path.join(root, DEMAND_PAGES_REL);
  if (fs.existsSync(dp)) {
    const d = JSON.parse(fs.readFileSync(dp, 'utf8'));
    cfg.demand_page_cta = d.cta;
    const full = (d.pages || []).map((x) => ({ ...x, full: true }));
    cfg.demand_pages = [...(cfg.demand_pages || []), ...full];
    // The secondary links are pinned (written by scripts/prepare_demand_refreeze.js),
    // not derived live: the daily sweep rebuilds demand_families.json, and a live
    // derivation would change hash-locked pages outside any thaw scope.
    const lp = path.join(root, DEMAND_LINKS_REL);
    cfg.demand_links = fs.existsSync(lp) ? (JSON.parse(fs.readFileSync(lp, 'utf8')).links || []) : [];
  }
  return cfg;
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
 * output, plus the demand pages named in the config and the measured landing
 * pages that link to a family primary (cfg.demand_links) (which are refrozen with
 * the result, so a later build's restore + this step is a no-op on them).
 * Frozen pages are hash-locked (data/release/accepted_output_freeze_contract.json,
 * normal_build_may_mutate_frozen: false); touching them here would red
 * validate:authority-scale with UNSCOPED_FROZEN_OUTPUT_DRIFT.
 */
function ownedPages(root = ROOT, cfg = loadConfig(root)) {
  const frozen = frozenFiles(root);
  const demand = new Set([...(cfg.demand_pages || []).map((d) => d.file), ...(cfg.demand_links || []).map((d) => d.file)]);
  return walk(root, root, []).filter((rel) => !frozen.has(rel) || demand.has(rel)).sort();
}

function pageKind(rel, cfg) {
  const route = routeFor(rel);
  if (route === '/' || rel.endsWith('/index.html')) return 'website';
  if ((cfg.website_kind_routes || []).includes(route)) return 'website';
  return 'article';
}

module.exports = { ROOT, CONFIG_REL, DEMAND_PAGES_REL, DEMAND_FAMILIES_REL, DEMAND_LINKS_REL, fileForRoute, demandLinks, loadConfig, frozenFiles, ownedPages, pageKind, routeFor, walk };
