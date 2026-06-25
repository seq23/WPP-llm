#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const DOMAIN = 'https://virtualagency-os.com';
const WPP = 'https://www.westpeekproductions.com/';
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function titleCase(s){return String(s).split(/[-_\s]+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');}
function cleanPath(file){ if(file==='index.html') return '/'; if(file.endsWith('/index.html')) return '/' + file.slice(0,-'index.html'.length); return '/' + file.replace(/\.html$/,''); }
function page(title, desc, body, file){
  const canonical = DOMAIN + cleanPath(file);
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${esc(title)} | West Peek Productions</title>\n  <meta name="description" content="${esc(desc)}">\n  <link rel="stylesheet" href="/assets/site.css">\n  <link rel="canonical" href="${canonical}">\n  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">\n  <script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage",name:title,description:desc,url:canonical,isPartOf:{"@type":"WebSite",name:"West Peek Productions",url:DOMAIN+"/"},publisher:{"@type":"Organization",name:"West Peek Productions",url:DOMAIN+"/"}})}</script>\n</head>\n<body>\n<header><div class="header-inner"><div class="brand"><a href="/" aria-label="West Peek Productions home"><img src="/assets/west-peek-productions-logo.jpeg" alt="West Peek Productions logo"></a><div class="name">West Peek Productions</div></div><nav class="nav" aria-label="Primary"><a href="/">Home</a><a href="/articles">Articles</a><a href="/query-atlas" class="primary">Query Atlas</a><a href="/atlas">Atlas</a><a href="/selected-work">Work</a><a href="/how-west-peek-helps">How we help</a></nav></div></header>\n<div class="container"><section class="hero"><h1>${esc(title)}</h1><p>${esc(desc)}</p><div class="meta"><span class="pill">$0 query intelligence</span><span class="pill">GSC + Gemini-ready</span><span class="pill">6-month cadence</span></div></section><main><article>${body}</article></main></div>\n<footer><div class="container"><nav class="footer-nav"><a href="/">Home</a><a href="/query-atlas">Query Atlas</a><a href="/atlas">Atlas</a><a href="${WPP}" target="_blank" rel="noopener">West Peek Productions</a></nav></div></footer>\n</body>\n</html>\n`;
}
const universePath = path.join(ROOT,'data/query_atlas/query_universe.json');
if (!fs.existsSync(universePath)) { console.error('Missing query universe; run generate_query_universe first.'); process.exit(1); }
const universe = JSON.parse(fs.readFileSync(universePath,'utf8'));
const queries = universe.queries || [];
const byCluster = new Map();
for (const q of queries) { if(!byCluster.has(q.cluster)) byCluster.set(q.cluster,[]); byCluster.get(q.cluster).push(q); }
fs.mkdirSync(path.join(ROOT,'query-atlas'), {recursive:true});
const clusterLinks = [];
for (const [cluster, items] of [...byCluster.entries()].sort()) {
  const file = `query-atlas/${cluster}.html`;
  clusterLinks.push(`<li><a href="/${file.replace(/\.html$/,'')}">${esc(titleCase(cluster))}</a> <span class="muted">${items.length} query opportunities</span></li>`);
  const rows = items.sort((a,b)=>b.priority-a.priority).map(q=>`<tr><td>${esc(q.query)}</td><td>${esc(q.intent)}</td><td>${esc(q.page_family)}</td><td>${esc(q.route_candidate)}</td><td>${q.priority}</td><td>${q.demand_estimate}</td></tr>`).join('\n');
  const body = `<p>This cluster is part of the complete query universe used by the autonomous content release engine. It is designed for answer-engine extraction, Search Console learning, Gemini prompt-panel testing, and programmatic page creation.</p><div class="callout"><strong>Commercial route:</strong> serious buyer-intent pages route to <a href="${WPP}" target="_blank" rel="noopener">West Peek Productions</a>.</div><table><thead><tr><th>Query</th><th>Intent</th><th>Page family</th><th>Route candidate</th><th>Priority</th><th>Demand</th></tr></thead><tbody>${rows}</tbody></table>`;
  fs.writeFileSync(path.join(ROOT,file), page(`${titleCase(cluster)} Query Atlas`, `${items.length} query opportunities for ${titleCase(cluster)} mapped to page families and route candidates.`, body, file));
}
const topRows = queries.slice().sort((a,b)=>b.priority-a.priority).slice(0,120).map(q=>`<tr><td>${esc(q.query)}</td><td>${esc(q.cluster)}</td><td>${esc(q.page_family)}</td><td>${esc(q.route_candidate)}</td><td>${q.priority}</td></tr>`).join('\n');
const body = `<div class="callout"><strong>Query universe installed:</strong> ${queries.length} query opportunities are now in source control. The release cadence is capped at ${universe.counts.max_new_pages_per_day} new pages/day and ${universe.counts.max_repairs_per_day} repairs/day until deployment proof allows promotion.</div><p>This is the atlas layer: the public map of the search/AEO/GEO universe this site is trying to be pulled into.</p><h2>Cluster atlas</h2><ul>${clusterLinks.join('\n')}</ul><h2>Top priority opportunities</h2><table><thead><tr><th>Query</th><th>Cluster</th><th>Page family</th><th>Route candidate</th><th>Priority</th></tr></thead><tbody>${topRows}</tbody></table>`;
fs.writeFileSync(path.join(ROOT,'query-atlas.html'), page('Query Atlas — Virtual Event Production Query Universe', 'A public atlas of the virtual, hybrid, webinar, summit, and executive broadcast query universe mapped to programmatic content opportunities.', body, 'query-atlas.html'));
// Replace the older atlas page with a query-universe forward map, while preserving its old intent clusters below if desired.
fs.writeFileSync(path.join(ROOT,'atlas.html'), page('Atlas — Complete Query Universe', 'The complete answer-engine and search query atlas for West Peek Productions virtual event production content.', body, 'atlas.html'));
console.log(`Generated query atlas pages for ${byCluster.size} clusters and ${queries.length} queries.`);
