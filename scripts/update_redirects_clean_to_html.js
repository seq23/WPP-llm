#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_redirects');

// virtualagency-os.com is the educational/citation layer; westpeekproductions.com
// is the commercial destination and holds the only hosted inquiry form in the
// portfolio. #start-inquiry is the section that form sits in.
const WPP_INQUIRY = 'https://www.westpeekproductions.com/';
function wppInquiry(content) {
  return `${WPP_INQUIRY}?utm_source=virtualagency-os&utm_medium=referral&utm_campaign=retired-contact-route&utm_content=${content}#start-inquiry`;
}
const WPP_GUESSED_ROUTES = [
  ['/contact', 'contact'],
  ['/book', 'book'],
  ['/booking', 'booking'],
  ['/contact-us', 'contact-us'],
  ['/get-started', 'get-started'],
  ['/start', 'start'],
  ['/hire-us', 'hire-us'],
  ['/quote', 'quote'],
  ['/get-a-quote', 'get-a-quote'],
  ['/request-a-quote', 'request-a-quote'],
  ['/scope', 'scope'],
  ['/scoping', 'scoping'],
  ['/inquiry', 'inquiry'],
];

const lines = [
  '# Canonical policy: clean URLs are canonical.',
  '# Do NOT redirect clean URLs to .html. Most static hosts strip .html automatically;',
  '# adding reverse redirects creates ERR_TOO_MANY_REDIRECTS on navigation.',
  '# Only legacy aliases that do not point to .html are allowed here.',
  '/virtual-event-production-for-nonprofit /virtual-event-production-for-nonprofits 301',
  '/virtual-event-production-for-nonprofit.html /virtual-event-production-for-nonprofits 301',
  '',
  '# Every path a buyer guesses when they want to talk to someone. Each of these',
  '# 404d across the whole sitemap while the property ranked for the highest-CPC',
  '# terms in the portfolio, so the only route to a human was a mailto buried in a',
  '# page footer.',
  '#',
  '# They used to land on /contact, an on-domain brief builder that assembled a',
  '# mailto in the browser. A mailto cannot capture a lead: it needs a configured',
  '# mail client and then an actual send, and nobody can ever count the buyers who',
  '# did neither. That is the same silent loss this redirect block exists to stop.',
  '# westpeekproductions.com carries a hosted inquiry form, so these routes and',
  '# /contact itself now land on its inquiry section. Each carries its own',
  '# utm_content so the guessed path that earned the visit stays legible.',
  ...WPP_GUESSED_ROUTES.map(([from, content]) => `${from} ${wppInquiry(content)} 301`),
  '/pricing /tools/production-scoping-calculator 301',
  '/calculator /tools/production-scoping-calculator 301',
  '',
  '# Cloudflare Pages deploys this repository root and offers no exclude list for',
  '# a root deploy, so README.md, package.json, AGENTS.md and everything under',
  '# scripts/ were served as raw text from virtualagency-os.com. These rules 404',
  '# the non-public paths. Emitted here because this script owns _redirects.',
  '/README.md /404 404',
  '/package.json /404 404',
  '/package-lock.json /404 404',
  '/AGENTS.md /404 404',
  '/scripts/* /404 404',
  '/data/* /404 404',
  '/docs/* /404 404',
  '/reports/* /404 404',
  '/artifacts/* /404 404',
  '/tests/* /404 404',
  ''
];
fs.writeFileSync(OUT, lines.join('\n'));
console.log('Updated _redirects with clean-canonical anti-loop policy.');
