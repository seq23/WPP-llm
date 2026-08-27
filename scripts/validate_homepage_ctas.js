#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const redirects = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8');

// HISTORY OF THIS FILE - read before loosening anything in it.
//
// Version 1 accepted the literal string "CTA: route commercial buyers to the
// official site" as proof a CTA existed. That string was an internal note the
// homepage was publishing as a visible <h2>, and this validator was the reason
// it could not be deleted. A marker only a builder would write is not evidence
// of a CTA; the CTA is.
//
// Version 2 matched reader-facing copy instead, and additionally required the
// homepage to link /contact and the scoping calculator, on the reasoning that a
// homepage routing every buyer off-domain and holding nothing itself was the
// state that made a 3,000-page property with no contact page possible.
//
// Version 3 (this one) is the consequence of retiring /contact. /contact was an
// on-domain brief builder that assembled a mailto in the browser. A mailto
// cannot capture a lead - it needs a configured mail client and then an actual
// send, and nobody can count the buyers who did neither. westpeekproductions.com
// carries a hosted inquiry form, so /contact is now a 301 to it and asserting
// the homepage links /contact would be asserting something false.
//
// What replaces it is a stronger claim, not a weaker one. virtualagency-os.com
// states on its own homepage that it is the educational layer and that
// westpeekproductions.com is the commercial destination. This validator now
// requires the homepage to actually behave that way: every conversion point
// leads with westpeekproductions as the PRIMARY action, the surviving on-domain
// tool (the scoping calculator) sits behind it as the SECONDARY action, and
// every commercial button carries UTM tagging so the routing can be measured
// rather than assumed. Two competing paths convert worse than one clear one;
// that is the whole point of the change this file now guards.

const WPP = 'https://www.westpeekproductions.com';
const CALC = '/tools/production-scoping-calculator';
const bad = [];

// A conversion point is a <section>; take from its marker to the next </section>.
function band(name, marker) {
  const start = html.indexOf(marker);
  if (start === -1) { bad.push(`missing conversion point: ${name} (marker ${marker})`); return null; }
  const end = html.indexOf('</section>', start);
  return { name, html: html.slice(start, end === -1 ? undefined : end) };
}

// Buttons in document order, with their secondary flag.
function buttons(chunk) {
  return [...chunk.matchAll(/<a class="btn( secondary)?"[^>]*href="([^"]+)"/g)]
    .map((m) => ({ secondary: Boolean(m[1]), href: m[2].replace(/&amp;/g, '&') }));
}

// The four conversion points the homepage is supposed to carry: the hero, the
// mid-page planning card, the closing card, and the bottom band.
const POINTS = [
  ['hero', '<section class="hero conversion-hero">', true],
  ['plan-an-event card', '<h2>Plan a virtual or hybrid event</h2>', true],
  ['closing card', 'id="get-production-support"', false],
  ['bottom CTA band', '<section class="cta-band"', true],
];

for (const [name, marker, wantsCalculator] of POINTS) {
  const b = band(name, marker);
  if (!b) continue;
  const btns = buttons(b.html);
  if (!btns.length) { bad.push(`${name}: no call-to-action button`); continue; }

  // Primary = the first non-secondary button. It must be the commercial site.
  const primary = btns.find((x) => !x.secondary);
  if (!primary) bad.push(`${name}: no primary button, only secondary ones`);
  else if (!primary.href.startsWith(WPP)) bad.push(`${name}: primary action is ${primary.href}, not westpeekproductions.com`);
  else if (!primary.href.includes('utm_source=virtualagency-os')) bad.push(`${name}: primary action to WPP carries no utm_source`);

  // Every commercial button here must be measurable.
  for (const x of btns) {
    if (x.href.startsWith(WPP) && !x.href.includes('utm_source=virtualagency-os')) {
      bad.push(`${name}: untagged westpeekproductions link ${x.href}`);
    }
  }

  // The calculator is the kept on-domain asset and sits behind the primary.
  if (wantsCalculator) {
    const calc = btns.find((x) => x.href.startsWith(CALC));
    if (!calc) bad.push(`${name}: scoping calculator is not offered as the secondary action`);
    else if (!calc.secondary) bad.push(`${name}: scoping calculator is styled as a primary action; it is the secondary one`);
  }
}

// /contact is retired. Asserting it exists would assert something false; assert
// instead that it is gone and that the route still lands a buyer somewhere real.
if (/href="\/contact(["/?#])/.test(html)) bad.push('homepage still links /contact, which is retired');
if (fs.existsSync(path.join(ROOT, 'contact.html'))) bad.push('contact.html still exists; /contact is meant to be a 301');
const contactRule = redirects.split(/\r?\n/).find((l) => l.trim().startsWith('/contact '));
if (!contactRule) bad.push('_redirects has no rule for /contact');
else if (!contactRule.includes(WPP) || !contactRule.trim().endsWith('301')) bad.push(`/contact redirect does not 301 to westpeekproductions: ${contactRule.trim()}`);

// The calculator and its hub survived the retirement and must stay reachable.
if (!html.includes(`href="${CALC}"`)) bad.push('homepage does not link the production scoping calculator');

// Volume check, kept from version 1: a homepage with one buried link to the
// commercial destination is the failure mode this file was written for.
const wppLinks = (html.match(/href="https:\/\/www\.westpeekproductions\.com/g) || []).length;
if (wppLinks < 4) bad.push(`expected at least 4 westpeekproductions links on the homepage, found ${wppLinks}`);

if (bad.length) { console.error('Homepage CTA validation failed:\n- ' + bad.join('\n- ')); process.exit(1); }
console.log(`Homepage CTAs OK (${wppLinks} westpeekproductions links; 4 conversion points lead with the commercial site, UTM-tagged, calculator secondary; /contact 301s off-domain)`);
