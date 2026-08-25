#!/usr/bin/env node
// WO-3 production pages, built to the C4 page spec.
//
// C4 in this repo means: one query per URL; H1 in the searcher's phrasing; a
// self-contained 40-60 word direct answer inside the first 100 words that survives
// extraction without pronouns pointing elsewhere; real figures where they exist;
// FAQPage schema; one conversion path; and internal links to two siblings.
//
// Content is authored per page in data/content/wo3_production_pages.json. Five
// keyword-swapped variants of one page is the near-duplicate pattern the quality
// gate rejects, so each page answers a materially different question.
//
// Figures are the business's own published numbers (present across this repo and
// on westpeekproductions.com), not invented (C3). No client is ever named.

import fs from 'node:fs';
import path from 'node:path';
import { SCOOTER_TAYLOR, WEST_PEEK_PRODUCTIONS, PERSON_ID, ORG_ID } from './lib/entity.mjs';

const ROOT = process.cwd();
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content/wo3_production_pages.json'), 'utf8'));
const SITE = 'https://virtualagency-os.com';
const QUOTE = 'https://www.westpeekproductions.com/';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// areaServed covers the three offices plus national reach, per WO-3.
const SERVICE_AREAS = ['New York', 'Atlanta', 'Memphis', 'United States'];

let built = 0;
for (const p of spec.pages) {
  const url = `${SITE}/programmatic/${p.slug}`;
  const answerWords = p.direct_answer.trim().split(/\s+/).length;
  if (answerWords < 40 || answerWords > 60) {
    console.error(`[wo3] ${p.slug}: direct answer is ${answerWords} words, C4 requires 40-60`);
    process.exitCode = 1;
    continue;
  }

  const graph = [
    {
      '@type': 'WebPage', name: p.h1, description: p.direct_answer, url,
      isPartOf: { '@type': 'WebSite', name: 'West Peek Productions', url: SITE },
      publisher: { '@id': ORG_ID },
      author: { '@id': PERSON_ID },
      primaryImageOfPage: undefined,
      about: ['virtual event production', 'hybrid event production', 'webinar production', 'broadcast production']
    },
    {
      '@type': 'Service', name: p.h1, serviceType: p.query,
      provider: { '@id': ORG_ID },
      areaServed: SERVICE_AREAS.map((a) => ({ '@type': 'AdministrativeArea', name: a })),
      description: p.direct_answer
    },
    {
      '@type': 'FAQPage',
      mainEntity: p.faqs.map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a }
      }))
    },
    SCOOTER_TAYLOR,
    WEST_PEEK_PRODUCTIONS
  ];

  const siblings = (p.siblings || []).map((s) =>
    `<li><a href="/programmatic/${s}">${esc(s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}</a></li>`).join('');

  const sections = p.sections.map(([h, body]) =>
    `<section><h2>${esc(h)}</h2><p>${esc(body)}</p></section>`).join('\n  ');

  const faqHtml = p.faqs.map(([q, a]) =>
    `<div class="faq"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('\n    ');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(p.h1)} | West Peek Productions</title>
  <meta name="description" content="${esc(p.direct_answer.slice(0, 155))}">
  <meta name="author" content="Scooter Taylor">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>
</head>
<body>
<main class="page">
  <article>
    <h1>${esc(p.h1)}</h1>
    <p class="direct-answer" data-llm-answer="true"><strong>${esc(p.direct_answer)}</strong></p>
    <p class="cta-above-fold"><a href="${QUOTE}">Request a production quote from West Peek Productions</a></p>
  ${sections}
    <section>
      <h2>Frequently asked questions</h2>
    ${faqHtml}
    </section>
    <section>
      <h2>Related</h2>
      <ul>${siblings}</ul>
    </section>
    <p class="cta-end"><a href="${QUOTE}">Get a quote for ${esc(p.query)}</a></p>
  </article>
</main>
</body>
</html>
`;
  const file = path.join(ROOT, 'programmatic', `${p.slug}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  built++;
  console.log(`[wo3] built programmatic/${p.slug}.html  answer=${answerWords}w faqs=${p.faqs.length} sections=${p.sections.length}`);
}
console.log(`[wo3] ${built} page(s) built to the C4 spec`);
