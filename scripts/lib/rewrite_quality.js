'use strict';
/**
 * The quality bar a rewritten page must clear before it may replace the
 * slot-filled body (owner, 2 Nov 2026: "make it really easy ... easy to find
 * answers"; the live pages read "Virtual summit production checklist turns on
 * two decisions: registration, engagement, recording, and follow-up ...").
 *
 * A rewrite is the data/seo/demand_pages.json shape (h1, definition, facts,
 * sections[{h2, blocks}], faq[{q,a}]) so the existing full-page renderer in
 * scripts/apply_site_head.js draws it. Lengths follow the page-shape rule:
 * targets, and a length fails only below 75% of its floor.
 *
 * Every refusal is named so a batch report can say why a page stayed out.
 */

const words = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').split(/\s+/).filter(Boolean);
const plain = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function blockText(b) {
  if (!b || typeof b !== 'object') return '';
  if (b.p) return b.p;
  if (b.ul) return b.ul.join(' ');
  if (b.ol) return b.ol.join(' ');
  if (b.table) return [...(b.table.head || []), ...(b.table.rows || []).flat()].join(' ');
  return '';
}

function bodyText(page) {
  const parts = [page.definition, page.quick_answer];
  for (const s of page.sections || []) { parts.push(s.h2); for (const b of s.blocks || []) parts.push(blockText(b)); }
  for (const f of page.faq || []) parts.push(f.q, f.a);
  return plain(parts.filter(Boolean).join(' \n '));
}

/**
 * The slot-phrase test: the old generator repeated the same filled slot
 * ("platform, broadcast, accessibility, and backup paths") through every
 * section. Any 5-word run that appears more than MAX_REPEAT times in one body
 * is that defect.
 */
const MAX_REPEAT = 3;
function repeatedPhrases(text, n = 5) {
  const w = String(text).toLowerCase().replace(/[^a-z0-9$ ]+/g, ' ').split(/\s+/).filter(Boolean);
  const counts = new Map();
  for (let i = 0; i + n <= w.length; i += 1) {
    const k = w.slice(i, i + n).join(' ');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts].filter(([, c]) => c > MAX_REPEAT).map(([k, c]) => ({ phrase: k, count: c }));
}

/** Numbers are allowed only where an approved fact carries them. */
function unsourcedNumbers(text, allowedFacts) {
  const allowed = new Set();
  for (const f of allowedFacts || []) for (const m of String(f).matchAll(/\d[\d,.]*/g)) allowed.add(m[0].replace(/[.,]$/, ''));
  const bad = [];
  for (const m of String(text).matchAll(/\d[\d,.]*/g)) {
    const n = m[0].replace(/[.,]$/, '');
    if (!allowed.has(n)) bad.push(n);
  }
  return [...new Set(bad)];
}

const BANNED = [/unclustered/i, /\bslot\b/i, /lorem/i, /\{\{|\}\}/, /as an ai\b/i, /\bguarantee[ds]?\b/i, /\bbest-in-class\b/i, /\bworld-class\b/i];

function check(page, { allowedFacts = [] } = {}) {
  const fails = [];
  if (!page || typeof page !== 'object') return { ok: false, fails: ['NOT_AN_OBJECT'] };
  const defW = words(page.definition).length;
  if (defW < 30) fails.push(`DEFINITION_SHORT:${defW}`);
  if (!/\b(is|are)\b/.test(plain(page.definition).split(/[.;]/)[0] || '')) fails.push('DEFINITION_NOT_X_IS');
  if (!page.h1 || words(page.h1).length < 3) fails.push('H1_MISSING');
  const sections = Array.isArray(page.sections) ? page.sections : [];
  if (sections.length < 3) fails.push(`SECTIONS:${sections.length}`);
  for (const s of sections) {
    if (!/\?\s*$/.test(plain(s.h2))) fails.push(`H2_NOT_A_QUESTION:${plain(s.h2).slice(0, 40)}`);
    if (!Array.isArray(s.blocks) || !s.blocks.some((b) => words(blockText(b)).length >= 8)) fails.push(`SECTION_EMPTY:${plain(s.h2).slice(0, 40)}`);
  }
  if (!sections.some((s) => (s.blocks || []).some((b) => b.ul || b.ol || b.table))) fails.push('NO_LIST_OR_TABLE');
  const faq = Array.isArray(page.faq) ? page.faq : [];
  if (faq.length < 3) fails.push(`FAQ:${faq.length}`);
  for (const f of faq) {
    const n = words(f.a).length;
    if (n < 20) fails.push(`FAQ_ANSWER_SHORT:${n}`);
    if (!/\?\s*$/.test(plain(f.q))) fails.push('FAQ_Q_NOT_A_QUESTION');
  }
  const text = bodyText(page);
  const total = words(text).length;
  if (total < 450) fails.push(`BODY_SHORT:${total}`);
  for (const r of repeatedPhrases(text)) fails.push(`REPEATED_PHRASE:${r.count}x "${r.phrase}"`);
  for (const n of unsourcedNumbers(text, allowedFacts)) fails.push(`UNSOURCED_NUMBER:${n}`);
  for (const re of BANNED) if (re.test(text)) fails.push(`BANNED:${re.source}`);
  return { ok: fails.length === 0, fails, words: total };
}

module.exports = { check, repeatedPhrases, unsourcedNumbers, bodyText, MAX_REPEAT };
