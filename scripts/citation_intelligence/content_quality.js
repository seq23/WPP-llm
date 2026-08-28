#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULTS = {
  min_programmatic_words: 700,
  duplicate_block_threshold: 0.9,
  duplicate_warn_threshold: 0.82,
  similarity_shingle_words: 5,
};

function readJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; }
}

function qualityConfig() {
  const contract = readJson('_content_release_contract.json', {});
  return { ...DEFAULTS, ...(contract.quality || {}) };
}

function cleanRoute(route) {
  const r = String(route || '/').replace(/^https?:\/\/[^/]+/, '').replace(/\.html$/, '').replace(/\/index$/, '/');
  return r.startsWith('/') ? r : '/' + r;
}

function governedRoute(route) {
  const r = cleanRoute(route);
  if (r.startsWith('/programmatic/')) return r;
  const top = new Set(['/','/articles','/atlas','/query-atlas','/selected-work','/started-business','/how-west-peek-helps','/community-as-a-service','/ai-helps-breaks','/ai-human-os','/glossary']);
  // Sections that are already published in their own right. A route here is left
  // alone; anything else is a programmatic candidate and gets the /programmatic
  // prefix. `/learn/` was missing from this list even though learn/ holds 16
  // sitemapped pages, 8 of them in the admission registry: every /learn/<slug>
  // opportunity was therefore rewritten to /programmatic/learn/<slug>, a route no
  // file has. That made existing pages look absent (planned as creates) and put
  // them in a programmatic subdirectory that listProgrammaticPages() -- a flat
  // readdir of programmatic/ -- can never see, so the quality report had no row
  // for them and the substance gate failed on evidence that could not exist.
  const publishedSections = ['/answers/', '/insights/', '/query-atlas/', '/pillars/', '/case-studies/', '/learn/'];
  if (top.has(r) || publishedSections.some(p => r.startsWith(p))) return r;
  return '/programmatic' + r;
}

function routeToProgrammaticFile(route) {
  const r = governedRoute(route);
  if (!r.startsWith('/programmatic/')) return null;
  return path.join(ROOT, r.replace(/^\//, '') + '.html');
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractVisibleText(html) {
  return decodeEntities(String(html || '')
    // Fan-out is a shared discovery/navigation surface added after admission.
    // It must not change the semantic-duplicate score of the primary page body.
    .replace(/<section\b[^>]*data-fanout=["']true["'][^>]*>[\s\S]*?<\/section>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function wordCountFromHtml(html) { return tokenize(extractVisibleText(html)).length; }

function shingleSetFromHtml(html, width = qualityConfig().similarity_shingle_words) {
  const tokens = tokenize(extractVisibleText(html));
  const out = new Set();
  if (tokens.length < width) return out;
  for (let i = 0; i <= tokens.length - width; i += 1) out.add(tokens.slice(i, i + width).join(' '));
  return out;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  const small = a.size <= b.size ? a : b;
  const large = a.size <= b.size ? b : a;
  for (const value of small) if (large.has(value)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function metadataIndex() {
  const opps = readJson('data/opportunities/aeo_geo_opportunities.json', { opportunities: [] }).opportunities || [];
  const admissions = readJson('data/content/page_admission_registry.json', { admissions: [] }).admissions || [];
  const byRoute = new Map();
  for (const o of opps) {
    const route = governedRoute(o.target_route);
    if (!byRoute.has(route)) byRoute.set(route, { cluster: o.cluster || route, query: o.query || null, pillar: o.pillar || null, page_family: o.page_family || null });
  }
  for (const a of admissions) {
    const route = governedRoute(a.route);
    if (!byRoute.has(route)) byRoute.set(route, { cluster: a.cluster || route, query: a.query || null, pillar: a.pillar || null, page_family: a.page_family || null });
  }
  return byRoute;
}

function listProgrammaticPages() {
  const dir = path.join(ROOT, 'programmatic');
  if (!fs.existsSync(dir)) return [];
  const meta = metadataIndex();
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.html'))
    .sort()
    .map(name => {
      const route = '/programmatic/' + name.replace(/\.html$/, '');
      const html = fs.readFileSync(path.join(dir, name), 'utf8');
      const m = meta.get(route) || {};
      return {
        route,
        file: `programmatic/${name}`,
        html,
        word_count: wordCountFromHtml(html),
        content_hash: crypto.createHash('sha256').update(html).digest('hex'),
        shingles: shingleSetFromHtml(html),
        cluster: m.cluster || route,
        query: m.query || null,
        pillar: m.pillar || null,
        page_family: m.page_family || null,
      };
    });
}

function analyzeCorpus() {
  const cfg = qualityConfig();
  const pages = listProgrammaticPages();
  const groups = new Map();
  for (const page of pages) {
    if (!groups.has(page.cluster)) groups.set(page.cluster, []);
    groups.get(page.cluster).push(page);
  }
  const exactHash = new Map();
  for (const page of pages) {
    if (!exactHash.has(page.content_hash)) exactHash.set(page.content_hash, []);
    exactHash.get(page.content_hash).push(page.route);
  }
  const rows = [];
  for (const page of pages) {
    let max = 0;
    let nearest = null;
    for (const peer of groups.get(page.cluster) || []) {
      if (peer.route === page.route) continue;
      const score = jaccard(page.shingles, peer.shingles);
      if (score > max) { max = score; nearest = peer.route; }
    }
    const exactPeers = (exactHash.get(page.content_hash) || []).filter(r => r !== page.route);
    const flags = [];
    if (page.word_count < cfg.min_programmatic_words) flags.push('thin');
    if (exactPeers.length) flags.push('exact_duplicate');
    else if (max >= cfg.duplicate_block_threshold) flags.push('near_duplicate');
    else if (max >= cfg.duplicate_warn_threshold) flags.push('similarity_warning');
    rows.push({
      route: page.route,
      file: page.file,
      query: page.query,
      cluster: page.cluster,
      pillar: page.pillar,
      page_family: page.page_family,
      word_count: page.word_count,
      max_similarity: Number(max.toFixed(6)),
      nearest_route: nearest,
      exact_duplicate_routes: exactPeers,
      flags,
    });
  }
  const blocking = rows.filter(r => r.flags.some(f => ['thin','exact_duplicate','near_duplicate'].includes(f)));
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(rows.map(r => [r.route,r.word_count,r.max_similarity,r.nearest_route,r.flags]))).digest('hex');
  return {
    schema_version: '1.0',
    analysis_version: 'wpp-content-quality-v1',
    corpus_fingerprint: fingerprint,
    config: cfg,
    summary: {
      pages_scanned: rows.length,
      blocking_legacy_pages: blocking.length,
      thin_pages: rows.filter(r => r.flags.includes('thin')).length,
      exact_duplicate_pages: rows.filter(r => r.flags.includes('exact_duplicate')).length,
      near_duplicate_pages: rows.filter(r => r.flags.includes('near_duplicate')).length,
      similarity_warning_pages: rows.filter(r => r.flags.includes('similarity_warning')).length,
      status: blocking.length ? 'LEGACY_REMEDIATION_REQUIRED' : 'CLEAN',
    },
    pages: rows,
  };
}

function candidateQuality(html, meta, corpusPages = null) {
  const cfg = qualityConfig();
  const wc = wordCountFromHtml(html);
  const route = governedRoute(meta.target_route || meta.route);
  const cluster = meta.cluster || route;
  const candidateShingles = shingleSetFromHtml(html, cfg.similarity_shingle_words);
  const peers = (corpusPages || listProgrammaticPages()).filter(p => p.route !== route && p.cluster === cluster);
  let max = 0; let nearest = null;
  for (const peer of peers) {
    const score = jaccard(candidateShingles, peer.shingles);
    if (score > max) { max = score; nearest = peer.route; }
  }
  const reasons = [];
  if (wc < cfg.min_programmatic_words) reasons.push(`thin:${wc}<${cfg.min_programmatic_words}`);
  if (max >= cfg.duplicate_block_threshold) reasons.push(`near_duplicate:${max.toFixed(6)}>=${cfg.duplicate_block_threshold}:${nearest}`);
  return { ok: reasons.length === 0, word_count: wc, max_similarity: Number(max.toFixed(6)), nearest_route: nearest, reasons };
}

module.exports = {
  ROOT,
  qualityConfig,
  cleanRoute,
  governedRoute,
  routeToProgrammaticFile,
  extractVisibleText,
  wordCountFromHtml,
  shingleSetFromHtml,
  jaccard,
  listProgrammaticPages,
  analyzeCorpus,
  candidateQuality,
  readJson,
};
