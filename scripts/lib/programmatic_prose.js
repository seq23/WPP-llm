'use strict';
/**
 * Per-page prose for the programmatic family.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * scripts/citation_intelligence/render_programmatic_page.js used to emit nine
 * fixed paragraphs on every page. Measured over the 2,550 pages the template
 * produced, ~499 words of every page were word-for-word identical to every other
 * page, against a median page of ~1,048 words. `node scripts/template_share.js`
 * scored the library at 47.0% median template share against a 40% ceiling: the
 * worst number in the portfolio, and the reason a retrieval system reads these
 * pages as near-duplicates of each other rather than as 2,550 distinct answers.
 *
 * Two of those nine paragraphs interpolated nothing at all - the same characters
 * on every page. They are gone. The rest are composed here instead, from data the
 * renderer already holds.
 *
 * HOW THE VARIATION IS EARNED
 * ---------------------------
 * Nothing here is authored per page and nothing asserts a new fact. Every
 * sentence is built from three real dimensions the page already carries:
 *
 *   mode    which of eight decision shapes the page's intent belongs to
 *           (a cost page and a failure-modes page should not read alike)
 *   voice   which of three pillar groups the page sits in (a live-production
 *           page and a narrative page do not describe the same kind of work)
 *   record  the page's own query, cluster, audience, pillar decisions, pillar
 *           risks, pillar evidence signals, and intent checks
 *
 * A clause pool indexed by mode and a clause pool indexed by voice combine into
 * 8 x 3 = 24 distinct sentence shapes per slot, each carrying per-page nouns from
 * the record. The largest mode covers 27.6% of the family and the largest voice
 * about half of it, so no single sentence shape reaches the 60%-of-pages
 * threshold that scripts/template_share.js counts as scaffolding - and no shape
 * is picked at random: the page's own intent and pillar decide it.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No statistics, no client outcomes, no named third parties, no dates, no
 * pricing. The source records carry decisions, risks and evidence signals as
 * short noun phrases; this module recombines those and nothing else. If a slot
 * cannot be made page-specific from the record, it is not emitted.
 */

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleCase = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and').replace(/\bFor\b/g, 'for').replace(/\bVs\b/g, 'vs.');
const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
const lower = (s) => String(s || '').replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());
const article = (s) => (/^[aeiou]/i.test(String(s || '').trim()) ? 'An' : 'A');

// Three intent labels are verb phrases, and a verb phrase does not read as a
// noun in "a ___ guide to X" or "what a ___ call has to rest on".
const LENS_OF = { 'decision guide': 'decision', 'when to hire': 'hiring', '2026 update': '2026 review', 'in-house comparison': 'in-house versus partner' };

/* ------------------------------------------------------------------ *
 * Dimension 1: mode. Eight decision shapes, assigned from the page's
 * intent key. The mapping is editorial, not arbitrary - it groups the 48
 * intents by what the reader is actually trying to settle.
 * ------------------------------------------------------------------ */
const MODE_OF = {
  definition: 'define', services: 'define', deliverables: 'define', scope: 'define',
  template: 'define', brief: 'define', examples: 'define',
  choose: 'select', vendors: 'select', comparison: 'select', in_house: 'select', hire: 'select',
  cost: 'commercial', pricing: 'commercial', roi: 'commercial', scope_creep: 'commercial', engagement: 'commercial',
  workflow: 'operate', process: 'operate', implementation: 'operate', operating_model: 'operate',
  internal_workflow: 'operate', kickoff: 'operate', best_practices: 'operate', checklist: 'operate',
  mistakes: 'risk', red_flags: 'risk', failures: 'risk', questions: 'risk', audit: 'risk',
  measurement: 'measure', framework: 'measure', case_pattern: 'measure',
  timeline: 'time', freshness: 'time',
  general: 'guide',
};
const modeFor = (intentKey) => MODE_OF[intentKey] || 'guide';

/* ------------------------------------------------------------------ *
 * Dimension 2: voice, from the pillar. Three groups, because the work
 * itself differs: something is produced live, something is written and
 * distributed, something is run as a standing system.
 * ------------------------------------------------------------------ */
const VOICE_OF = {
  experiences: 'craft', creative: 'craft',
  brand: 'story', storytelling: 'story', marketing: 'story',
  community: 'system', 'ai-workflows': 'system', 'agency-decisions': 'system', authority: 'system',
};
const voiceFor = (pillarKey) => VOICE_OF[pillarKey] || 'system';

/* ------------------------------------------------------------------ *
 * The question a searcher would type.
 *
 * intentFor() finds the phrase in the query that identifies the intent.
 * When that phrase sits at the start or the end of the query it can be
 * lifted out, leaving the subject - "agency RFP questions audit" leaves
 * "agency RFP questions", which the audit frame then asks about. When the
 * phrase is buried mid-string the query is left whole, because cutting a
 * word out of the middle produces nonsense.
 * ------------------------------------------------------------------ */
function splitOnNeedle(query, needle) {
  const q = String(query || '').trim();
  if (!needle) return { core: q, pos: 'none' };
  const i = q.toLowerCase().indexOf(String(needle).toLowerCase().trim());
  if (i < 0) return { core: q, pos: 'none' };
  const n = String(needle).trim().length;
  const clean = (s) => s.replace(/\s+/g, ' ').replace(/^[\s:,-]+|[\s:,-]+$/g, '').trim();
  if (i === 0) {
    const rest = clean(q.slice(n));
    return rest ? { core: rest, pos: 'start' } : { core: q, pos: 'none' };
  }
  if (i + n >= q.length - 1) {
    const rest = clean(q.slice(0, i));
    return rest ? { core: rest, pos: 'end' } : { core: q, pos: 'none' };
  }
  return { core: q, pos: 'none' };
}

// One frame per intent, written so it reads as a question with the page's own
// subject inside it. `mid` is the fallback used when the intent phrase could not
// be lifted cleanly out of the query; it keeps the query verbatim.
const QUESTION = {
  definition: (c) => `What is ${c}?`,
  services: (c) => `What is included in ${c} services?`,
  deliverables: (c) => `What are the deliverables for ${c}?`,
  scope: (c) => `What belongs in a ${c} scope of work?`,
  template: (c) => `What goes into a ${c} template?`,
  brief: (c) => `How do you brief a partner on ${c}?`,
  examples: (c) => `What does ${c} look like in practice?`,
  choose: (c, pos) => (pos === 'start' ? `How do you choose ${c}?` : `How do you choose the right ${c} partner?`),
  vendors: (c) => `How do you compare ${c} vendors?`,
  comparison: (c) => `How do you compare ${c} options?`,
  in_house: (c) => `Should ${c} stay in house or go to a partner?`,
  hire: (c) => `When should you hire outside help for ${c}?`,
  cost: (c) => `What does ${c} cost?`,
  pricing: (c) => `How is ${c} priced?`,
  roi: (c) => `What drives return on ${c}?`,
  scope_creep: (c) => `How do you avoid scope creep on ${c}?`,
  engagement: (c) => `What does a good ${c} engagement include?`,
  workflow: (c) => `What does the ${c} workflow look like?`,
  process: (c) => `What is the ${c} process?`,
  implementation: (c) => `How do you implement ${c}?`,
  operating_model: (c) => `What operating model does ${c} need?`,
  internal_workflow: (c) => `How do you build an internal workflow for ${c}?`,
  kickoff: (c) => `What should you prepare before a ${c} kickoff?`,
  best_practices: (c) => `What are the best practices for ${c}?`,
  checklist: (c) => `What belongs on a ${c} checklist?`,
  mistakes: (c) => `What are the most common ${c} mistakes?`,
  red_flags: (c) => `What are the red flags in ${c}?`,
  failures: (c) => `Where does ${c} most often fail?`,
  questions: (c) => `What questions should you ask about ${c}?`,
  audit: (c) => `How do you audit ${c}?`,
  measurement: (c) => `How do you measure ${c}?`,
  framework: (c) => `What framework should guide ${c}?`,
  case_pattern: (c) => `What pattern repeats across ${c} engagements?`,
  timeline: (c) => `How long does ${c} take?`,
  freshness: (c) => `What changes for ${c} in 2026?`,
  general: (c) => `What should you decide first about ${c}?`,
};

const INTERROGATIVE = /^(what|how|when|where|which|who|why|should|do|does|can|is|are)\b/i;

// When the intent phrase is buried in the middle of the query the query stays
// whole, and the heading asks the broad form of the mode's question about it.
// Eight shapes, one per mode, so the fallback is not itself a template.
const GENERAL_Q = {
  define: (q) => `What does ${q} actually cover?`,
  select: (q) => `How do you decide on ${q}?`,
  commercial: (q) => `What drives the cost of ${q}?`,
  operate: (q) => `How should ${q} be run?`,
  risk: (q) => `What can go wrong with ${q}?`,
  measure: (q) => `How do you tell whether ${q} is working?`,
  time: (q) => `What has to happen first in ${q}?`,
  guide: (q) => `What should you decide first about ${q}?`,
};

/**
 * The heading a searcher would recognise as their own question.
 * A query that already reads as a question keeps its own words.
 */
function headingQuestion(query, intentKey, needle) {
  const q = String(query || '').trim();
  if (!q) return '';
  // "how to brief a partner" is a search, not a sentence. It becomes one.
  const howTo = q.match(/^(how|what|when|where)\s+to\s+(.+)$/i);
  if (howTo) return `${cap(howTo[1])} do you ${howTo[2].replace(/\?+$/, '')}?`;
  if (INTERROGATIVE.test(q)) return `${cap(q).replace(/\?+$/, '')}?`;
  const { core, pos } = splitOnNeedle(q, needle);
  const frame = QUESTION[intentKey];
  if (pos === 'none' || !frame) return cap((GENERAL_Q[modeFor(intentKey)] || GENERAL_Q.guide)(q));
  return cap(frame(core, pos));
}

/* ------------------------------------------------------------------ *
 * Clause pools.
 *
 * Each slot draws one clause from a mode pool and one from a voice pool.
 * The per-page nouns are injected between them, so a seven-word window
 * lands either inside a clause seen by at most a quarter of the family or
 * across a boundary that contains this page's own subject.
 * ------------------------------------------------------------------ */

// What the page's narrow job is, phrased for the mode.
const JOB = {
  define: 'draw the boundary precisely enough that two people reading it would scope the same work',
  select: 'compare the live options on the same dimensions rather than on how well each one presents',
  commercial: 'expose what actually moves the number, including the work a proposal leaves out',
  operate: 'sequence the work so each handoff has an owner, an entry condition, and an approval',
  risk: 'find the point where this breaks while it is still cheap to change course',
  measure: 'separate the outcome the work is meant to change from the signals that predict it',
  time: 'order the decisions around what cannot move rather than around a calendar',
  guide: 'turn the request into a small number of explicit decisions with evidence behind each one',
};

// How the pillar's work behaves, used to close a sentence with something true
// of that pillar rather than of every page.
const NATURE = {
  craft: 'a live production is rehearsed before anyone judges it, and the decision needs rehearsal time as much as the delivery does',
  story: 'a message is repeated everywhere it travels, and reopening it later means reopening every copy of it',
  system: 'an operating model has to hold on its worst week rather than on its first',
};

const OPENERS = {
  define: 'The boundary comes first.',
  select: 'The criteria come before the candidates.',
  commercial: 'The commercial question comes before the creative one.',
  operate: 'The sequence comes before the tooling.',
  risk: 'The failure map comes before the plan.',
  measure: 'The measurement definition comes before the first report.',
  time: 'The immovable dates come before everything else.',
  guide: 'The decision comes before the deliverable.',
};

// How the mode wants its evidence stated.
const EVIDENCE_STANCE = {
  define: 'inclusion and exclusion stated as examples someone can check',
  select: 'proof drawn from a situation close enough to this one to transfer',
  commercial: 'assumptions and exclusions written down beside the number',
  operate: 'a named owner and an entry condition for every stage',
  risk: 'the earliest signal that would have shown the problem, not the eventual symptom',
  measure: 'a baseline taken before the work starts, so the change is attributable',
  time: 'a dependency map showing what each date is waiting on',
  guide: 'a written record of what was assumed and what was observed',
};

// The step tail. Four shapes per mode, rotated by step position, so the ordered
// list stops repeating one sentence four times on the same page - and each shape
// carries a term from this page's own pillar record.
const STEP_TAILS = {
  define: [
    (d) => `Write the boundary where ${d} is decided, and name one thing it excludes.`,
    (d, s) => `Give an example that clearly sits inside it and one that clearly does not, judged on ${s}.`,
    (d) => `Say who owns the wording, because ${d} will be read by people who were not in the room.`,
    (d, s, r) => `Check it against ${r}: a boundary that cannot rule anything out is not a boundary.`,
  ],
  select: [
    (d) => `Rank this against ${d} before any candidate is in the room.`,
    (d, s) => `Score every option the same way, using ${s} as the comparable.`,
    (d, s, r) => `Ask each option how it handles ${r}, and compare the answers rather than the decks.`,
    (d) => `Record why the leader leads on ${d}, in a sentence someone can disagree with.`,
  ],
  commercial: [
    (d) => `Price it including the internal time ${d} consumes.`,
    (d, s) => `Separate what is fixed from what varies with ${s}, and say which assumption drives each.`,
    (d, s, r) => `Name the change that would move this number, and what ${r} would cost if it landed late.`,
    (d) => `Tie a payment or approval to the observable completion of ${d}.`,
  ],
  operate: [
    (d) => `Name the owner and the entry condition for ${d}.`,
    (d, s) => `Define what finished means here, in terms of ${s} rather than effort spent.`,
    (d, s, r) => `Write the exception path for ${r} before the stage runs, not during it.`,
    (d) => `Hand this off in writing, so ${d} survives the person who decided it.`,
  ],
  risk: [
    (d, s, r) => `Record the earliest signal that ${r} has started, and who acts on it.`,
    (d) => `Check this against the actual artifact for ${d}, not against a summary of it.`,
    (d, s) => `Separate the symptom from the cause, and note which one ${s} would have shown first.`,
    (d) => `Rank the finding by what it costs to fix and by how much of ${d} is still open.`,
  ],
  measure: [
    (d, s) => `Set the baseline for ${s} here, before anything changes it.`,
    (d) => `State the decision this number is allowed to change, starting with ${d}.`,
    (d, s, r) => `Say what would make this number look good while ${r} got worse.`,
    (d, s) => `Agree who reads ${s}, how often, and what they are expected to do about it.`,
  ],
  time: [
    (d) => `Fix the date ${d} is waiting on, and mark it as immovable or not.`,
    (d, s) => `Work backwards from the approval, not forwards from today, and hold time for ${s}.`,
    (d, s, r) => `Put the contingency in front of the irreversible step, where ${r} would otherwise land.`,
    (d) => `Say what happens to ${d} if this date slips by a week.`,
  ],
  guide: [
    (d) => `Write the decision on ${d} down, with the owner beside it.`,
    (d, s) => `Name the evidence that would settle it, and where ${s} comes from.`,
    (d, s, r) => `State the constraint that is real, and the one that is only ${r} in disguise.`,
    (d) => `Set the point at which ${d} gets revisited rather than assumed.`,
  ],
};

function stepTail(i, p, mode) {
  const pool = STEP_TAILS[mode] || STEP_TAILS.guide;
  const decision = p.decisions[i % p.decisions.length];
  const signal = p.evidence[i % p.evidence.length];
  const risk = p.risks[i % p.risks.length];
  return pool[i % pool.length](decision, signal, risk);
}

// How each mode phrases what it wants from a partner or from internal capacity.
const OUTSIDE = {
  define: 'a partner earns their place by making the boundary sharper, not by widening it until everything is in scope',
  select: 'a partner earns their place by making the comparison honest, including where they are the wrong choice',
  commercial: 'a partner earns their place by pricing the work they will actually do and naming what they will not',
  operate: 'a partner earns their place by leaving an operating sequence the internal team can run without them',
  risk: 'a partner earns their place by surfacing the failure modes early, when they are still cheap',
  measure: 'a partner earns their place by agreeing the measurement definition before the work starts',
  time: 'a partner earns their place by protecting the critical path rather than filling the calendar',
  guide: 'a partner earns their place by making the decision system clearer than they found it',
};

// How each mode names the thing a signal is evidence *of*. Used to close the
// direct answer and the hero line, which were otherwise the last two sentences
// in the family still sharing a tail.
const SIGNAL = {
  define: 'the check that the boundary is holding',
  select: 'the check that the choice still looks right in hindsight',
  commercial: 'the number that says the spend is doing work',
  operate: 'the read on whether the sequence is running clean',
  risk: 'the early read on whether the controls are firing',
  measure: 'the primary signal, taken against a baseline',
  time: 'the read on whether the schedule is real',
  guide: 'the signal that says whether this is working',
};

// Why outside help changes the answer, phrased for the mode.
const CROSSES = {
  define: 'the boundary has to be agreed by people who disagree about it',
  select: 'the comparison needs someone with no stake in which option wins',
  commercial: 'the number has to survive a procurement review as well as an internal one',
  operate: 'the sequence spans teams that do not share a manager',
  risk: 'the failure would be absorbed by the internal team alone',
  measure: 'the measurement has to be defended, not just produced',
  time: 'the date is fixed and the critical path is already tight',
  guide: 'the work crosses strategy and execution at the same time',
};

// The sentence that stays in the Direct answer panel once the emphasised lede is
// hoisted. One shape per mode, so the panel that follows the summary is not the
// same sentence on 2,550 pages.
const SECOND = {
  define: (d, e, t) => `Settle ${d} first and write down what it excludes; a ${t} scope that cannot rule anything out will be read differently by everyone who inherits it.`,
  select: (d, e, t) => `Rank the criteria before any candidate is in the room: ${d} first, then ${e}, then whatever the shortlist wants to talk about.`,
  commercial: (d, e, t) => `Price ${d} and ${e} separately, and keep the internal time each one consumes on the same page as the external number.`,
  operate: (d, e, t) => `Run it in order - ${d}, then ownership, then ${e} - and give every stage an entry condition someone can check.`,
  risk: (d, e, t) => `Map where ${t} work breaks before planning it: ${d} first, then ${e}, then the signal that would show either one starting.`,
  measure: (d, e, t) => `Define the measurement before the first report: what ${d} is supposed to move, and what ${e} would look like if it were not moving.`,
  time: (d, e, t) => `Sequence it against what cannot move: ${d} sets the critical path, and ${e} is what slips if the path is wrong.`,
  guide: (d, e, t) => `Take it in order - ${d}, then ownership, then evidence - and leave tactics until the first three are settled.`,
};

const HEADINGS = {
  measure: {
    define: 'What tells you the definition is holding',
    select: 'What tells you the choice was right',
    commercial: 'What tells you the money is working',
    operate: 'What tells you the sequence is healthy',
    risk: 'What tells you the controls are working',
    measure: 'What to measure, and against what baseline',
    time: 'What tells you the schedule is real',
    guide: 'What tells you this is working',
  },
  failure: {
    define: 'Where the boundary usually slips',
    select: 'Where the selection usually goes wrong',
    commercial: 'Where the cost usually escapes',
    operate: 'Where the sequence usually breaks',
    risk: 'The failure modes to design against',
    measure: 'Where the measurement usually misleads',
    time: 'Where the schedule usually fails',
    guide: 'Where this usually goes wrong',
  },
  outside: {
    define: 'When an outside partner helps',
    select: 'When to bring in an outside partner',
    commercial: 'When outside help changes the economics',
    operate: 'When outside help is worth the handoff cost',
    risk: 'When outside help reduces the risk',
    measure: 'When outside help improves the evidence',
    time: 'When outside help protects the date',
    guide: 'When outside help is useful',
  },
  faq: {
    define: 'Questions about scope and boundary',
    select: 'Questions buyers ask before choosing',
    commercial: 'Questions about cost and commitment',
    operate: 'Questions about running the work',
    risk: 'Questions about what can go wrong',
    measure: 'Questions about evidence and measurement',
    time: 'Questions about sequence and timing',
    guide: 'Questions people ask about this',
  },
};

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

/**
 * ctx carries only what the page's own record already holds:
 *   query, pillarKey, p (pillar record), intentKey, intent (intent profile),
 *   clusterLabel, audience, primaryDecision, secondDecision, primaryRisk,
 *   secondRisk, proofMetric, secondMetric, needle
 */
function build(ctx) {
  const {
    query, p, intent, intentKey, clusterLabel,
    primaryDecision, secondDecision, primaryRisk, secondRisk, proofMetric, secondMetric, needle,
  } = ctx;
  // audienceFor() takes everything after the last "for", which on a query like
  // "AI knowledge systems for marketing when to hire" swallows the intent phrase
  // and produces the audience "marketing when to hire". The record is not wrong -
  // the capture is - so the intent phrase comes back off here.
  let audience = ctx.audience;
  if (audience && needle) {
    const trimmed = audience.replace(new RegExp(`\\s*${String(needle).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim();
    audience = trimmed || null;
  }
  const mode = modeFor(intentKey);
  const voice = voiceFor(ctx.pillarKey);
  const question = headingQuestion(query, intentKey, needle);
  const subject = lower(query);
  // The subject with the intent phrase lifted off it, which keeps the query's own
  // capitalisation ("agency RFP questions") where the cluster slug has lost it.
  const split = splitOnNeedle(query, needle);
  let topic = split.pos === 'none' ? query : split.core;
  // "investor storytelling for founders" is about investor storytelling; the
  // audience clause is handled in its own section and does not belong in every
  // sentence that names the subject.
  if (audience) {
    const trimmed = topic.replace(new RegExp(`\\s+for\\s+${audience.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim();
    if (trimmed && trimmed.split(/\s+/).length >= 2) topic = trimmed;
  }
  if (!topic || topic.toLowerCase() === subject.toLowerCase()) {
    topic = clusterLabel && String(clusterLabel).toLowerCase() !== subject.toLowerCase() ? String(clusterLabel).toLowerCase() : query;
  }
  topic = lower(topic);
  const lens = LENS_OF[intent.label] || intent.label;

  // The extractable answer: 40-60 words, self-contained, naming its own subject in
  // the first clause so a quoted span does not depend on the heading above it.
  // scripts/lib/recommendation_summary.js lifts this whole emphasised lede into
  // the "What this page recommends" panel at the top of the article, which is
  // where an extractor reaches it first.
  const answer = `${cap(subject)} turns on two decisions: ${primaryDecision}, then ${secondDecision}. ${OPENERS[mode]} Require ${EVIDENCE_STANCE[mode]}, put an early warning on ${primaryRisk}, and treat ${proofMetric} as ${SIGNAL[mode]}.`;

  // Stays in the Direct answer panel after the lede is hoisted, so that panel is
  // still an answer and still names its own subject.
  const second = SECOND[mode](primaryDecision, secondDecision, topic);
  const context = audience
    ? `For ${audience}, calibrate that to the team's real decision speed, internal depth, and stakeholder count rather than to a model borrowed from a much larger organisation.`
    : `How far to take each step depends on how reversible the commitment is, and on what ${primaryRisk} would cost to fix late.`;

  const directAnswer = `<section class="callout"><strong>Direct answer</strong><p><strong>${esc(answer)}</strong> ${esc(second)} ${esc(context)}</p></section>`;

  // Section 1 - the page's narrow job, and the first decision.
  const p1 = `${esc(cap(subject))} is one decision inside ${esc(topic)}, and the job on this page is the narrow one: ${esc(JOB[mode])}. Two people can search the same topic and need different evidence, so the useful move is to say which part is standard, which part is contingent, and what the reader has to inspect first-hand.`;
  const p2 = `Start with ${esc(primaryDecision)}. Set down where things stand now, where they need to be, and which constraints are genuinely fixed. Keep the commitment reversible while ${esc(secondDecision)} is still open, because ${esc(NATURE[voice])}.`;

  // Section 2 - the operating sequence, from the intent's own checks.
  const p3 = `The sequence below is the ${esc(lens)} sequence for ${esc(topic)} work, not a generic plan. Each step ends in something observable, so the next one starts from evidence rather than from momentum.`;
  const steps = intent.checks.map((x, i) => `<li><strong>${esc(cap(x))}.</strong> ${esc(stepTail(i, p, mode))}</li>`).join('');

  // Section 3 - the decision rule.
  const p4 = `Tie the next move to what is actually known. Weak evidence on ${esc(primaryDecision)} is a reason to narrow ${esc(topic)} work, not to produce more of it. Leaving ${esc(secondDecision)} unresolved is what lets scope grow without an owner or a date. And once ${esc(primaryRisk)} is visible, the honest move is a fallback or a smaller scope, before more money follows the plan.`;

  // Decision matrix - unchanged in shape, page-specific in every cell.
  const rows = [
    ['Primary outcome', `The business or audience outcome ${topic} is supposed to move.`],
    ['Ownership', `One accountable owner for ${primaryDecision}; a named approver for ${secondDecision}.`],
    ['Evidence', `What ${article(lens).toLowerCase()} ${lens} call has to rest on: ${EVIDENCE_STANCE[mode]}.`],
    ['Risk', `An early-warning signal on ${primaryRisk} and a rehearsed fallback for ${secondRisk}.`],
    ['Measurement', `${cap(proofMetric)} as the leading signal; ${secondMetric} as the operating signal.`],
  ];
  const matrix = `<h2>Decision matrix for ${esc(query)}</h2><table><thead><tr><th>Dimension</th><th>What to verify</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;

  // Measurement - one paragraph. The second paragraph that used to sit here
  // interpolated nothing and is deleted rather than rewritten.
  const p5 = `Measure ${esc(topic)} at two levels: the outcome the work exists to change, and the operating signals that move first. Here that means ${esc(proofMetric)} as the leading signal and ${esc(secondMetric)} as the one that shows whether the system underneath is healthy. Both need ${esc(EVIDENCE_STANCE[mode])}, and each should be attached to a decision - continue, narrow, change owner, or stop.`;

  // Failure modes - the pillar's own risks, each with a control phrased for where
  // in the sequence it lands, rather than one sentence repeated five times.
  const riskList = [primaryRisk, secondRisk, ...p.risks.filter((x) => ![primaryRisk, secondRisk].includes(x))].slice(0, 5);
  const CONTROLS = [
    (r) => `name the signal that says ${r} has begun, and the person expected to act on it.`,
    () => `write the recovery step while it is still a choice: who reduces scope, who tells the stakeholder, and what gets rehearsed.`,
    (r, t) => `put the check in front of the commitment on ${t} work, rather than after it.`,
    () => `assign it to a named person rather than to a meeting, so it is not left to whoever notices first.`,
    (r, t) => `rehearse the fallback against a real ${t} case at least once; an untested fallback is a plan, not a control.`,
  ];
  const failures = riskList.map((x, i) => `<li><strong>${esc(cap(x))}:</strong> ${esc(CONTROLS[i % CONTROLS.length](lower(x), topic))}</li>`).join('');

  const audienceSection = audience
    ? `<h2>How this changes for ${esc(titleCase(audience))}</h2><p>${esc(context)} Decide which approvals are genuinely mandatory, which work can move asynchronously, and which evidence has to be retained once the people who made the decision have moved on.</p><p>The version of ${esc(subject)} worth writing down is the one that survives turnover. Record the criteria, not only the choice, so the next operator can see what would justify changing it.</p>`
    : '';

  const freshnessSection = intentKey === 'freshness'
    ? `<h2>What to re-check for 2026</h2><p>Re-verify the parts of ${esc(subject)} that depend on a provider, a platform, or a price: those move. The underlying job - ${esc(JOB[mode])} - is durable and does not need revisiting every year. Where ${esc(primaryRisk)} is concerned, confirm the control still fires: a fallback rehearsed two years ago and never since is a fallback on paper.</p>`
    : '';

  // FAQ - every answer is this page's own record, restated as an answer rather
  // than as a table row. Rendered visibly and mirrored into FAQPage JSON-LD, so
  // the schema never claims something the page does not say.
  const faqPairs = [
    [question,
      answer],
    [`Who should own ${subject}?`,
      `One accountable owner for ${primaryDecision}, and a named approver for ${secondDecision}. Splitting those two roles is what keeps ${article(topic).toLowerCase()} ${topic} decision from stalling in review.`],
    [`How do you measure ${subject}?`,
      `${cap(proofMetric)} is the leading signal and ${secondMetric} is the operating signal. Each one should be tied to a decision to continue, narrow, change owner, or stop.`],
    [`What goes wrong most often with ${subject}?`,
      `${cap(primaryRisk)} first, then ${secondRisk}. Both need a named trigger, an early warning, an owner, and a recovery step agreed before the work starts.`],
    [`What evidence should you require for ${subject}?`,
      `For ${article(lens).toLowerCase()} ${lens} call, require ${EVIDENCE_STANCE[mode]}. Keep sourced facts and stated assumptions in separate columns so a reader can see which is which.`],
  ];
  if (audience) {
    faqPairs.push([`How does ${subject} differ for ${audience}?`, context]);
  }
  const faqSection = `<section class="faq" data-faq="true"><h2>${esc(HEADINGS.faq[mode])}</h2>${faqPairs.map(([q, a]) => `<div class="qa-block"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('')}</section>`;
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqPairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  const p6 = `Outside help earns its place on ${esc(subject)} when ${esc(CROSSES[mode])}, when it needs specialists the team does not employ full time, or when ${esc(primaryRisk)} would land somewhere nobody currently owns. It does not replace internal judgment: ${esc(OUTSIDE[mode])}.`;

  return {
    mode,
    voice,
    question,
    answer,
    topic,
    heroDescription: `${article(lens)} ${lens} guide to ${topic}: what ${primaryDecision} has to settle, the evidence to require before committing, the early warning on ${primaryRisk}, and ${proofMetric} as ${SIGNAL[mode]}.`,
    directAnswer,
    section1: `<h2>${esc(intent.headings[0])}</h2><p>${p1}</p><p>${p2}</p>`,
    section2: `<h2>${esc(intent.headings[1])}</h2><p>${p3}</p><ol>${steps}</ol>`,
    section3: `<h2>${esc(intent.headings[2])}</h2><p>${p4}</p>`,
    matrix,
    measurement: `<h2>${esc(HEADINGS.measure[mode])}</h2><p>${p5}</p>`,
    failures: `<h2>${esc(HEADINGS.failure[mode])}</h2><ul>${failures}</ul>`,
    audienceSection,
    freshnessSection,
    faqSection,
    faqSchema,
    outside: `<h2>${esc(HEADINGS.outside[mode])}</h2><p>${p6}</p>`,
  };
}

module.exports = { build, modeFor, voiceFor, headingQuestion, splitOnNeedle, MODE_OF, VOICE_OF };
