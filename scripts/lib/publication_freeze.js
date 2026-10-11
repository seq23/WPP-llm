'use strict';
/**
 * Publication freeze gate (data/release/publication_freeze.json).
 *
 * While frozen, a new page may only be created for a query that has a measured
 * Search Console number in data/seo/measured_targets.json. The single caller
 * that creates pages, scripts/citation_intelligence/apply_release_plan.js, asks
 * createAllowed() per unit; validate_publication_freeze.js proves both that the
 * gate refuses an unmeasured query and that the publisher actually calls it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FLAG_REL = 'data/release/publication_freeze.json';
const norm = (q) => String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function loadFreeze(root = ROOT) {
  const p = path.join(root, FLAG_REL);
  if (!fs.existsSync(p)) throw new Error(`publication freeze: missing ${FLAG_REL}; refusing to guess whether publishing is allowed`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function measuredQueries(root = ROOT, flag = loadFreeze(root)) {
  const p = path.join(root, flag.measured_targets || 'data/seo/measured_targets.json');
  if (!fs.existsSync(p)) return new Set();
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Set((d.targets || []).filter((t) => Number(t.impressions) > 0).map((t) => norm(t.query)));
}

function createAllowed(query, { root = ROOT, flag, measured } = {}) {
  const f = flag || loadFreeze(root);
  if (f.frozen !== true) return { allowed: true, reason: null };
  const m = measured || measuredQueries(root, f);
  if (m.has(norm(query))) return { allowed: true, reason: null };
  return { allowed: false, reason: 'publication_frozen_unmeasured_target' };
}

module.exports = { FLAG_REL, loadFreeze, measuredQueries, createAllowed, norm };
