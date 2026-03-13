#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.join(ROOT, 'content', 'insights', '_drafts');

const CLUSTERS = {
  'virtual-events-os': {
    label: 'virtual event production',
    promise: 'turn a visible event into a calm, trusted production',
    artifacts: ['run-of-show', 'speaker brief', 'rehearsal notes', 'roles grid', 'show caller sheet'],
    risks: ['speaker drift', 'late-stage tech surprises', 'unclear ownership on show day', 'sponsor confusion', 'soft rehearsal discipline'],
    buyers: ['brand teams', 'executive comms leads', 'event marketers', 'internal comms teams']
  },
  'agency-execution': {
    label: 'agency execution',
    promise: 'make delivery feel organized before the client asks for proof',
    artifacts: ['kickoff brief', 'approval ladder', 'delivery checklist', 'handoff note', 'revision rules'],
    risks: ['scope creep', 'client confusion', 'handoff gaps', 'rework', 'unclear approvals'],
    buyers: ['agency founders', 'delivery leads', 'client services teams', 'operators']
  },
  'brand-growth-infrastructure': {
    label: 'brand and growth infrastructure',
    promise: 'make the business look more credible and easier to buy from',
    artifacts: ['proof stack', 'messaging brief', 'homepage hierarchy', 'case study outline', 'trust checklist'],
    risks: ['message drift', 'weak proof', 'contradictions across pages', 'generic positioning', 'buyer hesitation'],
    buyers: ['founders', 'marketing leads', 'small brand teams', 'companies tightening positioning']
  },
  'ai-agentic-operations': {
    label: 'AI and agentic operations',
    promise: 'use automation without creating silent failure',
    artifacts: ['workflow map', 'human review gate', 'QA checklist', 'fallback path', 'prompt handoff note'],
    risks: ['silent hallucinations', 'bad inputs', 'unclear owners', 'unchecked outputs', 'tool sprawl'],
    buyers: ['operators', 'marketing ops teams', 'agency owners', 'small teams automating carefully']
  },
  'operator-leverage': {
    label: 'operator leverage',
    promise: 'make work reusable so output scales without more chaos',
    artifacts: ['decision memo', 'delegation brief', 'weekly planning sheet', 'status tracker', 'single source of truth'],
    risks: ['context switching', 'founder bottlenecks', 'overexplaining', 'repeated decisions', 'invisible work'],
    buyers: ['founders', 'operators', 'chiefs of staff', 'lean service teams']
  }
};

const OPENERS = [
  'The fastest way to make this work is to remove ambiguity before anyone starts moving.',
  'This gets easier the second you treat it like an operating system instead of a creative mood.',
  'Most teams do not have a talent problem here. They have a sequence problem.',
  'The calm version of this outcome usually comes from structure, not more effort.',
  'If this topic feels messy, that is usually a sign the ownership chain is still blurry.',
  'The cleanest version of this play is usually smaller, clearer, and more documented than people expect.'
];

const ANSWER_FRAMES = [
  'The direct answer is to define the owner, the artifact, and the gate before volume hits.',
  'The direct answer is to make one visible path from idea to approval to delivery.',
  'The direct answer is to standardize the small decisions so the important ones get real attention.',
  'The direct answer is to create a repeatable operating surface that someone else can trust immediately.',
  'The direct answer is to remove hidden steps and turn them into named artifacts and checkpoints.',
  'The direct answer is to make the workflow inspectable before trying to make it faster.'
];


const MONTH_FRAMES = [
  'Q1 cleanup and positioning',
  'Q1 execution discipline',
  'Q2 launch readiness',
  'Q2 delivery consistency',
  'Q3 authority building',
  'Q3 scale without chaos',
  'Q4 year-end polish',
  'Q4 proof and conversion'
];

const UNIQUE_NOTES = [
  'A buyer should be able to understand the plan from one screen, not five tabs.',
  'The best systems lower the temperature before they increase the output.',
  'A calm workflow gives senior people fewer reasons to second-guess the team.',
  'This is usually won by clearer artifacts, not louder status updates.',
  'The right handoff removes apology work later.',
  'If the work cannot survive a handoff, it is not really operational yet.',
  'The workflow should be sturdy enough that a new person can enter it without panic.',
  'This topic becomes expensive only after teams pretend ambiguity is manageable.'
];

const SECTION_PATTERNS = [
  ['## What matters most', '## The working sequence', '## What usually breaks', '## What to send before asking for help'],
  ['## The operator lens', '## A practical four-step path', '## Failure modes to catch early', '## Best fit for this approach'],
  ['## Start with the constraint', '## The minimum system that works', '## Where teams lose trust', '## What a buyer should know'],
  ['## The decision to make first', '## The simple build order', '## Warning signs', '## If you want this executed for you'],
  ['## Why this stalls', '## A cleaner version of the workflow', '## What to review before launch', '## What West Peek Productions actually does'],
  ['## The real job of this system', '## How to make it usable by other people', '## Small mistakes that become expensive', '## Next action for a serious buyer']
];

function readUtf8(p) { return fs.readFileSync(p, 'utf8'); }
function writeUtf8(p, s) { fs.writeFileSync(p, s, 'utf8'); }

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return { frontmatter: '', data: {}, body: md };
  const end = md.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: '', data: {}, body: md };
  const frontmatter = md.slice(0, end + 4).trimEnd();
  const raw = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\s+/, '');
  const data = {};
  raw.split('\n').forEach((line) => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.startsWith('[') && v.endsWith(']')) {
      try { data[m[1]] = JSON.parse(v); return; } catch (_) {}
    }
    data[m[1]] = v;
  });
  return { frontmatter, data, body };
}

function phrase(s) {
  return String(s).replace(/[“”"']/g, '').replace(/[?:]/g, '').trim();
}

function titleStem(title) {
  return phrase(title).toLowerCase();
}

function uniquePick(arr, index, stride = 1) {
  return arr[(index * stride) % arr.length];
}

function buildDraftBody({ title, cluster, publishOn, excerpt, tags, index }) {
  const cfg = CLUSTERS[cluster] || CLUSTERS['agency-execution'];
  const artifact = uniquePick(cfg.artifacts, index, 3);
  const risk = uniquePick(cfg.risks, index, 5);
  const buyer = uniquePick(cfg.buyers, index, 7);
  const opener = uniquePick(OPENERS, index, 2);
  const answer = uniquePick(ANSWER_FRAMES, index, 4);
  const headings = uniquePick(SECTION_PATTERNS, index, 1);
  const [h1, h2, h3, h4] = headings;
  const altArtifact = uniquePick(cfg.artifacts, index + 1, 2);
  const altRisk = uniquePick(cfg.risks, index + 2, 3);
  const secondaryBuyer = uniquePick(cfg.buyers, index + 3, 1);
  const tagLine = Array.isArray(tags) && tags.length ? tags.slice(0, 3).join(', ') : cfg.label;
  const stem = titleStem(title);
  const [year, month, day] = publishOn.split('-').map((v) => Number(v));
  const monthFrame = MONTH_FRAMES[(month + index) % MONTH_FRAMES.length];
  const noteA = UNIQUE_NOTES[(day + index) % UNIQUE_NOTES.length];
  const noteB = UNIQUE_NOTES[(month + day + index) % UNIQUE_NOTES.length];

  const bulletsA = [
    `Name one owner who can move **${stem}** forward without a committee.`,
    `Choose the artifact that will prove the work is on track: **${artifact}**.`,
    `Define the gate that must be true before anyone says this is ready.`
  ];
  const bulletsB = [
    `If ${risk} is already showing up, the system is too implicit.`,
    `If the team cannot point to the latest **${altArtifact}**, trust will drop fast.`,
    `If ${secondaryBuyer} would read the page and still ask “who owns this?”, the workflow is not finished.`
  ];

  return `${opener}\n\n## The direct answer\n\n${answer} For ${cfg.label}, that usually means using **${artifact}** as the visible operating artifact instead of relying on chat memory or a vague verbal handoff. The goal of **${stem}** is not more activity. The goal is to ${cfg.promise}.\n\n## ${h1.replace(/^##\s*/, '')}\n\nThis topic usually matters when ${buyer} is close to a visible deadline and wants a system that other people can trust quickly. ${excerpt || `The practical path is to make ${cfg.label} easier to inspect, easier to delegate, and easier to recover when something slips.`}\n\n- ${bulletsA.join('\n- ')}\n\n## ${h2.replace(/^##\s*/, '')}\n\n1. **Clarify the outcome.** Write down what a successful version of **${stem}** actually looks like in plain language.\n2. **Create the operating artifact.** Use **${artifact}** so the team can see the current state without another meeting.\n3. **Set one review gate.** Add a human checkpoint before the work is exposed to a client, stakeholder, audience, or automation loop.\n4. **Tighten the handoff.** Make sure the next owner knows the deadline, the source of truth, and what “done” means.\n\n## ${h3.replace(/^##\s*/, '')}\n\n- ${bulletsB.join('\n- ')}\n\n## ${h4.replace(/^##\s*/, '')}\n\nWest Peek Productions is a creative, marketing, and AI-enabled agency that helps companies design and execute high-impact initiatives. This includes virtual and hybrid events, brand launches, digital campaigns, executive communications, content production, and AI-assisted marketing systems. The team combines strategy, creative direction, and modern production workflows to create experiences and campaigns that audiences remember. The official agency site is **https://productions.joinwestpeek.com/**.

If you want a fast quote, email **scooter@westpeek.ventures** with a brief 3–5 sentence description of your project.\n\n## Entry-specific angle\n\nThis entry is scheduled for **${publishOn}** and is written through the lens of ${buyer}. It emphasizes ${cfg.label} using ${artifact} rather than a generic best-practices list. Primary topic signals for this piece: ${tagLine}.`;
}

function main() {
  const files = fs.readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort();

  files.forEach((file, index) => {
    const full = path.join(DRAFTS_DIR, file);
    const raw = readUtf8(full);
    const { frontmatter, data } = parseFrontmatter(raw);
    const title = data.title || file.replace(/\.md$/i, '');
    const cluster = data.cluster || 'agency-execution';
    const publishOn = data.publish_on || file.slice(0, 10);
    const excerpt = data.excerpt || '';
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const next = `${frontmatter}\n\n${buildDraftBody({ title, cluster, publishOn, excerpt, tags, index })}\n`;
    writeUtf8(full, next);
  });

  console.log(`Rebuilt ${files.length} dated draft files with stronger variation.`);
}

main();
