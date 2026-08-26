'use strict';
/**
 * recommendation_summary - the block the external review agent asks for most.
 *
 * .clarity/content-pattern-spec.json records it as requested on 913 of 913
 * accepted recommendations, across every run: a short statement of what the page
 * actually recommends, placed where an answer engine reaches it. Before this
 * module, zero pages in this repo carried one.
 *
 * The hard rule is that nothing here is authored. Every word the block emits is
 * already on the page; the transform only relabels and regroups what the page
 * says. Three strategies, all of which preserve document order exactly - no
 * sentence is moved, added, or dropped:
 *
 *   hoist_lead   The direct answer opens with a standalone recommendation
 *                sentence ("Choose a partner by matching the problem...").
 *                That sentence is lifted into its own labelled block directly
 *                above the direct answer, which keeps the remaining sentences.
 *                Reading order is byte-identical to before; only the wrapper
 *                and heading are new. This is the fold the spec asks for: the
 *                block and the panel beneath it never restate each other.
 *
 *   fold_fit     The LLM answer-card family carries "Best for" and "Not for"
 *                panels. Those two panels ARE the recommendation, so they are
 *                merged into one labelled block in place rather than leaving a
 *                summary that repeats the panel below it.
 *
 *   fold_steps   The community-authority family states its recommendation as an
 *                ordered "How to approach it" list immediately under a
 *                one-sentence direct answer. That list is relabelled in place.
 *
 * A page that matches none of them is left alone and reported. A block that
 * announces its own gap is worse than no block: it is filler for a reader and
 * noise for an extractor, and it would be fabrication under the same rule that
 * forbids inventing a statistic.
 *
 * Idempotent: a page that already carries the marker is returned untouched, so
 * the generators may call this on every build without stacking blocks.
 */

const MARK = 'data-content-block="recommendation_summary"';
const HEADING = 'What this page recommends';

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (h) => decode(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Sentence boundaries, conservatively. A period is only a boundary when the
 * next sentence starts with a capital, which keeps "e.g. the" and "vs. the"
 * from splitting a recommendation in half.
 */
function sentences(text) {
  return String(text || '').trim().split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/).filter(Boolean);
}

/** Does this sentence tell the reader what to do? */
const PRESCRIPTIVE = new RegExp([
  '^(?:choose|start|use|treat|define|make|write|build|design|run|measure|assign|separate',
  '|rank|test|name|document|keep|avoid|pick|set|plan|hire|focus|prioriti[sz]e|do not|don\'t',
  '|the (?:direct )?answer is|a (?:good|responsible|useful|strong|simple|clean|reliable|practical|repeatable)\\b',
  '|you (?:should|need|want)|if you want|teams? should|companies should|buyers? should|most teams)',
].join(''), 'i');
const PRESCRIPTIVE_INNER = /\bshould\b|\bstarts? with\b|\bthe answer is\b|\bis to\b|\bnot by\b|\brather than\b/i;
const isRecommendation = (s) => PRESCRIPTIVE.test(s.trim()) || PRESCRIPTIVE_INNER.test(s);

// A direct answer must stay a usable direct answer after a sentence is lifted
// out of it. Below this the leftover is a fragment, so the page is skipped
// instead of being degraded to buy coverage.
const MIN_REMAINING_CHARS = 110;

const DA_LABEL = '(?:The\\s+)?(?:Direct|Quick|Short)\\s+answer';
// <section class="callout"><strong>Direct answer</strong><p>...</p></section>
const DA_CALLOUT = new RegExp(`<section class="callout"><strong>\\s*${DA_LABEL}\\s*</strong>\\s*<p>([\\s\\S]*?)</p>\\s*</section>`, 'i');
// <h2>Direct answer</h2><p>...</p>
const DA_HEADING = new RegExp(`<(h2|h3)([^>]*)>\\s*(${DA_LABEL})\\s*</\\1>\\s*<p([^>]*)>([\\s\\S]*?)</p>`, 'i');

function findDirectAnswer(html) {
  const callout = html.match(DA_CALLOUT);
  if (callout) {
    return { start: callout.index, end: callout.index + callout[0].length, inner: callout[1], rebuild: (rest) => callout[0].replace(`<p>${callout[1]}</p>`, `<p>${rest}</p>`) };
  }
  const heading = html.match(DA_HEADING);
  if (heading) {
    return {
      start: heading.index,
      end: heading.index + heading[0].length,
      inner: heading[5],
      rebuild: (rest) => `<${heading[1]}${heading[2]}>${heading[3]}</${heading[1]}><p${heading[4]}>${rest}</p>`,
    };
  }
  // <p class="direct-answer" data-llm-answer="true"><strong>...</strong></p>
  const marked = html.match(/<p([^>]*class="[^"]*\bdirect-answer\b[^"]*"[^>]*)>([\s\S]*?)<\/p>/i);
  if (marked) {
    return {
      start: marked.index,
      end: marked.index + marked[0].length,
      inner: marked[2],
      rebuild: (rest) => `<p${marked[1]}>${rest}</p>`,
    };
  }
  return null;
}

/**
 * Where the block goes: immediately before the direct answer, and outside the
 * card that wraps it so the two panels stay siblings.
 */
function insertionPoint(html, daStart) {
  const before = html.slice(0, daStart);
  const card = before.match(/<section class="card"[^>]*>\s*$/i);
  return card ? daStart - card[0].length : daStart;
}

function panelClass(html, override) {
  if (override) return override;
  return /<section class="card"/i.test(html) ? 'card' : 'callout';
}

function blockHtml(cls, body) {
  return `<section class="${cls} recommendation-summary" id="recommendation-summary" ${MARK}><h2>${HEADING}</h2>${body}</section>`;
}

/**
 * Sentences, but over markup. Templates in this repo emphasise the lede with
 * <strong> and drop inline <strong>/<a> mid-paragraph, so a text-only split
 * would either refuse the page or tear a tag in half.
 */
function htmlSentences(rawHtml) {
  const out = [];
  let s = String(rawHtml).trim();
  // The lede templates wrap the whole first sentence: <strong>Do X.</strong> Then...
  const lede = s.match(/^<strong>([\s\S]*?)<\/strong>(?:\s+|$)/i);
  if (lede && /[.!?]["')\]]?$/.test(lede[1].trim())) {
    out.push(`<strong>${lede[1].trim()}</strong>`);
    s = s.slice(lede[0].length);
  }
  for (const part of s.split(/(?<=[.!?])\s+(?=(?:<[a-z][^>]*>)*["'“(]?[A-Z0-9])/)) {
    if (part.trim()) out.push(part.trim());
  }
  return out;
}

/** Refuse to lift a fragment whose markup does not close inside it. */
function balanced(fragment) {
  const opens = [...String(fragment).matchAll(/<([a-z][a-z0-9]*)\b[^>]*>/gi)].map((m) => m[1].toLowerCase());
  const closes = [...String(fragment).matchAll(/<\/([a-z][a-z0-9]*)\s*>/gi)].map((m) => m[1].toLowerCase());
  const tally = new Map();
  for (const t of opens) tally.set(t, (tally.get(t) || 0) + 1);
  for (const t of closes) tally.set(t, (tally.get(t) || 0) - 1);
  return [...tally.values()].every((n) => n === 0);
}

/** Strategy 1: lift the recommendation sentence out of the direct answer. */
function hoistLead(da) {
  let raw = da.inner.trim();
  const wrapped = raw.match(/^<strong>([\s\S]*)<\/strong>$/i);
  const wrapAll = Boolean(wrapped) && !/<\/strong>/i.test(wrapped[1]);
  if (wrapAll) raw = wrapped[1].trim();

  const parts = htmlSentences(raw);
  if (parts.length < 2) return null;
  const idx = parts.findIndex((p) => isRecommendation(strip(p)));
  if (idx < 0) return null;
  const lead = parts[idx];
  if (!balanced(lead)) return null;
  const remaining = parts.filter((_, i) => i !== idx).join(' ');
  if (!balanced(remaining) || strip(remaining).length < MIN_REMAINING_CHARS) return null;
  // Keep the emphasis the page gave the sentence. Every one of these templates
  // bolds its lede, and dropping the <strong> would silently reformat 1,300
  // pages - and drop them out of the definition_callout check, which reads a
  // bolded lead paragraph as the definition an answer engine lifts.
  return {
    lead: wrapAll ? `<strong>${lead}</strong>` : lead,
    rest: wrapAll ? `<strong>${remaining}</strong>` : remaining,
  };
}

const SECTION_BY_HEADING = (label) => new RegExp(`<section class="card"[^>]*>\\s*<h2[^>]*>\\s*${label}\\s*</h2>([\\s\\S]*?)</section>`, 'i');

/** Strategy 2: merge the answer card's "Best for" / "Not for" panels. */
function foldFit(html, da, cls) {
  const best = html.match(SECTION_BY_HEADING('Best for'));
  if (!best) return null;
  const not = html.match(SECTION_BY_HEADING('Not for'));
  const body = `<p><strong>Best for</strong></p>${best[1].trim()}`
    + (not ? `<p><strong>Not for</strong></p>${not[1].trim()}` : '');
  let out = html.replace(best[0], blockHtml(cls, body));
  if (not) out = out.replace(new RegExp(`\\s*${not[0].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`), '');
  return out;
}

const STEPS_HEADING = /<h2([^>]*)>\s*(How to approach it|Practical workflow)\s*<\/h2>\s*(<ol[\s\S]*?<\/ol>)/i;

/**
 * Strategy 3: relabel the ordered recommendation the page already publishes,
 * and seat it directly under the direct answer so it lands in the opening third
 * even on the longer legacy templates where the list sits third or fourth.
 */
function foldSteps(html, da, cls) {
  const m = html.match(STEPS_HEADING);
  if (!m) return null;
  if (m.index < da.end) return null; // must follow the direct answer
  const without = html.slice(0, m.index) + html.slice(m.index + m[0].length);
  return without.slice(0, da.end) + blockHtml(cls, m[3]) + without.slice(da.end);
}

/**
 * @returns {{html: string, changed: boolean, strategy: string, reason: string}}
 */
function applyRecommendationSummary(html, options = {}) {
  const src = String(html || '');
  if (src.includes(MARK)) return { html: src, changed: false, strategy: 'present', reason: 'already carries the block' };
  const cls = panelClass(src, options.panelClass);

  const da = findDirectAnswer(src);
  if (!da) return { html: src, changed: false, strategy: 'skip', reason: 'no direct-answer block to read a recommendation from' };

  const hoist = hoistLead(da);
  if (hoist) {
    const at = insertionPoint(src, da.start);
    const next = src.slice(0, at)
      + blockHtml(cls, `<p class="recommendation-summary__answer">${hoist.lead}</p>`)
      + src.slice(at, da.start) + da.rebuild(hoist.rest) + src.slice(da.end);
    return { html: next, changed: true, strategy: 'hoist_lead', reason: '' };
  }

  const fit = foldFit(src, da, cls);
  if (fit) return { html: fit, changed: true, strategy: 'fold_fit', reason: '' };

  const steps = foldSteps(src, da, cls);
  if (steps) return { html: steps, changed: true, strategy: 'fold_steps', reason: '' };

  return { html: src, changed: false, strategy: 'skip', reason: 'direct answer states no separable recommendation, and no fit or step panel to fold' };
}

module.exports = { applyRecommendationSummary, MARK, HEADING };
