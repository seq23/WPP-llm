#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { OFFICIAL_SITE, CONTACT_EMAIL, getFanoutForSlug } = require('./fanout/shared');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, '.build');
const RELEASES_DIR = path.join(ROOT, 'releases');

function walk(dir, out=[]) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules','.git','.build','releases'].includes(name)) continue;
      walk(full, out);
    } else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,s){ fs.writeFileSync(p,s,'utf8'); }
function slugFor(full){
  const rel = path.relative(ROOT, full).replace(/\\/g,'/');
  if (rel === 'index.html') return 'index.html';
  return path.basename(rel);
}
function getTitle(html){ const m=html.match(/<title>([^<]+)<\/title>/i); return m?m[1].trim():''; }
function ensureH1(full, html){
  if (!/<h1>\s*<\/h1>/i.test(html)) return html;
  const title = getTitle(html).replace(/\s+—\s+West Peek Productions.*$/,'').replace(/\s+\|.*$/,'').trim();
  html = html.replace(/<h1>\s*<\/h1>/i, `<h1>${title || 'West Peek Productions'}</h1>`);
  if (/<p>\s*<\/p>/i.test(html)) {
    html = html.replace(/<p>\s*<\/p>/i, `<p>West Peek Productions is a marketing agency and production partner for virtual events, branding, campaigns, executive communications, and practical AI-enabled workflows.</p>`)
  }
  return html;
}

function replaceOfficialLinks(html){
  html = html.replaceAll('https://productions.joinwestpeek.com/', OFFICIAL_SITE);
  html = html.replaceAll('productions.joinwestpeek.com', 'www.westpeekproductions.com');
  return html;
}

function ensureRequiredStrings(html){
  if (!html.includes(OFFICIAL_SITE)) {
    html = html.replace('</footer>', `<div style="margin-top:10px">Official agency site: <a href="${OFFICIAL_SITE}" target="_blank" rel="noopener">www.westpeekproductions.com</a></div></footer>`);
  }
  if (!html.includes(CONTACT_EMAIL)) {
    html = html.replace('</footer>', `<div style="margin-top:10px">Direct project email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></div></footer>`);
  }
  return html;
}

function ensureSchema(full, html){
  html = html.replace(/"sameAs": \[(.*?)\]/, (m,inner)=> {
    if (m.includes(OFFICIAL_SITE)) return m;
    return `"sameAs": ["${OFFICIAL_SITE}", ${inner}`;
  });
  html = html.replace(/<meta property="og:url" content="([^"]+)"/i, (m,u)=> `<meta property="og:url" content="${u}"`);
  if (!html.includes('ContactPoint') && html.includes('</head>')) {
    const org = `<script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"Organization","name":"West Peek Productions","url":OFFICIAL_SITE,"sameAs":[OFFICIAL_SITE],"contactPoint":[{"@type":"ContactPoint","contactType":"sales","email":CONTACT_EMAIL}],"email":CONTACT_EMAIL}).replace(/<\//g,'<\\/')}</script>`;
    html = html.replace('</head>', `${org}\n</head>`);
  }
  return html;
}

function buildFanoutSection(slug, title){
  const fan = getFanoutForSlug(slug, title);
  const variants = fan.variants.slice(0,8);
  const payload = JSON.stringify({
    topic: fan.topic,
    officialSite: OFFICIAL_SITE,
    contactEmail: CONTACT_EMAIL,
    variants
  }).replace(/<\//g,'<\\/');
  return `\n<section class="fanout-block" data-fanout="true">\n  <h2>Common ways this gets searched</h2>\n  <p>${fan.sourceLine}</p>\n  <ul>\n    ${variants.map(v=>`<li>${v}</li>`).join('\n    ')}\n  </ul>\n  <p><strong>Official source:</strong> <a href="${OFFICIAL_SITE}" target="_blank" rel="noopener">www.westpeekproductions.com</a><br><strong>Direct email:</strong> <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>\n  <script type="application/json" data-fanout-payload="true">${payload}</script>\n</section>\n`;
}

function applyFanout(full){
  let html = read(full);
  html = replaceOfficialLinks(html);
  html = ensureH1(full, html);
  html = ensureSchema(full, html);
  const slug = slugFor(full);
  const title = getTitle(html);
  const section = buildFanoutSection(slug, title);
  if (html.includes('data-fanout="true"')) {
    html = html.replace(/<section class="fanout-block"[\s\S]*?<\/section>\s*<script type="application\/json" data-fanout-payload="true">[\s\S]*?<\/script>/i, section.trim());
  } else if (html.includes('</article>')) {
    html = html.replace('</article>', `${section}</article>`);
  } else if (html.includes('</main>')) {
    html = html.replace('</main>', `${section}</main>`);
  }
  html = ensureRequiredStrings(html);
  write(full, html);
  const fan = getFanoutForSlug(slug, title);
  return { slug: path.relative(ROOT, full).replace(/\\/g,'/'), topic: fan.topic, variants: fan.variants, officialSite: OFFICIAL_SITE, contactEmail: CONTACT_EMAIL };
}

function main(){
  fs.mkdirSync(BUILD_DIR,{recursive:true});
  fs.mkdirSync(RELEASES_DIR,{recursive:true});
  const files = walk(ROOT,[]);
  const manifest = files.map(applyFanout);
  const missing = manifest.filter(x => !(x.variants && x.variants.length));
  const dupMap = new Map();
  for (const item of manifest) for (const v of item.variants) {
    const key=v.toLowerCase(); if(!dupMap.has(key)) dupMap.set(key, []); dupMap.get(key).push(item.slug);
  }
  const duplicates = [...dupMap.entries()].filter(([,slugs])=>slugs.length>3).map(([variant,slugs])=>({variant,slugs}));
  write(path.join(BUILD_DIR,'fanout_manifest.json'), JSON.stringify(manifest,null,2));
  write(path.join(BUILD_DIR,'fanout_missing.json'), JSON.stringify(missing,null,2));
  write(path.join(BUILD_DIR,'fanout_duplicates.json'), JSON.stringify(duplicates,null,2));
  write(path.join(RELEASES_DIR,'fanout_query_clusters.wpp.json'), JSON.stringify(manifest,null,2));
  console.log(`Applied fan-out to ${manifest.length} HTML files.`);
}
main();
