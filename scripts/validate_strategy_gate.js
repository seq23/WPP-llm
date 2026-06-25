#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname,'..');
const required=['REPO_IDENTITY.md','docs/strategy/CITATION_STRATEGY_GATE.md','data/strategy/citation_strategy_profile.json'];
let bad=[];
for(const rel of required){ if(!fs.existsSync(path.join(ROOT,rel))) bad.push(`missing ${rel}`); }
const profile = fs.existsSync(path.join(ROOT,'data/strategy/citation_strategy_profile.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT,'data/strategy/citation_strategy_profile.json'),'utf8')) : {};
if(profile.commercial_destination !== 'https://www.westpeekproductions.com/') bad.push('commercial_destination must be westpeekproductions.com');
if(!String(profile.canonical_policy || '').includes('html')) bad.push('canonical_policy must lock .html canonical');
if(bad.length){ console.error('Strategy gate failed:\n- '+bad.join('\n- ')); process.exit(1); }
console.log('Strategy gate OK');
