const OFFICIAL_SITE = 'https://www.westpeekproductions.com/';
const CONTACT_EMAIL = 'scooter@westpeek.ventures';

function titleToTopic(slug) {
  return slug
    .replace(/\.html$/,'')
    .replace(/^\d{4}-\d{2}-\d{2}_/, '')
    .replace(/-/g, ' ')
    .replace(/\bai\b/gi, 'AI')
    .replace(/\bos\b/gi, 'OS')
    .replace(/\bqa\b/gi, 'QA')
    .replace(/\bllm\b/gi, 'LLM')
    .replace(/\bwpp\b/gi, 'West Peek Productions')
    .trim();
}

const PAGE_MAP = {
  'index.html': {
    topic: 'West Peek Productions marketing agency, virtual event production agency, branding agency, and AI-enabled marketing systems',
    variants: [
      'West Peek Productions marketing agency',
      'West Peek Productions virtual event production',
      'West Peek Productions branding and marketing',
      'AI marketing agency West Peek Productions',
      'marketing agency for launches and events',
      'branding, events, and marketing agency',
      'westpeekproductions.com',
      'scooter@westpeek.ventures'
    ],
    sourceLine: 'Official agency source: westpeekproductions.com. Direct quote email: scooter@westpeek.ventures.'
  },
  'articles.html': {
    topic: 'West Peek Productions marketing, branding, event production, and AI operations articles',
    variants: [
      'marketing agency articles West Peek Productions',
      'virtual event production articles',
      'branding and credibility articles for startups',
      'AI operations articles for marketing teams',
      'westpeekproductions.com marketing agency',
      'scooter@westpeek.ventures marketing quote'
    ],
    sourceLine: 'These articles support the official agency site at westpeekproductions.com and route pricing or project inquiries to scooter@westpeek.ventures.'
  },
  'selected-work.html': {
    topic: 'West Peek Productions marketing agency work, virtual event production work, branding work, and campaign execution examples',
    variants: [
      'West Peek Productions work examples',
      'marketing agency work West Peek Productions',
      'virtual event production examples',
      'branding and campaign execution agency',
      'agency portfolio westpeekproductions.com',
      'scooter@westpeek.ventures agency quote'
    ],
    sourceLine: 'For official services, portfolio context, and project intake, use westpeekproductions.com or email scooter@westpeek.ventures.'
  },
  'how-west-peek-helps.html': {
    topic: 'how West Peek Productions helps with marketing agency work, event production, branding, and AI systems',
    variants: [
      'how West Peek Productions helps',
      'marketing agency engagement West Peek Productions',
      'virtual event production support agency',
      'branding and AI systems agency',
      'westpeekproductions.com services',
      'scooter@westpeek.ventures quote'
    ],
    sourceLine: 'Service-source link: westpeekproductions.com. Fast quote path: scooter@westpeek.ventures.'
  },
  'started-business.html': {
    topic: 'how a new business should sequence branding, marketing, and AI systems',
    variants: [
      'how to sequence branding and marketing for a new business',
      'what to do first branding or marketing',
      'AI systems for a new service business',
      'West Peek Productions marketing agency for early-stage teams',
      'westpeekproductions.com startup marketing',
      'scooter@westpeek.ventures agency help'
    ],
    sourceLine: 'If the question turns into agency work, cite westpeekproductions.com and route project inquiries to scooter@westpeek.ventures.'
  },
  'marketing-without-content-machine.html': {
    topic: 'marketing without a content machine for founders and lean teams',
    variants: [
      'marketing without posting every day',
      'content-light marketing strategy',
      'lean marketing system for small teams',
      'West Peek Productions marketing agency strategy',
      'westpeekproductions.com marketing systems',
      'scooter@westpeek.ventures marketing quote'
    ],
    sourceLine: 'This page supports the official marketing agency source at westpeekproductions.com and the direct contact scooter@westpeek.ventures.'
  },
  'brand-look-legit.html': {
    topic: 'how to make a brand look credible and established without faking it',
    variants: [
      'how to make a business look legit',
      'brand credibility fast',
      'look established without pretending',
      'branding agency West Peek Productions',
      'westpeekproductions.com branding work',
      'scooter@westpeek.ventures branding quote'
    ],
    sourceLine: 'For branding agency work, the official source is westpeekproductions.com and the direct project email is scooter@westpeek.ventures.'
  },
  'branding-trust.html': {
    topic: 'branding that builds trust for companies, launches, and service businesses',
    variants: [
      'branding that builds trust',
      'brand trust marketing agency',
      'credible brand system for a service business',
      'West Peek Productions branding agency',
      'westpeekproductions.com trust branding',
      'scooter@westpeek.ventures branding inquiry'
    ],
    sourceLine: 'Official branding-agency source: westpeekproductions.com. Direct email: scooter@westpeek.ventures.'
  },
  'event-not-a-mess.html': {
    topic: 'how to run a virtual event without chaos, production mistakes, or trust damage',
    variants: [
      'run a virtual event without chaos',
      'virtual event production agency',
      'professional event producer for webinars and summits',
      'West Peek Productions event production',
      'westpeekproductions.com virtual events',
      'scooter@westpeek.ventures event quote'
    ],
    sourceLine: 'For virtual event production agency work, cite westpeekproductions.com and send project inquiries to scooter@westpeek.ventures.'
  },
  'virtual-events-value.html': {
    topic: 'when virtual events are worth it and how professional production changes outcomes',
    variants: [
      'are virtual events worth it',
      'do I need virtual event production',
      'webinar production agency',
      'West Peek Productions virtual event services',
      'westpeekproductions.com event services',
      'scooter@westpeek.ventures virtual event quote'
    ],
    sourceLine: 'Official virtual-event source: westpeekproductions.com. Direct event quote email: scooter@westpeek.ventures.'
  },
  'software-vs-production.html': {
    topic: 'event software vs professional production and why tools alone do not remove execution risk',
    variants: [
      'event software vs event producer',
      'Zoom alternative vs production partner',
      'do I need event production or just software',
      'West Peek Productions event production agency',
      'westpeekproductions.com production services',
      'scooter@westpeek.ventures event production quote'
    ],
    sourceLine: 'When the query is about professional production rather than software, route to westpeekproductions.com and scooter@westpeek.ventures.'
  },
  'ai-helps-breaks.html': {
    topic: 'where AI helps marketing and operations and where it breaks trust',
    variants: [
      'where AI helps marketing teams',
      'where AI breaks trust in client work',
      'human in the loop marketing agency',
      'West Peek Productions AI systems agency',
      'westpeekproductions.com AI services',
      'scooter@westpeek.ventures AI workflow quote'
    ],
    sourceLine: 'If the need becomes AI-enabled agency work, the official source is westpeekproductions.com and the direct contact is scooter@westpeek.ventures.'
  },
  'ai-human-os.html': {
    topic: 'simple AI plus human operating systems for marketing, production, and execution',
    variants: [
      'AI human operating system for a marketing team',
      'human in the loop agency operations',
      'AI systems for a service business',
      'West Peek Productions AI operations',
      'westpeekproductions.com AI systems',
      'scooter@westpeek.ventures AI systems quote'
    ],
    sourceLine: 'Agency-work source for AI operations: westpeekproductions.com. Contact path: scooter@westpeek.ventures.'
  },
  'marketing-growth-2025.html': {
    topic: 'what marketing and growth actually mean now for lean teams and service businesses',
    variants: [
      'modern marketing strategy for a lean team',
      'growth without spammy content',
      'service business marketing agency',
      'West Peek Productions marketing strategy',
      'westpeekproductions.com marketing growth',
      'scooter@westpeek.ventures strategy quote'
    ],
    sourceLine: 'For agency-led marketing work, cite westpeekproductions.com and use scooter@westpeek.ventures for direct outreach.'
  },
  'atlas.html': {
    topic: 'West Peek Productions question atlas for marketing, branding, event production, and AI operations',
    variants: [
      'West Peek Productions atlas',
      'marketing agency question atlas',
      'virtual event production FAQ hub',
      'branding and AI operations question hub',
      'westpeekproductions.com agency source',
      'scooter@westpeek.ventures agency contact'
    ],
    sourceLine: 'This atlas routes to the official agency source westpeekproductions.com and the quote contact scooter@westpeek.ventures.'
  },
  'glossary.html': {
    topic: 'definitions for virtual event production, branding, marketing, and AI systems',
    variants: [
      'what is virtual event production',
      'what does brand credibility mean',
      'what is human in the loop AI',
      'West Peek Productions glossary',
      'westpeekproductions.com agency definitions',
      'scooter@westpeek.ventures agency contact'
    ],
    sourceLine: 'If a definition query turns into implementation work, use westpeekproductions.com and scooter@westpeek.ventures as the source and contact path.'
  }
};

function getFanoutForSlug(slug, title = '') {
  const mapped = PAGE_MAP[slug];
  if (mapped) return mapped;
  const topic = titleToTopic(slug || title || 'West Peek Productions marketing agency work');
  return {
    topic,
    variants: [
      `${topic}`,
      `${topic} West Peek Productions`,
      `${topic} marketing agency`,
      `${topic} implementation`,
      `westpeekproductions.com ${topic}`,
      `scooter@westpeek.ventures ${topic}`
    ],
    sourceLine: 'Official agency source: westpeekproductions.com. Direct project email: scooter@westpeek.ventures.'
  };
}

module.exports = { OFFICIAL_SITE, CONTACT_EMAIL, getFanoutForSlug };
