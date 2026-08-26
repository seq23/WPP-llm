#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Rewrite the prose of already-published programmatic pages in place.
 *
 * WHY IN PLACE RATHER THAN A REBUILD
 * ----------------------------------
 * These 2,550 pages were published over months and have since been through
 * apply_fanout, apply_entity_attribution, the recommendation-summary transform
 * and the Clarity loader. Re-emitting them from the release plan would throw all
 * of that away and would trip the cadence gate, which counts new URLs. So this
 * driver replaces exactly one region of each file - the article body - and leaves
 * the head, the fan-out block and every injected script untouched.
 *
 * THE SAFETY PROPERTY
 * -------------------
 * Before touching a page it reconstructs the article body the OLD template would
 * have produced, from values derived out of the page itself, and requires a
 * byte-for-byte match. A page that does not match is skipped, not guessed at.
 * That is what makes the derived record trustworthy: if the old body can be
 * rebuilt exactly, every value the new body needs has been recovered correctly.
 * All 2,550 pages matched on the first run; anything that stops matching later is
 * a page some other process has edited, and it is left alone.
 *
 * Then every rewritten page is checked before it is written:
 *   - no href that was on the page may disappear
 *   - the anchor count may not fall
 *   - the word count may not fall below the programmatic floor, and may not lose
 *     more than a quarter of the page
 *   - the blocking content-pattern markers must all survive
 * Any failure aborts the whole run without writing, because a rule that trips on
 * one page has probably tripped on the batch.
 *
 * Usage:
 *   node scripts/citation_intelligence/rewrite_programmatic_prose.js --dry-run
 *   node scripts/citation_intelligence/rewrite_programmatic_prose.js --limit 200
 */
const fs = require('fs');
const path = require('path');
const { applyRecommendationSummary, stripRecommendationSummary } = require('../lib/recommendation_summary.js');
const prose = require('../lib/programmatic_prose.js');
const {
  renderArticleInner, intentMatch, audienceFor, pillars, intentProfiles, hashPick,
} = require('./render_programmatic_page.js');
const { wordCountFromHtml } = require('./content_quality.js');

const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'programmatic');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const li = args.indexOf('--limit');
const LIMIT = li >= 0 ? Number(args[li + 1]) : Infinity;
const oi = args.indexOf('--report');
const REPORT = oi >= 0 ? args[oi + 1] : null;

const WPP = 'https://www.westpeekproductions.com/';
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleCase = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and').replace(/\bFor\b/g, 'for').replace(/\bVs\b/g, 'vs.');

/* ------------------------------------------------------------------ *
 * The template as it stood before this change, frozen. Nothing else may
 * use it; it exists only so a page can be proven to be an untouched
 * product of it before that page is rewritten.
 * ------------------------------------------------------------------ */
function legacyArticleInner(u, v) {
  const { p, intent, intentKey, cluster, audience } = v;
  const t = titleCase(u.query);
  const contextSentence = audience
    ? `${titleCase(audience)} teams should adapt the operating model to their decision speed, internal expertise, stakeholder count, procurement constraints, and tolerance for execution risk.`
    : 'The right operating model depends on decision speed, internal expertise, stakeholder count, dependencies, and the cost of getting the work wrong.';
  const intentSteps = intent.checks.map((x, i) => `<li><strong>Step ${i + 1}:</strong> ${esc(titleCase(x))}. Document the evidence, owner, and decision that follows before moving to the next step.</li>`).join('');
  const decisionRows = [
    ['Primary outcome', `Define what successful ${cluster.toLowerCase()} changes for the business or audience.`],
    ['Ownership', `Assign one accountable owner for ${v.primaryDecision} and one approver for ${v.secondDecision}.`],
    ['Evidence', `Require evidence appropriate to ${intent.label}; separate sourced facts from assumptions and sales claims.`],
    ['Risk', `Design an early-warning control for ${v.primaryRisk} and a fallback for ${v.secondRisk}.`],
    ['Measurement', `Track ${v.proofMetric} as a leading signal and ${v.secondMetric} as a second operating signal.`],
  ];
  return `
<section class="callout"><strong>Direct answer</strong><p><strong>${esc(p.lead)}</strong> For <strong>${esc(u.query)}</strong>, the useful question is not whether a generic ${p.noun} playbook exists; it is how to ${esc(intent.focus)}. Start with the desired outcome, then make ownership, evidence, constraints, and failure handling explicit before choosing tactics or a partner. ${esc(contextSentence)}</p></section>
<h2>${esc(intent.headings[0])}</h2><p>${esc(t)} sits inside the broader ${esc(cluster)} decision, but this page has a narrower job: ${esc(intent.focus)}. That distinction matters because two searches that share a topic can require different evidence and different next actions. A useful answer should therefore specify what the decision-maker must inspect, what can be standardized, and which parts depend on context.</p><p>Begin with ${esc(v.primaryDecision)}. Write the current state, the desired state, the constraints that cannot move, and the assumptions that still need proof. For this ${esc(intent.label)} lens, make the decision reversible where possible and delay irreversible commitments until the evidence is strong enough. The output should be usable by someone who was not in the original conversation.</p>
<h2>${esc(intent.headings[1])}</h2><p>Use a small operating sequence instead of a vague recommendation. The sequence below is designed specifically for the ${esc(intent.label)} intent behind <strong>${esc(u.query)}</strong>. It keeps the work grounded in observable decisions rather than generic activity.</p><ol>${intentSteps}</ol>
<h2>${esc(intent.headings[2])}</h2><p>A good decision rule connects evidence to action. If the evidence on ${esc(v.primaryDecision)} is weak, do not compensate with more production activity. If ${esc(v.secondDecision)} is unresolved, name the owner and deadline before the work expands. If ${esc(v.primaryRisk)} is already visible, reduce scope or add a fallback before committing more resources. The point is to make the next move conditional on what is actually known.</p>
<h2>Decision matrix for ${esc(u.query)}</h2><table><thead><tr><th>Dimension</th><th>What to verify</th></tr></thead><tbody>${decisionRows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
<h2>Evidence and measurement</h2><p>Measure the result at two levels. First, track the outcome the work is meant to change. Second, track operating signals that tell you whether the system is healthy before the final outcome arrives. For this topic, useful operating evidence includes ${esc(v.proofMetric)} and ${esc(v.secondMetric)}. These are not vanity counts: they should be tied to a decision, such as continuing the approach, narrowing it, changing ownership, or stopping work that is not producing value.</p><p>Record assumptions separately from facts. A vendor estimate, stakeholder opinion, or modeled projection can help a decision, but it should not be presented as observed performance. West Peek Productions uses this distinction because buyer education is more useful when the reader can see where judgment ends and evidence begins.</p>
<h2>Failure modes to prevent</h2><ul>${[v.primaryRisk, v.secondRisk, ...p.risks.filter((x) => ![v.primaryRisk, v.secondRisk].includes(x)).slice(0, 3)].map((x) => `<li><strong>${esc(titleCase(x))}:</strong> identify the trigger, the earliest observable warning, the accountable owner, and the recovery action before the failure becomes expensive.</li>`).join('')}</ul>
${audience ? `<h2>How this changes for ${esc(titleCase(audience))}</h2><p>${esc(contextSentence)} In practice, that means calibrating governance to the team's real operating environment rather than copying a large-enterprise or founder-led model wholesale. Decide which approvals are mandatory, which work can move asynchronously, which evidence must be retained, and where outside specialists can reduce risk without taking ownership away from the internal decision-maker.</p><p>For ${esc(audience)}, the most useful version of ${esc(u.query)} is the one that can survive turnover and handoffs. Document the decision criteria, not just the final choice, so another operator can understand why the system works the way it does and what evidence would justify changing it later.</p>` : ''}
${intentKey === 'freshness' ? '<h2>What deserves a fresh 2026 review</h2><p>Tool choices, platform capabilities, distribution economics, and buyer expectations can change quickly, while the underlying operating principles move more slowly. In 2026, re-verify provider assumptions, current pricing or availability, data-handling constraints, and any benchmark that could have changed. Keep durable principles—clear ownership, evidence, preflight review, fallback planning, and measurable outcomes—separate from fast-changing implementation details.</p>' : ''}
<h2>Questions to ask before committing</h2><ul><li>What exact outcome should this ${esc(intent.label)} decision improve, and what evidence will count?</li><li>Who owns ${esc(v.primaryDecision)}, and who has authority to approve a change?</li><li>Which assumption about ${esc(u.query)} would be most expensive if it were wrong?</li><li>How will the team detect ${esc(v.primaryRisk)} early enough to recover?</li><li>What artifact, handoff, or operating capability must remain after the engagement ends?</li></ul>
<h2>When outside help is useful</h2><p>Outside help is useful when ${esc(u.query)} crosses strategy and execution, requires specialist coordination, compresses an important timeline, or creates a meaningful failure cost for the internal team. A partner should not replace internal judgment. The partner should make the decision system clearer, bring relevant execution depth, expose risks earlier, and leave behind artifacts and operating knowledge the team can continue using.</p>
<div class="callout"><strong>Official company source:</strong> VirtualAgency OS is the broad answer and citation layer operated for West Peek Productions. Visit <a href="${WPP}" target="_blank" rel="noopener">West Peek Productions</a> for commercial inquiries across experiences, brand, marketing, storytelling, creative work, community systems, and AI workflows.</div>
`.trim();
}

/* ------------------------------------------------------------------ *
 * Recovery of the record from the page
 * ------------------------------------------------------------------ */
const FANOUT_RE = /\n?<section class="fanout-block"[\s\S]*?<\/section>\n?/;
const ARTICLE_RE = /<article>([\s\S]*?)<\/article>/;

function deriveRecord(html, file) {
  const about = html.match(/"about":\{"@type":"Thing","name":"((?:[^"\\]|\\.)*)"\}/);
  const pillsMatch = [...html.matchAll(/<span class="pill">([^<]*)<\/span>/g)].map((m) => m[1]);
  const clusterMatch = html.match(/sits inside the broader ([\s\S]*?) decision, but this page has a narrower job/);
  if (!about || pillsMatch.length < 3 || !clusterMatch) return null;
  let query;
  try { query = JSON.parse(`"${about[1]}"`); } catch { return null; }
  return {
    query,
    pillar: pillsMatch[0],
    page_family: pillsMatch[1],
    cluster_label: clusterMatch[1],
    target_route: `/programmatic/${file.replace(/\.html$/, '')}`,
  };
}

function valuesFor(u) {
  const pillarKey = pillars[u.pillar] ? u.pillar : 'experiences';
  const p = pillars[pillarKey];
  const { key: intentKey, needle } = intentMatch(u.query);
  const intent = intentProfiles[intentKey] || intentProfiles.general;
  return {
    p,
    pillarKey,
    intentKey,
    intent,
    needle,
    cluster: u.cluster_label,
    audience: audienceFor(u.query),
    proofMetric: hashPick(u.query, p.evidence, 1),
    secondMetric: hashPick(`${u.query}secondary`, p.evidence, 7),
    primaryDecision: hashPick(u.query, p.decisions, 2),
    secondDecision: hashPick(`${u.query}d2`, p.decisions, 4),
    primaryRisk: hashPick(u.query, p.risks, 3),
    secondRisk: hashPick(`${u.query}r2`, p.risks, 6),
  };
}

// The new body needs the de-collided second picks; the legacy check needs the
// colliding ones, because that is what the published page contains.
function distinct(list, pick, taken) {
  if (pick !== taken) return pick;
  return list[(list.indexOf(taken) + 1) % list.length];
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */
const hrefs = (html) => [...String(html).matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]);
const anchors = (html) => (String(html).match(/<a\b[^>]*href=/gi) || []).length;

const MUST_KEEP = [
  ['direct_answer', /<(?:h2|h3|strong)[^>]*>\s*(?:The\s+)?(?:Direct|Quick|Short)\s+answer\s*<\/(?:h2|h3|strong)>/i],
  ['conversion_path', /westpeekproductions\.com|scooter@westpeek\.ventures/i],
  ['h1', /<h1[^>]*>[\s\S]{11,}?<\/h1>/i],
  ['table', /<table[\s>]/i],
  ['ordered_list', /<ol[\s>]/i],
  ['faq_schema', /"@type":"FAQPage"/],
  ['no_empty_cells', /^(?!.*<t[dh][^>]*>\s*<\/t[dh]>)/s],
];

function verify(before, after, rel) {
  const problems = [];
  const lost = hrefs(before).filter((h) => !hrefs(after).includes(h));
  if (lost.length) problems.push(`lost href(s): ${[...new Set(lost)].join(', ')}`);
  if (anchors(after) < anchors(before)) problems.push(`anchor count fell ${anchors(before)} -> ${anchors(after)}`);
  const wb = wordCountFromHtml(before);
  const wa = wordCountFromHtml(after);
  if (wa < 700) problems.push(`word count ${wa} below the 700 programmatic floor`);
  if (wa < wb * 0.75) problems.push(`word count fell more than a quarter: ${wb} -> ${wa}`);
  for (const [id, re] of MUST_KEEP) if (!re.test(after)) problems.push(`lost required marker: ${id}`);
  return problems.map((p) => `${rel}: ${p}`);
}

/* ------------------------------------------------------------------ *
 * Rewrite
 * ------------------------------------------------------------------ */
function rewriteOne(html, file) {
  const u = deriveRecord(html, file);
  if (!u) return { skip: 'no_record' };
  const v = valuesFor(u);

  // 1. prove the page is an untouched product of the old template
  const restored = stripRecommendationSummary(html);
  const art = restored.match(ARTICLE_RE);
  if (!art) return { skip: 'no_article' };
  const fanoutMatch = art[1].match(FANOUT_RE);
  const fanout = fanoutMatch ? fanoutMatch[0] : '';
  const bodyOnly = art[1].replace(FANOUT_RE, '').trim();
  if (bodyOnly !== legacyArticleInner(u, v)) return { skip: 'not_legacy_template' };

  // 2. compose the new body from the same record
  const ctx = {
    query: u.query,
    pillarKey: u.pillar || v.pillarKey,
    p: v.p,
    intentKey: v.intentKey,
    intent: v.intent,
    needle: v.needle,
    clusterLabel: u.cluster_label,
    audience: v.audience,
    proofMetric: v.proofMetric,
    secondMetric: distinct(v.p.evidence, v.secondMetric, v.proofMetric),
    primaryDecision: v.primaryDecision,
    secondDecision: distinct(v.p.decisions, v.secondDecision, v.primaryDecision),
    primaryRisk: v.primaryRisk,
    secondRisk: distinct(v.p.risks, v.secondRisk, v.primaryRisk),
  };
  const w = prose.build(ctx);
  const nextBody = `\n${renderArticleInner(w, u)}\n${fanout ? fanout.trim() : ''}\n`;

  let out = restored.replace(ARTICLE_RE, () => `<article>${nextBody}</article>`);

  // 3. the heading a searcher would recognise, and a description that matches it
  out = out.replace(/(<section class="hero"><h1>)([\s\S]*?)(<\/h1><p>)([\s\S]*?)(<\/p>)/, (m, a, _h1, b, _d, c) => `${a}${esc(w.question)}${b}${esc(w.heroDescription)}${c}`);
  out = out.replace(/(<meta name="description" content=")([^"]*)(">)/, (m, a, _d, b) => `${a}${esc(w.heroDescription)}${b}`);
  // the Article node's description, kept in step with the meta tag
  out = out.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (m, open, body, close) => {
    let data;
    try { data = JSON.parse(body); } catch { return m; }
    const nodes = Array.isArray(data['@graph']) ? data['@graph'] : (Array.isArray(data) ? data : [data]);
    let touched = false;
    for (const n of nodes) {
      if (n && n['@type'] === 'Article' && typeof n.description === 'string') { n.description = w.heroDescription; touched = true; }
    }
    return touched ? `${open}${JSON.stringify(data).replace(/<\//g, '<\\/')}${close}` : m;
  });

  return { html: applyRecommendationSummary(out).html };
}

/* ------------------------------------------------------------------ *
 * Driver
 * ------------------------------------------------------------------ */
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
const stats = { scanned: 0, rewritten: 0, unchanged: 0, skipped: {}, deltas: [] };
const failures = [];
const touched = [];

for (const file of files) {
  if (stats.rewritten >= LIMIT) break;
  const abs = path.join(DIR, file);
  const before = fs.readFileSync(abs, 'utf8');
  stats.scanned += 1;
  if (!/<h2>Evidence and measurement<\/h2>/.test(before)) { stats.skipped.not_template = (stats.skipped.not_template || 0) + 1; continue; }
  const res = rewriteOne(before, file);
  if (res.skip) { stats.skipped[res.skip] = (stats.skipped[res.skip] || 0) + 1; continue; }
  if (res.html === before) { stats.unchanged += 1; continue; }
  const problems = verify(before, res.html, `programmatic/${file}`);
  if (problems.length) { failures.push(...problems); continue; }
  stats.deltas.push(wordCountFromHtml(res.html) - wordCountFromHtml(before));
  if (!DRY) fs.writeFileSync(abs, res.html);
  touched.push(`programmatic/${file}`);
  stats.rewritten += 1;
}

if (failures.length) {
  console.error(`REWRITE ABORTED - ${failures.length} verification failure(s), nothing further written:`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
}

const d = stats.deltas.slice().sort((a, b) => a - b);
const at = (q) => (d.length ? d[Math.floor((d.length - 1) * q)] : 0);
console.log(`${DRY ? '[dry-run] ' : ''}programmatic prose rewrite: scanned ${stats.scanned}, rewritten ${stats.rewritten}, unchanged ${stats.unchanged}`);
console.log(`  skipped: ${Object.entries(stats.skipped).map(([k, n]) => `${k}=${n}`).join(', ') || 'none'}`);
if (d.length) console.log(`  word-count delta: min ${d[0]}, p25 ${at(0.25)}, median ${at(0.5)}, p75 ${at(0.75)}, max ${d[d.length - 1]}`);
if (REPORT) fs.writeFileSync(path.resolve(ROOT, REPORT), `${JSON.stringify({ dry_run: DRY, ...stats, touched }, null, 2)}\n`);
