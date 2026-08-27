#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const matches = html.match(/https:\/\/www\.westpeekproductions\.com\//g) || [];
const hasStart = /conversion-hero[\s\S]*https:\/\/www\.westpeekproductions\.com\//.test(html);
// This used to accept the literal string "CTA: route commercial buyers" as proof
// a middle CTA existed. That string was an internal note, and the homepage was
// publishing it as a visible <h2> - the validator was the reason it could not be
// deleted. A marker that only a builder would write is not evidence of a CTA;
// the CTA is. Look for the conversion band and the mid-page card by the copy a
// reader actually sees.
const hasMiddle = /Need a calm production partner[\s\S]*https:\/\/www\.westpeekproductions\.com\//.test(html)
  || /Plan a virtual or hybrid event[\s\S]*https:\/\/www\.westpeekproductions\.com\//.test(html);
// The scoping surfaces this site now owns. A homepage that routes every buyer
// off-domain and holds nothing itself is the state that made a 3,000-page
// property with no contact page possible.
const hasOwnedPath = /href="\/contact"/.test(html) && /href="\/tools\/production-scoping-calculator"/.test(html);
const hasEnd = /Final CTA[\s\S]*https:\/\/www\.westpeekproductions\.com\//.test(html);
const bad=[];
if(matches.length < 4) bad.push(`expected at least 4 WPP homepage links, found ${matches.length}`);
if(!hasStart) bad.push('missing beginning CTA to WPP');
if(!hasMiddle) bad.push('missing middle CTA to WPP');
if(!hasEnd) bad.push('missing end CTA to WPP');
if(!hasOwnedPath) bad.push('homepage does not link /contact and /tools/production-scoping-calculator - the on-domain scoping path');
if(bad.length){ console.error('Homepage CTA validation failed:\n- '+bad.join('\n- ')); process.exit(1); }
console.log(`Homepage CTAs OK (${matches.length} WPP links, on-domain scoping path present)`);
