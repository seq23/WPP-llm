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

// Legacy URLs search engines still hold as 404. The list and each target's reason
// live in data/redirects/legacy_404_redirects.json; validate_redirect_targets.js
// proves every target is a page this build publishes and is not itself redirected.
const LEGACY_404 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/redirects/legacy_404_redirects.json'), 'utf8')).rules;
if (!Array.isArray(LEGACY_404) || LEGACY_404.length === 0) {
  console.error('data/redirects/legacy_404_redirects.json has no rules; refusing to write a _redirects that silently drops them.');
  process.exit(1);
}

const lines = [
  '# Canonical policy: clean URLs are canonical.',
  '# Do NOT redirect clean URLs to .html. Most static hosts strip .html automatically;',
  '# adding reverse redirects creates ERR_TOO_MANY_REDIRECTS on navigation.',
  '# Only legacy aliases that do not point to .html are allowed here.',
  '# These used to point at /virtual-event-production-for-nonprofits, which no build',
  '# has published, so each was a 301 into a 404. The /programmatic/ nonprofit variant',
  '# is noindex, so they land on the indexable overview of the same topic.',
  '/virtual-event-production-for-nonprofit /programmatic/virtual-event-production 301',
  '/virtual-event-production-for-nonprofit.html /programmatic/virtual-event-production 301',
  '/virtual-event-production-for-nonprofits /programmatic/virtual-event-production 301',
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
  '# Legacy URLs Bing still held as 404 (25 Sep 2026). Each lands on the live page on',
  '# the same topic; see data/redirects/legacy_404_redirects.json for the reason per rule.',
  ...LEGACY_404.map((r) => `${r.from} ${r.to} 301`),
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
