'use strict';
/**
 * recommendation_summary - the block the external review agent asks for most.
 *
 * .clarity/content-pattern-spec.json records it as requested on 913 of 913
 * accepted recommendations, across every run: a short statement of what the page
 * actually recommends, placed where an answer engine reaches it.
 *
 * WHAT WENT WRONG THE FIRST TIME
 * ------------------------------
 * The first version of this module lifted "the first sentence of the direct
 * answer that reads like an instruction". On this repo's templates that is
 * almost never the page's own sentence. Every programmatic direct answer is
 * built as:
 *
 *     {pillar lead}  For {query}, the useful question is not whether a generic
 *     {noun} playbook exists; it is how to {intent focus}.  Start with the
 *     desired outcome, ...  {context sentence}
 *
 * The pillar lead is one of seven constants and the third sentence is a single
 * constant. Those are the sentences that read as instructions, so those are the
 * ones that got hoisted - onto 1,032 and 566 pages verbatim. The one sentence
 * that is actually about this page (it carries the query and the page's narrow
 * job) was skipped, because it opens with "For" and states a question rather
 * than a command.
 *
 * A block repeated on 952 pages is not a summary of any of them. Coverage was
 * never the goal; a page-specific recommendation is.
 *
 * THE RULE NOW
 * ------------
 * Nothing here is authored - every word the block emits is already on the page.
 * On top of that, a candidate must be *this page's*:
 *
 *   1. Page-specific. The text has to carry a phrase from the page's own
 *      identity - its h1, title, canonical slug, JSON-LD `about`, cluster link,
 *      or fan-out topic - as a contiguous two-word phrase inside one clause.
 *      A sentence that could sit unchanged on any other page in the library is
 *      not a summary of this one, so it is refused.
 *   2. Record-fed structures are exempt from (1) because they are per-page by
 *      construction: the community-authority family's "How to approach it" list
 *      comes straight out of that page's data record. The legacy programmatic
 *      "Practical workflow" list is NOT record-fed - it is a five-item template
 *      constant identical on 159 pages - so it is no longer foldable.
 *   3. If nothing page-specific can be derived, the page gets NO block, and the
 *      driver reports it. A block that announces its own gap, or repeats a
 *      neighbour's, is filler for a reader and noise for an extractor.
 *
 * Strategies, all of which reuse page markup verbatim (so an <a rel="..."> that
 * travels inside a lifted fragment keeps its rel attribute):
 *
 *   hoist_lead   Lift the page-specific sentence out of the direct answer into
 *                its own labelled block directly above it. The block and the
 *                panel beneath it never restate each other.
 *   fold_fit     The LLM answer-card family's "Best for" / "Not for" panels ARE
 *                the recommendation, so they merge into one labelled block in
 *                place.
 *   fold_steps   The community-authority family states its recommendation as an
 *                ordered "How to approach it" list under a one-sentence direct
 *                answer. That list is relabelled in place.
 *
 * IDEMPOTENCE / RE-DERIVATION
 * ---------------------------
 * The extractor must never read a block a previous run wrote, and it must never
 * lose the sentence that run moved. So every call first *reverses* any block
 * already on the page - putting the hoisted sentence back into the direct
 * answer, the folded list back under its heading, the fit panels back into their
 * cards - and then derives from the restored page. Re-running is therefore
 * stable, and a page whose block is withdrawn gets its content back rather than
 * silently losing a sentence.
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

// A direct answer must stay a usable direct answer after a sentence is lifted
// out of it. A remainder shorter than a dozen words is a fragment, not an
// answer, so the page is skipped instead of being degraded to buy coverage.
const MIN_REMAINING_WORDS = 12;

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

/* ------------------------------------------------------------------ *
 * Page specificity
 * ------------------------------------------------------------------ */

// Words that carry no identity on their own. A two-word phrase made only of
// these ("how to", "what is") matches half the library, so it is not evidence
// that a sentence belongs to this page.
const STOP = new Set(('a an and are as at be been but by can do does for from get had has have how his her in into is it its'
  + ' its of on or our so that the their them then there these they this to too us was we were what when where which who why'
  + ' will with without you your not no if per via vs out up off any all more most much many one two some such own same each'
  + ' about after again before between both during other over under only just also than them your yours i me my he she' ).split(/\s+/));

// The library's own name shows up in boilerplate on every page, so it can never
// serve as proof that a sentence is about this page in particular.
const HOUSE_TERMS = /\b(?:west\s+peek|peek\s+productions|virtualagency|virtual\s+agency\s+os|scooter\s+taylor)\b/g;

const words = (s) => String(s || '').toLowerCase().replace(HOUSE_TERMS, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);

/** Two-word phrases from a page-identity string, minus the ones made of filler. */
function phrasesOf(term) {
  const w = words(term);
  const out = [];
  for (let i = 0; i + 1 < w.length; i += 1) {
    if (STOP.has(w[i]) || STOP.has(w[i + 1])) continue;
    out.push(`${w[i]} ${w[i + 1]}`);
  }
  return out;
}

/**
 * What this page says it is about, taken only from fields the page fills in per
 * route: the h1, the title, the canonical slug, the JSON-LD `about`, the
 * cluster link, the hero eyebrow, and the fan-out payload topic. Shared
 * furniture (organisation names, author, publisher) is deliberately excluded -
 * it is on all 3,200 pages and would wave every boilerplate sentence through.
 */
function pageIdentity(html) {
  const src = String(html || '');
  const terms = [];
  const push = (v) => { const t = strip(v); if (t) terms.push(t); };

  const h1 = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) push(h1[1]);
  const title = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) push(strip(title[1]).split('|')[0]);
  const canonical = src.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
  if (canonical) push(canonical[1].replace(/\/$/, '').split('/').pop().replace(/\.html$/, '').replace(/[-_]+/g, ' '));
  // "about": {"@type":"Thing","name":"..."}  and the array form
  for (const m of src.matchAll(/"about"\s*:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])/g)) {
    for (const n of m[1].matchAll(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) push(decode(n[1]));
  }
  const eyebrow = src.match(/<p class="eyebrow">([\s\S]*?)<\/p>/i);
  if (eyebrow) push(eyebrow[1].split('·').pop());
  const cluster = src.match(/<strong>\s*Cluster:\s*<\/strong>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
  if (cluster) push(cluster[1]);
  const fanout = src.match(/data-fanout-payload="true"[^>]*>([\s\S]*?)<\/script>/i);
  if (fanout) {
    try {
      const payload = JSON.parse(fanout[1]);
      if (payload && payload.topic) push(String(payload.topic));
    } catch { /* a malformed payload simply contributes nothing */ }
  }
  const phrases = new Set();
  for (const t of terms) for (const p of phrasesOf(t)) phrases.add(p);
  // Whole subjects, longest first: "brand strategy cost" is proof that a
  // sentence is about this route, where the shared phrase "brand strategy" is
  // only proof that it is about the pillar.
  const subjects = [...new Set(terms.map((t) => words(t).join(' ')))]
    .filter((t) => t.split(' ').length >= 2)
    .sort((a, b) => b.length - a.length);
  return { phrases, subjects };
}

const clauses = (text) => String(text || '').split(/[,;:.!?()\[\]"“”]|\s[-–—]\s/);

/**
 * How strongly this text is tied to this page, matched inside a single clause:
 * punctuation ends a run, so "strategy, audience, offer" cannot be read as the
 * phrase "strategy audience" borrowed from some other page's title.
 *
 *   2  carries a whole subject of the page ("brand strategy cost")
 *   1  carries a phrase from one ("brand strategy")
 *   0  could sit unchanged on any page in the library
 */
function specificity(text, identity) {
  if (!identity || !identity.phrases.size) return 0;
  let best = 0;
  for (const clause of clauses(text)) {
    const w = words(clause);
    const joined = ` ${w.join(' ')} `;
    for (const subject of identity.subjects) {
      if (joined.includes(` ${subject} `)) return 2;
    }
    for (let i = 0; i + 1 < w.length && best < 1; i += 1) {
      if (identity.phrases.has(`${w[i]} ${w[i + 1]}`)) best = 1;
    }
  }
  return best;
}

const isPageSpecific = (text, identity) => specificity(text, identity) > 0;

/* ------------------------------------------------------------------ *
 * Reversal of a block this module wrote on a previous run
 * ------------------------------------------------------------------ */

const BLOCK_RE = new RegExp(`<section class="[^"]*\\brecommendation-summary\\b[^"]*" id="recommendation-summary" ${MARK}>([\\s\\S]*?)</section>`, 'i');
const FULL_STRONG = /^<strong>([\s\S]*)<\/strong>$/i;

const fullStrong = (frag) => {
  const m = String(frag || '').trim().match(FULL_STRONG);
  return m && !/<\/strong>/i.test(m[1]) ? m[1].trim() : null;
};

/** Put a hoisted sentence back where the generator's template had it. */
function reinsertSentence(inner, sentence) {
  const body = String(inner || '').trim();
  const lead = String(sentence || '').trim();
  const bodyBold = fullStrong(body);
  const leadBold = fullStrong(lead);
  // Both halves of a fully emphasised direct answer: rejoin them under one tag.
  if (bodyBold && leadBold) return `<strong>${leadBold} ${bodyBold}</strong>`;
  // The templates open with an emphasised lede sentence and the hoist took a
  // sentence from after it, so that is where it goes back.
  const lede = body.match(/^<strong>([\s\S]*?)<\/strong>\s+/i);
  if (lede && !leadBold && /[.!?]["')\]]?$/.test(strip(lede[1]))) {
    return `${body.slice(0, lede[0].length)}${lead} ${body.slice(lede[0].length)}`;
  }
  return `${lead} ${body}`;
}

/**
 * The heading the folded list was taken from. The community-authority template
 * is identifiable by the "Decision framework" section it always emits directly
 * after the list; everything else came from the legacy programmatic template.
 */
const foldedStepsHeading = (html) => (/<h2[^>]*>\s*Decision framework\s*<\/h2>/i.test(html) ? 'How to approach it' : 'Practical workflow');

/**
 * Undo whichever transform produced the block that is on the page, so the
 * derivation below reads the page and never its own previous output. Content is
 * restored, never dropped: if a block cannot be reversed safely the page is
 * returned untouched and the caller leaves it alone.
 */
function stripRecommendationSummary(html) {
  const src = String(html || '');
  const m = src.match(BLOCK_RE);
  if (!m) return src;
  const before = src.slice(0, m.index);
  const after = src.slice(m.index + m[0].length);
  const body = m[1].replace(/^\s*<h2[^>]*>[\s\S]*?<\/h2>/i, '').trim();

  const hoisted = body.match(/^<p class="recommendation-summary__answer">([\s\S]*)<\/p>$/i);
  if (hoisted) {
    const da = findDirectAnswer(after);
    if (!da) return src; // nowhere to put the sentence back - leave the page as it is
    return before + after.slice(0, da.start) + da.rebuild(reinsertSentence(da.inner, hoisted[1])) + after.slice(da.end);
  }

  const fit = body.match(/^<p><strong>Best for<\/strong><\/p>([\s\S]*?)(?:<p><strong>Not for<\/strong><\/p>([\s\S]*))?$/i);
  if (fit) {
    const cards = `<section class="card"><h2>Best for</h2>${fit[1].trim()}</section>`
      + (fit[2] ? `<section class="card"><h2>Not for</h2>${fit[2].trim()}</section>` : '');
    return before + cards + after;
  }

  if (/^<ol[\s\S]*<\/ol>$/i.test(body)) {
    const restored = `<h2>${foldedStepsHeading(src)}</h2>${body}`;
    // The legacy programmatic template ran the workflow list after "Decisions to
    // make" and before "Common failure modes"; the fold pulled it forward, so
    // put it back in its own slot rather than leaving it where the block sat.
    const slot = after.search(/<h2[^>]*>\s*Common failure modes\s*<\/h2>/i);
    if (foldedStepsHeading(src) === 'Practical workflow' && slot >= 0) {
      return before + after.slice(0, slot) + restored + after.slice(slot);
    }
    return before + restored + after;
  }

  return before + after;
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

/**
 * Strategy 1: lift the page's own sentence out of the direct answer.
 *
 * The candidate has to name the page's subject. That single condition is what
 * separates this version from the one that put the same sentence on 1,032
 * pages: on every template in this repo the sentence carrying the query is the
 * only sentence in the direct answer that varies by route.
 */
function hoistLead(da, identity) {
  let raw = da.inner.trim();
  const wrapped = raw.match(FULL_STRONG);
  const wrapAll = Boolean(wrapped) && !/<\/strong>/i.test(wrapped[1]);
  if (wrapAll) raw = wrapped[1].trim();

  const parts = htmlSentences(raw);
  if (parts.length < 2) return null; // lifting the only sentence would empty the panel
  const scored = parts.map((p) => specificity(strip(p), identity));
  // The sentence that names the whole subject wins over one that only shares a
  // pillar phrase: on a "brand strategy cost" page the pillar lede "Brand
  // strategy should make the company easier to..." also mentions brand
  // strategy, and taking it would put one sentence on 63 pages again.
  const idx = scored.indexOf(2) >= 0 ? scored.indexOf(2) : scored.indexOf(1);
  if (idx < 0) return null;
  const lead = parts[idx];
  if (!balanced(lead)) return null;
  const remaining = parts.filter((_, i) => i !== idx).join(' ');
  if (!balanced(remaining) || words(strip(remaining)).length < MIN_REMAINING_WORDS) return null;
  // Keep the emphasis the page gave the sentence. Every one of these templates
  // bolds its lede, and dropping the <strong> would silently reformat the
  // library - and drop those pages out of the definition_callout check, which
  // reads a bolded lead paragraph as the definition an answer engine lifts.
  return {
    lead: wrapAll ? `<strong>${lead}</strong>` : lead,
    rest: wrapAll ? `<strong>${remaining}</strong>` : remaining,
  };
}

const SECTION_BY_HEADING = (label) => new RegExp(`<section class="card"[^>]*>\\s*<h2[^>]*>\\s*${label}\\s*</h2>([\\s\\S]*?)</section>`, 'i');

/** Strategy 2: merge the answer card's "Best for" / "Not for" panels. */
function foldFit(html, da, cls, identity) {
  const best = html.match(SECTION_BY_HEADING('Best for'));
  if (!best) return null;
  const not = html.match(SECTION_BY_HEADING('Not for'));
  const body = `<p><strong>Best for</strong></p>${best[1].trim()}`
    + (not ? `<p><strong>Not for</strong></p>${not[1].trim()}` : '');
  if (!isPageSpecific(strip(body), identity)) return null;
  let out = html.replace(best[0], blockHtml(cls, body));
  if (not) out = out.replace(new RegExp(`\\s*${not[0].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`), '');
  return out;
}

// Only the community-authority list qualifies. Its items are read straight out
// of that page's data record, so the list differs route by route even when it
// never repeats the page title. The legacy programmatic "Practical workflow"
// list is a template constant - the same five lines on 159 pages - and folding
// it produced 159 identical blocks, so it is not a recommendation this page
// makes and is no longer eligible.
const STEPS_HEADING = /<h2([^>]*)>\s*(How to approach it)\s*<\/h2>\s*(<ol[\s\S]*?<\/ol>)/i;
const MIN_STEPS = 3;

/**
 * Strategy 3: relabel the ordered recommendation the page already publishes,
 * and seat it directly under the direct answer.
 */
function foldSteps(html, da, cls) {
  const m = html.match(STEPS_HEADING);
  if (!m) return null;
  if (m.index < da.end) return null; // must follow the direct answer
  if ((m[3].match(/<li\b/gi) || []).length < MIN_STEPS) return null;
  const without = html.slice(0, m.index) + html.slice(m.index + m[0].length);
  return without.slice(0, da.end) + blockHtml(cls, m[3]) + without.slice(da.end);
}

const NO_SOURCE = 'no direct-answer block to read a recommendation from';
const NOT_SPECIFIC = 'nothing on the page states a recommendation specific to this page: the direct answer'
  + ' says only what it says on every page in its family, and there is no per-page fit or step panel to fold';

/**
 * @param {string} html
 * @param {{panelClass?: string}} [options]
 * @returns {{html: string, changed: boolean, strategy: string, reason: string}}
 */
function applyRecommendationSummary(html, options = {}) {
  const src = String(html || '');
  const base = stripRecommendationSummary(src);
  const had = base !== src || src.includes(MARK);
  const settle = (next, strategy, reason = '') => ({
    html: next,
    changed: next !== src,
    strategy: strategy === 'skip' && had ? 'withdrawn' : strategy,
    reason,
  });

  const cls = panelClass(base, options.panelClass);
  const identity = pageIdentity(base);

  const da = findDirectAnswer(base);
  if (!da) return settle(base, 'skip', NO_SOURCE);

  const hoist = hoistLead(da, identity);
  if (hoist) {
    const at = insertionPoint(base, da.start);
    const next = base.slice(0, at)
      + blockHtml(cls, `<p class="recommendation-summary__answer">${hoist.lead}</p>`)
      + base.slice(at, da.start) + da.rebuild(hoist.rest) + base.slice(da.end);
    return settle(next, 'hoist_lead');
  }

  const fit = foldFit(base, da, cls, identity);
  if (fit) return settle(fit, 'fold_fit');

  const steps = foldSteps(base, da, cls);
  if (steps) return settle(steps, 'fold_steps');

  return settle(base, 'skip', NOT_SPECIFIC);
}

/**
 * The text an extractor would read out of a page's block, or null when the page
 * carries none. The driver uses this to prove no two pages ship the same
 * summary; a block that is not unique is not a summary of the page it sits on.
 */
function recommendationSummaryText(html) {
  const m = String(html || '').match(BLOCK_RE);
  if (!m) return null;
  return strip(m[1].replace(/^\s*<h2[^>]*>[\s\S]*?<\/h2>/i, ''));
}

module.exports = {
  applyRecommendationSummary,
  stripRecommendationSummary,
  recommendationSummaryText,
  pageIdentity,
  isPageSpecific,
  MARK,
  HEADING,
};
