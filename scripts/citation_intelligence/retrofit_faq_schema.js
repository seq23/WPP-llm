#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * FAQPage schema for pages that already carry question-and-answer content.
 *
 * FAQPage coverage across this library was 2%: only the 64 pages in answers/,
 * where scripts/add_answer_schema.js builds one Question from the record's own
 * `direct_answer`. Everything else shipped Article schema and nothing an answer
 * engine could lift as a stated question with a stated answer.
 *
 * The rule here is the same one add_answer_schema.js follows, and the same one
 * the sibling local-guides repo follows, where the visible section text and
 * `Question.name` come from one array and are therefore identical: NOTHING IS
 * AUTHORED. Every answer this script emits is text already rendered on the page,
 * lifted verbatim. Every question is the page's own heading, or the page's own
 * subject, put in the interrogative. A page that carries no answer to any
 * question is skipped and reported - a FAQPage whose answers were invented is
 * worse than no FAQPage at all.
 *
 * It also sets the h1 to the question a searcher would type, using the same
 * derivation as scripts/lib/programmatic_prose.js, because a page whose heading
 * is a topic label carries none of the phrasing anyone actually searched. This
 * family's h1 is the title-cased query, which is the shape the review agent
 * reports as "query not present in a heading".
 *
 * Usage:
 *   node scripts/citation_intelligence/retrofit_faq_schema.js --dry-run
 *   node scripts/citation_intelligence/retrofit_faq_schema.js --limit 200
 */
const fs = require('fs');
const path = require('path');
const { applyRecommendationSummary, stripRecommendationSummary } = require('../lib/recommendation_summary.js');
const { headingQuestion } = require('../lib/programmatic_prose.js');
const { intentMatch } = require('./render_programmatic_page.js');

const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'programmatic');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const li = args.indexOf('--limit');
const LIMIT = li >= 0 ? Number(args[li + 1]) : Infinity;

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decode = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (h) => decode(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const wc = (s) => String(s).split(/\s+/).filter(Boolean).length;

// The sections this family renders, and the question each one is the answer to.
// The heading is the page's own; the question restates that heading with the
// page's own subject, which is the only thing added.
const SECTIONS = [
  {
    heading: /<h2[^>]*>\s*(?:The\s+)?(?:Direct|Quick|Short)\s+answer\s*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    question: null, // uses the page's own h1 question
  },
  {
    heading: /<h2[^>]*>\s*Decisions to make\s*<\/h2>\s*<ol>([\s\S]*?)<\/ol>/i,
    question: (s) => `What decisions does ${s} require?`,
    list: true,
  },
  {
    heading: /<h2[^>]*>\s*Common failure modes\s*<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i,
    question: (s) => `What are the common failure modes for ${s}?`,
    list: true,
  },
  {
    heading: /<h2[^>]*>\s*When outside help is useful\s*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    question: (s) => `When is outside help useful for ${s}?`,
  },
];

function listText(inner) {
  const items = [...String(inner).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => strip(m[1])).filter(Boolean);
  if (!items.length) return null;
  return `${items.map((x) => x.replace(/\.$/, '')).join('; ')}.`;
}

function subjectOf(html) {
  const about = html.match(/"about":\{"@type":"Thing","name":"((?:[^"\\]|\\.)*)"\}/);
  if (about) { try { return JSON.parse(`"${about[1]}"`); } catch { /* fall through */ } }
  // Without an `about` node the h1 is the only statement of subject, and on this
  // family the h1 is the title-cased query. Title case is not how anyone types
  // it, so it comes back down to the query's own shape.
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1) return null;
  const text = strip(h1[1]);
  return /^(?:[A-Z][a-z.]*\s+){2,}[A-Z][a-z.]*$/.test(text) ? text.toLowerCase() : text;
}

function buildPairs(html, subject, question) {
  const pairs = [];
  for (const s of SECTIONS) {
    const m = html.match(s.heading);
    if (!m) continue;
    const answer = s.list ? listText(m[1]) : strip(m[1]);
    if (!answer || wc(answer) < 8) continue;
    const q = s.question ? s.question(subject) : question;
    if (!q) continue;
    if (pairs.some((p) => p[0] === q)) continue;
    pairs.push([q, answer]);
  }
  return pairs;
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
const stats = { scanned: 0, updated: 0, h1_rephrased: 0, skipped: {} };
const failures = [];
const pairCounts = [];

for (const file of files) {
  if (stats.updated >= LIMIT) break;
  const abs = path.join(DIR, file);
  const before = fs.readFileSync(abs, 'utf8');
  stats.scanned += 1;
  if (/"@type":"FAQPage"|data-faq/.test(before)) { stats.skipped.already_has_faq = (stats.skipped.already_has_faq || 0) + 1; continue; }

  const subject = subjectOf(before);
  if (!subject) { stats.skipped.no_subject = (stats.skipped.no_subject || 0) + 1; continue; }
  const { key, needle } = intentMatch(subject);
  const question = headingQuestion(subject, key, needle);

  // The recommendation-summary transform moves a sentence out of the direct
  // answer, so the page has to be restored before its own text can be read, and
  // re-derived afterwards - exactly as the generators do it.
  const restored = stripRecommendationSummary(before);
  const pairs = buildPairs(restored, subject, question);
  if (!pairs.length) { stats.skipped.no_answer_on_page = (stats.skipped.no_answer_on_page || 0) + 1; continue; }
  if (!restored.includes('</article>')) { stats.skipped.no_article = (stats.skipped.no_article || 0) + 1; continue; }

  let out = restored;
  const h1 = out.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1 && question && strip(h1[1]) !== question) {
    out = out.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${esc(question)}</h1>`);
    stats.h1_rephrased += 1;
  }
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  out = out.replace('</article>', `\n<script type="application/ld+json">${JSON.stringify(schema).replace(/<\//g, '<\\/')}</script>\n</article>`);
  out = applyRecommendationSummary(out).html;

  // Nothing may be lost to gain a schema block.
  const hrefsOf = (h) => [...String(h).matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]);
  const lost = hrefsOf(before).filter((h) => !hrefsOf(out).includes(h));
  const textBefore = wc(strip(before.replace(/<script[\s\S]*?<\/script>/gi, ' ')));
  const textAfter = wc(strip(out.replace(/<script[\s\S]*?<\/script>/gi, ' ')));
  if (lost.length) failures.push(`programmatic/${file}: lost href ${[...new Set(lost)].join(', ')}`);
  if (textAfter < textBefore - 12) failures.push(`programmatic/${file}: visible text fell ${textBefore} -> ${textAfter}`);
  if (failures.length) continue;

  pairCounts.push(pairs.length);
  if (!DRY) fs.writeFileSync(abs, out);
  stats.updated += 1;
}

if (failures.length) {
  console.error(`FAQ RETROFIT ABORTED - ${failures.length} verification failure(s):`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
}
const avg = pairCounts.length ? (pairCounts.reduce((a, b) => a + b, 0) / pairCounts.length).toFixed(2) : '0';
console.log(`${DRY ? '[dry-run] ' : ''}FAQ retrofit: scanned ${stats.scanned}, updated ${stats.updated} (h1 rephrased on ${stats.h1_rephrased}), mean ${avg} question(s) per page`);
console.log(`  skipped: ${Object.entries(stats.skipped).map(([k, n]) => `${k}=${n}`).join(', ') || 'none'}`);
