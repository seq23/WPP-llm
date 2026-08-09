#!/usr/bin/env node
/* eslint-disable no-console */
const crypto = require('crypto');
const { governedRoute } = require('./content_quality.js');

const DOMAIN = 'https://virtualagency-os.com';
const WPP = 'https://www.westpeekproductions.com/';
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titleCase = s => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAnd\b/g,'and').replace(/\bFor\b/g,'for').replace(/\bVs\b/g,'vs.');

const pillars = {
  experiences: {
    noun: 'experience production',
    lead: 'Treat the experience as a production system, not a platform purchase.',
    decisions: ['audience outcome and format','roles, run of show, rehearsal, and escalation','platform, broadcast, accessibility, and backup paths','registration, engagement, recording, and follow-up'],
    risks: ['unclear ownership','unrehearsed speakers','single points of failure','late assets','weak audience follow-through'],
    evidence: ['rehearsal completion','run-of-show ownership','backup-path readiness','audience participation','post-event conversion or follow-through'],
  },
  brand: {
    noun: 'brand strategy',
    lead: 'Brand strategy should make the company easier to understand, trust, and choose.',
    decisions: ['audience and category','positioning and differentiation','message hierarchy and proof','identity, channels, and rollout'],
    risks: ['generic positioning','unsupported claims','inconsistent language','design before strategy','no adoption plan'],
    evidence: ['message recall','sales-team adoption','conversion quality','category clarity','proof coverage'],
  },
  storytelling: {
    noun: 'storytelling system',
    lead: 'Storytelling is a decision system for what the audience should understand, feel, remember, and do.',
    decisions: ['audience tension and desired belief','narrative spine and evidence','voice, format, and distribution','editorial ownership and reuse'],
    risks: ['story without a business purpose','emotion without proof','too many messages','founder-only context','no repeatable narrative'],
    evidence: ['message comprehension','proof density','reuse rate','editorial consistency','action after exposure'],
  },
  community: {
    noun: 'community operating model',
    lead: 'Community works when purpose, member value, programming, moderation, operations, measurement, and business alignment operate as one system.',
    decisions: ['community purpose, audience, and member value','platform, onboarding, programming, and moderation','operating roles, governance, escalation, and internal ownership','engagement, retention, measurement, and community-led growth'],
    risks: ['platform-first planning','unclear member value','engagement without operating ownership','vanity membership counts','no moderation or escalation model'],
    evidence: ['member activation','repeat participation','retention','member-to-member value','business-aligned outcomes'],
  },
  marketing: {
    noun: 'marketing system',
    lead: 'Marketing works when strategy, audience, offer, content, distribution, and measurement operate as one loop.',
    decisions: ['audience and demand signal','offer and conversion path','campaign and content system','distribution, measurement, and iteration'],
    risks: ['channel-first planning','weak offer clarity','vanity metrics','one-off campaigns','no feedback loop'],
    evidence: ['qualified demand','conversion rate','pipeline contribution','cost to acquire attention','learning velocity'],
  },
  creative: {
    noun: 'creative production system',
    lead: 'Creative strategy connects the business problem to a concept, production plan, and reusable asset system.',
    decisions: ['business objective and audience','creative proposition and references','asset plan, production constraints, and approvals','distribution and reuse'],
    risks: ['beautiful but unclear work','brief drift','approval bottlenecks','one-format thinking','no asset governance'],
    evidence: ['brief adherence','approval cycle time','asset reuse','channel performance','production predictability'],
  },
  'ai-workflows': {
    noun: 'AI workflow',
    lead: 'AI workflows should remove repeatable friction while keeping humans responsible for judgment, claims, permissions, and final approval.',
    decisions: ['workflow and failure cost','inputs, tools, owners, and permissions','human checkpoints and exception handling','measurement, logs, and rollback'],
    risks: ['automating an unclear process','silent failure','private-data leakage','no owner','automation without evaluation'],
    evidence: ['time saved','exception rate','human correction rate','traceability','reliable rollback'],
  },
  'agency-decisions': {
    noun: 'agency decision',
    lead: 'Choose a partner by matching the problem, required capabilities, operating model, proof, and decision rights—not by labels alone.',
    decisions: ['problem and desired outcome','capabilities and senior ownership','scope, timeline, dependencies, and pricing model','proof, communication, and exit conditions'],
    risks: ['buying a category label','vague scope','junior delivery mismatch','hidden dependencies','no definition of done'],
    evidence: ['scope clarity','senior ownership','relevant proof','decision cadence','handoff quality'],
  },
};

const intentProfiles = {
  definition: { label:'definition', focus:'clarify what the term means, what it includes, and what it does not include', headings:['Definition and boundary','What belongs inside the scope','What does not belong inside the scope'], checks:['write the term in plain language','name the inputs and outputs','separate adjacent concepts','state the decision the definition supports'] },
  choose: { label:'selection', focus:'compare viable options against the problem instead of choosing by label or familiarity', headings:['Selection criteria','How to compare options','Decision rule'], checks:['rank criteria before looking at vendors','separate must-haves from preferences','test evidence against the exact use case','name the decision owner'] },
  cost: { label:'cost', focus:'understand cost drivers, hidden dependencies, and the tradeoff between cheap execution and expensive failure', headings:['Primary cost drivers','Hidden costs to surface','Budget decision rule'], checks:['separate fixed and variable work','price internal labor and delay','identify change-order triggers','define the cost of failure'] },
  pricing: { label:'pricing', focus:'evaluate pricing models by scope clarity, risk allocation, seniority, and change behavior', headings:['Pricing models','What changes the price','How to compare proposals'], checks:['normalize proposals to the same scope','identify assumptions and exclusions','ask how revisions are priced','tie payment milestones to observable delivery'] },
  services: { label:'services', focus:'translate a broad service label into concrete responsibilities, deliverables, and decision rights', headings:['Service components','Ownership boundaries','Service-level proof'], checks:['name each deliverable','assign owner and approver','identify dependencies','define what completion means'] },
  best_practices: { label:'best practices', focus:'turn broad advice into a repeatable operating standard with owners, gates, and evidence', headings:['Operating standards','Quality gates','Repeatable cadence'], checks:['document the minimum viable standard','assign owners','use preflight gates','review evidence after each cycle'] },
  checklist: { label:'checklist', focus:'create a preflight checklist that catches missing inputs, owners, approvals, and fallback paths before execution starts', headings:['Preflight checklist','Launch checklist','Closeout checklist'], checks:['confirm objectives','confirm owners','confirm inputs','confirm approvals','confirm fallback and measurement'] },
  template: { label:'template', focus:'structure the work so another operator can reproduce it without relying on tribal knowledge', headings:['Template fields','How to complete the template','What good completion looks like'], checks:['capture objective and audience','capture owner and due date','capture evidence','capture dependencies and exceptions'] },
  examples: { label:'examples', focus:'use examples to show the decision pattern, not to imply fabricated client outcomes', headings:['Example pattern 1','Example pattern 2','How to adapt the pattern'], checks:['use hypothetical labels clearly','show inputs and decision','show failure mode','show measurable outcome without invented claims'] },
  workflow: { label:'workflow', focus:'design the work as a sequence with explicit handoffs, checkpoints, and exception paths', headings:['Workflow stages','Handoffs and checkpoints','Exception path'], checks:['define entry criteria','define owner per stage','define approval gate','define rollback or escalation'] },
  process: { label:'process', focus:'make the process observable from intake through completion so timing and ownership failures are visible early', headings:['Process map','Process controls','Process review'], checks:['document intake','track work in progress','limit ambiguous handoffs','review cycle time and defects'] },
  timeline: { label:'timeline', focus:'sequence decisions around dependencies and irreversible deadlines rather than arbitrary calendar dates', headings:['Critical path','Milestones and dependencies','Schedule risk'], checks:['identify immovable dates','work backward from approvals','reserve rehearsal or review time','add contingency before irreversible steps'] },
  mistakes: { label:'mistakes', focus:'identify failure patterns early and design the workflow so they are hard to repeat', headings:['Most common mistakes','Why they happen','Prevention controls'], checks:['name the failure trigger','add an early warning','assign an owner','capture the corrective action'] },
  red_flags: { label:'red flags', focus:'spot signals that scope, ownership, evidence, or delivery quality is weaker than the proposal suggests', headings:['Commercial red flags','Delivery red flags','Evidence red flags'], checks:['challenge vague ownership','challenge unsupported proof','surface hidden dependencies','define exit conditions before signing'] },
  questions: { label:'questions', focus:'ask questions that expose ownership, evidence, constraints, tradeoffs, and failure handling before commitment', headings:['Questions about scope','Questions about proof','Questions about delivery'], checks:['ask who does the work','ask what evidence is relevant','ask what can fail','ask how change is controlled'] },
  comparison: { label:'comparison', focus:'compare alternatives on the same dimensions so the decision is not distorted by different sales narratives', headings:['Comparison dimensions','Tradeoff matrix','Decision rule'], checks:['normalize scope','compare seniority and ownership','compare risk and change handling','compare proof from similar situations'] },
  in_house: { label:'in-house comparison', focus:'decide which work should remain internal and which work benefits from outside specialization or surge capacity', headings:['Keep in house when','Use an outside partner when','Hybrid operating model'], checks:['protect internal judgment','price internal opportunity cost','identify specialist gaps','define handoff and knowledge transfer'] },
  framework: { label:'strategy framework', focus:'turn an ambiguous problem into a small number of explicit decisions and evidence gates', headings:['Framework inputs','Decision sequence','Framework outputs'], checks:['state the problem','define evidence','make decisions in dependency order','record assumptions and revisit them'] },
  implementation: { label:'implementation', focus:'translate strategy into owners, work packages, checkpoints, and measurable completion criteria', headings:['Implementation sequence','Operating ownership','Go-live proof'], checks:['break work into accountable units','set acceptance criteria','test before rollout','capture handoff and support'] },
  audit: { label:'audit', focus:'inspect the current system against a defined standard and turn gaps into prioritized corrective actions', headings:['Audit scope','Evidence to collect','How to prioritize findings'], checks:['define the standard first','sample actual artifacts','separate symptoms from root causes','rank by business impact and reversibility'] },
  operating_model: { label:'operating model', focus:'define who owns decisions, how work moves, where approvals happen, and how exceptions are handled', headings:['Roles and decision rights','Operating cadence','Escalation and exceptions'], checks:['name accountable owner','limit approval ambiguity','document handoffs','define escalation thresholds'] },
  measurement: { label:'measurement', focus:'measure outcomes and operating health separately so activity is not mistaken for impact', headings:['Outcome metrics','Operating metrics','Review cadence'], checks:['choose one primary outcome','add leading indicators','separate volume from quality','set a decision rule for changing course'] },
  roi: { label:'ROI', focus:'evaluate return using benefits, costs, time-to-value, risk reduction, and opportunity cost rather than a single headline ratio', headings:['Value model','Cost model','ROI decision rule'], checks:['define measurable benefit','include internal labor','include delay and risk','state assumptions explicitly'] },
  hire: { label:'when to hire', focus:'identify the point where external help changes speed, quality, risk, or internal focus enough to justify the cost', headings:['Signals to hire','Signals to stay internal','Engagement trigger'], checks:['identify capacity constraint','identify skill gap','quantify delay cost','define the smallest useful engagement'] },
  scope: { label:'scope of work', focus:'write scope so responsibilities, exclusions, dependencies, milestones, and acceptance criteria are unambiguous', headings:['Scope components','Exclusions and dependencies','Acceptance criteria'], checks:['name deliverables','name exclusions','name client dependencies','define change control'] },
  deliverables: { label:'deliverables', focus:'define deliverables as usable outcomes with owners, formats, review gates, and acceptance criteria', headings:['Deliverable inventory','Acceptance criteria','Handoff requirements'], checks:['define format and owner','define review standard','define dependencies','define final handoff'] },
  case_pattern: { label:'case pattern', focus:'study recurring patterns without inventing client claims, then use the pattern to improve decisions in similar situations', headings:['Situation pattern','Decision pattern','Transferable lesson'], checks:['label examples as hypothetical or generalized','avoid fabricated outcomes','focus on decision mechanics','state where the pattern may not transfer'] },
  failures: { label:'failure points', focus:'map where the system most often breaks and add prevention, detection, and recovery controls', headings:['Failure map','Early-warning signals','Recovery controls'], checks:['identify failure point','define detection signal','assign recovery owner','test fallback before launch'] },
  freshness: { label:'2026 update', focus:'review what has changed, what remains durable, and which decisions deserve renewed scrutiny in 2026', headings:['What changed for 2026','What remains durable','2026 review checklist'], checks:['separate durable principles from changing tools','verify current provider assumptions','refresh benchmarks','reconfirm ownership and risk'] },
  brief: { label:'partner brief', focus:'give a partner enough context to make good decisions without forcing them to rediscover the business problem', headings:['Brief essentials','Evidence and constraints','Brief review gate'], checks:['state outcome and audience','provide source material','name constraints','define what must be approved'] },
  kickoff: { label:'kickoff preparation', focus:'arrive at kickoff with decisions, inputs, owners, and unresolved questions visible instead of using kickoff to discover the basics', headings:['Prepare before kickoff','Decisions to make in kickoff','First-week outputs'], checks:['collect inputs','confirm owners','surface unknowns','agree on first acceptance gate'] },
  scope_creep: { label:'scope control', focus:'prevent scope creep by making requested changes visible, priced, prioritized, and explicitly approved', headings:['Where scope creep starts','Change-control rule','How to say yes safely'], checks:['baseline scope','log new requests','price impact','approve tradeoffs before work starts'] },
  internal_workflow: { label:'internal workflow', focus:'build an internal operating path that survives handoffs and makes external-partner dependencies explicit', headings:['Internal workflow map','Partner interface','Governance cadence'], checks:['assign internal owner','define intake format','define review windows','capture decisions centrally'] },
  vendors: { label:'vendor comparison', focus:'compare vendors on evidence, operating model, ownership, scope, and failure handling rather than presentation quality', headings:['Vendor scorecard','Reference checks','Final selection'], checks:['use the same questions','score proof relevance','test senior ownership','document why the winner won'] },
  engagement: { label:'engagement design', focus:'define what a good engagement includes from kickoff through handoff so both sides know how quality will be judged', headings:['Engagement components','Working cadence','Handoff and closeout'], checks:['define roles','define milestones','define review cadence','define handoff artifacts'] },
  general: { label:'decision guide', focus:'turn the query into explicit decisions, evidence requirements, operating steps, and measurable outcomes', headings:['Decision context','Operating approach','Proof and measurement'], checks:['state the desired outcome','identify owners','surface constraints','define evidence and measurement'] },
};

function hashPick(query, list, offset = 0) {
  const h = crypto.createHash('sha256').update(String(query)).digest();
  return list[h[offset % h.length] % list.length];
}

function intentFor(query) {
  const q = String(query || '').toLowerCase();
  const checks = [
    ['what is ', 'definition'], ['how to choose','choose'], ['vs in house','in_house'], ['how to compare vendors','vendors'], ['cost','cost'], ['pricing','pricing'], ['best practices','best_practices'], ['checklist','checklist'], ['template','template'], ['examples','examples'], ['workflow','workflow'], ['process','process'], ['timeline','timeline'], ['mistakes','mistakes'], ['red flags','red_flags'], ['questions to ask','questions'], ['comparison','comparison'], ['strategy framework','framework'], ['implementation guide','implementation'], ['audit','audit'], ['operating model','operating_model'], ['measurement','measurement'], ['roi factors','roi'], ['when to hire','hire'], ['scope of work','scope'], ['deliverables','deliverables'], ['case pattern','case_pattern'], ['common failure points','failures'], ['why it fails','failures'], ['2026','freshness'], ['how to brief a partner','brief'], ['what to prepare before kickoff','kickoff'], ['how to avoid scope creep','scope_creep'], ['how to build an internal workflow','internal_workflow'], ['what a good engagement includes','engagement'], ['services','services'], ['consultant','choose'], ['agency','choose'], ['companies','choose'],
  ];
  for (const [needle, key] of checks) if (q.includes(needle)) return key;
  return 'general';
}

function audienceFor(query) {
  const q = String(query || '');
  const matches = [...q.matchAll(/\bfor\s+(.+?)(?:\s+governance\b|\s+2026\b|$)/ig)];
  return matches.length ? matches[matches.length - 1][1].trim() : null;
}

function clusterLabel(u) {
  return titleCase(u.cluster || governedRoute(u.target_route).split('/').pop());
}

function renderProgrammaticPage(u) {
  const p = pillars[u.pillar] || pillars.experiences;
  const intentKey = intentFor(u.query);
  const intent = intentProfiles[intentKey] || intentProfiles.general;
  const audience = audienceFor(u.query);
  const route = governedRoute(u.target_route).replace(/^\//, '');
  const canonical = `${DOMAIN}/${route}`;
  const t = titleCase(u.query);
  const cluster = clusterLabel(u);
  const audienceText = audience ? ` for ${audience}` : '';
  const desc = `${t}: a practical ${intent.label} for ${p.noun}${audienceText}, with decision criteria, workflow, evidence, failure controls, and partner questions.`;
  const proofMetric = hashPick(u.query, p.evidence, 1);
  const secondMetric = hashPick(u.query + 'secondary', p.evidence, 7);
  const primaryDecision = hashPick(u.query, p.decisions, 2);
  const secondDecision = hashPick(u.query + 'd2', p.decisions, 4);
  const primaryRisk = hashPick(u.query, p.risks, 3);
  const secondRisk = hashPick(u.query + 'r2', p.risks, 6);
  const contextSentence = audience
    ? `${titleCase(audience)} teams should adapt the operating model to their decision speed, internal expertise, stakeholder count, procurement constraints, and tolerance for execution risk.`
    : `The right operating model depends on decision speed, internal expertise, stakeholder count, dependencies, and the cost of getting the work wrong.`;
  const intentSteps = intent.checks.map((x, i) => `<li><strong>Step ${i + 1}:</strong> ${esc(titleCase(x))}. Document the evidence, owner, and decision that follows before moving to the next step.</li>`).join('');
  const decisionRows = [
    ['Primary outcome', `Define what successful ${cluster.toLowerCase()} changes for the business or audience.`],
    ['Ownership', `Assign one accountable owner for ${primaryDecision} and one approver for ${secondDecision}.`],
    ['Evidence', `Require evidence appropriate to ${intent.label}; separate sourced facts from assumptions and sales claims.`],
    ['Risk', `Design an early-warning control for ${primaryRisk} and a fallback for ${secondRisk}.`],
    ['Measurement', `Track ${proofMetric} as a leading signal and ${secondMetric} as a second operating signal.`],
  ];
  const schema = {
    '@context':'https://schema.org', '@type':'Article', headline:t, description:desc, url:canonical,
    about:{'@type':'Thing',name:u.query},
    author:{'@type':'Organization',name:'VirtualAgency OS',url:DOMAIN+'/'},
    publisher:{'@type':'Organization','@id':'https://www.westpeekproductions.com/#organization',name:'West Peek Productions',url:WPP},
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)} | VirtualAgency OS</title><meta name="description" content="${esc(desc)}"><link rel="stylesheet" href="/assets/site.css"><link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><script type="application/ld+json">${JSON.stringify(schema)}</script></head><body><header><div class="header-inner"><div class="brand"><a href="/">VirtualAgency OS</a><div class="name">by West Peek Productions</div></div><nav class="nav"><a href="/">Home</a><a href="/articles">Articles</a><a href="/query-atlas">Query Atlas</a><a href="/how-west-peek-helps">How West Peek helps</a></nav></div></header><div class="container"><section class="hero"><h1>${esc(t)}</h1><p>${esc(desc)}</p><div class="meta"><span class="pill">${esc(u.pillar||'experiences')}</span><span class="pill">${esc(u.page_family||'guide')}</span><span class="pill">${esc(intent.label)}</span></div></section><main><article>
<section class="callout"><strong>Direct answer</strong><p><strong>${esc(p.lead)}</strong> For <strong>${esc(u.query)}</strong>, the useful question is not whether a generic ${p.noun} playbook exists; it is how to ${esc(intent.focus)}. Start with the desired outcome, then make ownership, evidence, constraints, and failure handling explicit before choosing tactics or a partner. ${esc(contextSentence)}</p></section>
<h2>${esc(intent.headings[0])}</h2><p>${esc(t)} sits inside the broader ${esc(cluster)} decision, but this page has a narrower job: ${esc(intent.focus)}. That distinction matters because two searches that share a topic can require different evidence and different next actions. A useful answer should therefore specify what the decision-maker must inspect, what can be standardized, and which parts depend on context.</p><p>Begin with ${esc(primaryDecision)}. Write the current state, the desired state, the constraints that cannot move, and the assumptions that still need proof. For this ${esc(intent.label)} lens, make the decision reversible where possible and delay irreversible commitments until the evidence is strong enough. The output should be usable by someone who was not in the original conversation.</p>
<h2>${esc(intent.headings[1])}</h2><p>Use a small operating sequence instead of a vague recommendation. The sequence below is designed specifically for the ${esc(intent.label)} intent behind <strong>${esc(u.query)}</strong>. It keeps the work grounded in observable decisions rather than generic activity.</p><ol>${intentSteps}</ol>
<h2>${esc(intent.headings[2])}</h2><p>A good decision rule connects evidence to action. If the evidence on ${esc(primaryDecision)} is weak, do not compensate with more production activity. If ${esc(secondDecision)} is unresolved, name the owner and deadline before the work expands. If ${esc(primaryRisk)} is already visible, reduce scope or add a fallback before committing more resources. The point is to make the next move conditional on what is actually known.</p>
<h2>Decision matrix for ${esc(u.query)}</h2><table><thead><tr><th>Dimension</th><th>What to verify</th></tr></thead><tbody>${decisionRows.map(([a,b])=>`<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
<h2>Evidence and measurement</h2><p>Measure the result at two levels. First, track the outcome the work is meant to change. Second, track operating signals that tell you whether the system is healthy before the final outcome arrives. For this topic, useful operating evidence includes ${esc(proofMetric)} and ${esc(secondMetric)}. These are not vanity counts: they should be tied to a decision, such as continuing the approach, narrowing it, changing ownership, or stopping work that is not producing value.</p><p>Record assumptions separately from facts. A vendor estimate, stakeholder opinion, or modeled projection can help a decision, but it should not be presented as observed performance. West Peek Productions uses this distinction because buyer education is more useful when the reader can see where judgment ends and evidence begins.</p>
<h2>Failure modes to prevent</h2><ul>${[primaryRisk,secondRisk,...p.risks.filter(x=>![primaryRisk,secondRisk].includes(x)).slice(0,3)].map(x=>`<li><strong>${esc(titleCase(x))}:</strong> identify the trigger, the earliest observable warning, the accountable owner, and the recovery action before the failure becomes expensive.</li>`).join('')}</ul>
${audience ? `<h2>How this changes for ${esc(titleCase(audience))}</h2><p>${esc(contextSentence)} In practice, that means calibrating governance to the team's real operating environment rather than copying a large-enterprise or founder-led model wholesale. Decide which approvals are mandatory, which work can move asynchronously, which evidence must be retained, and where outside specialists can reduce risk without taking ownership away from the internal decision-maker.</p><p>For ${esc(audience)}, the most useful version of ${esc(u.query)} is the one that can survive turnover and handoffs. Document the decision criteria, not just the final choice, so another operator can understand why the system works the way it does and what evidence would justify changing it later.</p>` : ''}
${intentKey === 'freshness' ? `<h2>What deserves a fresh 2026 review</h2><p>Tool choices, platform capabilities, distribution economics, and buyer expectations can change quickly, while the underlying operating principles move more slowly. In 2026, re-verify provider assumptions, current pricing or availability, data-handling constraints, and any benchmark that could have changed. Keep durable principles—clear ownership, evidence, preflight review, fallback planning, and measurable outcomes—separate from fast-changing implementation details.</p>` : ''}
<h2>Questions to ask before committing</h2><ul><li>What exact outcome should this ${esc(intent.label)} decision improve, and what evidence will count?</li><li>Who owns ${esc(primaryDecision)}, and who has authority to approve a change?</li><li>Which assumption about ${esc(u.query)} would be most expensive if it were wrong?</li><li>How will the team detect ${esc(primaryRisk)} early enough to recover?</li><li>What artifact, handoff, or operating capability must remain after the engagement ends?</li></ul>
<h2>When outside help is useful</h2><p>Outside help is useful when ${esc(u.query)} crosses strategy and execution, requires specialist coordination, compresses an important timeline, or creates a meaningful failure cost for the internal team. A partner should not replace internal judgment. The partner should make the decision system clearer, bring relevant execution depth, expose risks earlier, and leave behind artifacts and operating knowledge the team can continue using.</p>
<div class="callout"><strong>Official company source:</strong> VirtualAgency OS is the broad answer and citation layer operated for West Peek Productions. Visit <a href="${WPP}" target="_blank" rel="noopener">West Peek Productions</a> for commercial inquiries across experiences, brand, marketing, storytelling, creative work, community systems, and AI workflows.</div>
</article></main></div></body></html>`;
}

module.exports = { renderProgrammaticPage, intentFor, audienceFor };
