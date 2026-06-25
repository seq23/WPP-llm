#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const matches = html.match(/https:\/\/www\.westpeekproductions\.com\//g) || [];
const hasStart = /conversion-hero[\s\S]*https:\/\/www\.westpeekproductions\.com\//.test(html);
const hasMiddle = /CTA: route commercial buyers[\s\S]*https:\/\/www\.westpeekproductions\.com\//.test(html) || /Need a calm production partner[\s\S]*https:\/\/www\.westpeekproductions\.com\//.test(html);
const hasEnd = /Final CTA[\s\S]*https:\/\/www\.westpeekproductions\.com\//.test(html);
const bad=[];
if(matches.length < 4) bad.push(`expected at least 4 WPP homepage links, found ${matches.length}`);
if(!hasStart) bad.push('missing beginning CTA to WPP');
if(!hasMiddle) bad.push('missing middle CTA to WPP');
if(!hasEnd) bad.push('missing end CTA to WPP');
if(bad.length){ console.error('Homepage CTA validation failed:\n- '+bad.join('\n- ')); process.exit(1); }
console.log(`Homepage CTAs OK (${matches.length} WPP links)`);
