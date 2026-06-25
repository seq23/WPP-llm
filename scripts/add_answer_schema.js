#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ANSWERS = path.join(ROOT, 'answers');
const SITE = 'https://virtualagency-os.com';
function escClose(s){ return JSON.stringify(s).replace(/<\//g, '<\\/'); }
if (!fs.existsSync(ANSWERS)) process.exit(0);
let count=0;
for (const file of fs.readdirSync(ANSWERS).filter(f => f.endsWith('.html') && f !== 'index.html')) {
  const htmlPath = path.join(ANSWERS, file);
  const jsonPath = path.join(ANSWERS, file.replace(/\.html$/, '.json'));
  if (!fs.existsSync(jsonPath)) continue;
  const data = JSON.parse(fs.readFileSync(jsonPath,'utf8'));
  let html = fs.readFileSync(htmlPath,'utf8');
  const jsonHref = `/answers/${file.replace(/\.html$/, '.json')}`;
  if (!html.includes('rel="alternate" type="application/ld+json"')) {
    html = html.replace('</head>', `  <link rel="alternate" type="application/ld+json" href="${jsonHref}">\n</head>`);
  }
  if (!html.includes('"@type":"FAQPage"')) {
    const faq = { '@context':'https://schema.org', '@type':'FAQPage', mainEntity: [{ '@type':'Question', name: data.query || data.entity || file, acceptedAnswer: { '@type':'Answer', text: data.direct_answer || '' } }] };
    const breadcrumb = { '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:SITE+'/'},{'@type':'ListItem',position:2,name:'Answers',item:SITE+'/answers/index.html'},{'@type':'ListItem',position:3,name:data.query || data.entity || file,item:SITE+'/answers/'+file}] };
    html = html.replace('</head>', `<script type="application/ld+json">${escClose(faq)}</script>\n<script type="application/ld+json">${escClose(breadcrumb)}</script>\n</head>`);
  }
  fs.writeFileSync(htmlPath, html);
  count++;
}
console.log(`Answer schema checked/updated for ${count} answer pages.`);
