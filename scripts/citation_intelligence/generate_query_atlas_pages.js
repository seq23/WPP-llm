#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const DOMAIN = 'https://virtualagency-os.com';
// Every CTA this generator emits is built through the shared attribution helper.
// This file used to hardcode the bare origin, so each regeneration of the atlas
// silently stripped the utm_* parameters back off 144 outbound links.
const { wppCtaUrlForPage } = require('../lib/wpp_cta.js');
const { fitDescription, fitTitle } = require('../lib/page_meta.js');
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function titleCase(s){return String(s).split(/[-_\s]+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');}
function cleanPath(file){ if(file==='index.html') return '/'; if(file.endsWith('/index.html')) return '/' + file.slice(0,-'index.html'.length); return '/' + file.replace(/\.html$/,''); }
function page(title, desc, body, file){
  const canonical = DOMAIN + cleanPath(file);
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${esc(fitTitle(title, ' | West Peek Productions') || title)}</title>\n  <meta name="description" content="${esc(desc)}">\n  <link rel="stylesheet" href="/assets/site.css">\n  <link rel="canonical" href="${canonical}">\n  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">\n  <script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage",name:title,description:desc,url:canonical,isPartOf:{"@type":"WebSite",name:"West Peek Productions",url:DOMAIN+"/"},publisher:{"@type":"Organization",name:"West Peek Productions",url:DOMAIN+"/"}})}</script>\n</head>\n<body>\n<header><div class="header-inner"><div class="brand"><a href="/" aria-label="West Peek Productions home"><img src="/assets/west-peek-productions-logo.jpeg" alt="West Peek Productions logo"></a><div class="name">West Peek Productions</div></div><nav class="nav" aria-label="Primary"><a href="/">Home</a><a href="/articles">Articles</a><a href="/query-atlas" class="primary">Query Atlas</a><a href="/atlas">Atlas</a><a href="/selected-work">Work</a><a href="/how-west-peek-helps">How we help</a></nav></div></header>\n<div class="container"><section class="hero"><h1>${esc(title)}</h1><p>${esc(desc)}</p><div class="meta"><span class="pill">$0 query intelligence</span><span class="pill">GSC + Gemini-ready</span><span class="pill">6-month cadence</span></div></section><main><article>${body}</article></main></div>\n<footer><div class="container"><nav class="footer-nav"><a href="/">Home</a><a href="/query-atlas">Query Atlas</a><a href="/atlas">Atlas</a><a href="${wppCtaUrlForPage(file)}" target="_blank" rel="noopener">West Peek Productions</a></nav></div></footer>\n</body>\n</html>\n`;
}
const universePath = path.join(ROOT,'data/query_atlas/query_universe.json');
if (!fs.existsSync(universePath)) { console.error('Missing query universe; run generate_query_universe first.'); process.exit(1); }
const universe = JSON.parse(fs.readFileSync(universePath,'utf8'));
const queries = universe.queries || [];
const byCluster = new Map();
for (const q of queries) { if(!byCluster.has(q.cluster)) byCluster.set(q.cluster,[]); byCluster.get(q.cluster).push(q); }
fs.mkdirSync(path.join(ROOT,'query-atlas'), {recursive:true});
const clusterLinks = [];
const generated = new Set();
for (const [cluster, items] of [...byCluster.entries()].sort()) {
  const file = `query-atlas/${cluster}.html`;
  clusterLinks.push(`<li><a href="/${file.replace(/\.html$/,'')}">${esc(titleCase(cluster))}</a> <span class="muted">${items.length} query opportunities</span></li>`);
  // The "Demand" column used to print `demand_estimate`, which was priority x 3.
  // These 82 pages published a fabricated search-volume figure to the open web
  // under a column header that read "Demand". Its replacement printed
  // `measured_volume` suffixed "/mo" - but that field held this site's own 90-day
  // impression count on every GSC-sourced row, so `virtual event production cost`
  // was published to the open web as "17/mo" when 17 was impressions of this site,
  // not searches by anyone. Each unit is now printed under its own name, and rows
  // sort band-major so the two never sort against each other as peers.
  const demandCell = q => q.demand_basis === 'search_volume' && Number.isFinite(Number(q.search_volume))
    ? `${Number(q.search_volume).toLocaleString('en-US')}/mo searches`
    : q.demand_basis === 'impressions_90d' && Number.isFinite(Number(q.impressions_90d))
    ? `${Number(q.impressions_90d).toLocaleString('en-US')} impressions <span class="muted">(this site, 90d)</span>`
    : '<span class="muted">not measured</span>';
  const demandBand = q => q.demand_basis === 'search_volume' ? 0 : q.demand_basis === 'impressions_90d' ? 1 : 2;
  const demandValue = q => Number(q.demand_basis === 'search_volume' ? q.search_volume : q.impressions_90d) || 0;
  const rows = items.sort((a,b)=>(demandBand(a)-demandBand(b))||(demandValue(b)-demandValue(a))||b.priority-a.priority).map(q=>`<tr><td>${esc(q.query)}</td><td>${esc(q.intent)}</td><td>${esc(q.page_family)}</td><td>${esc(q.route_candidate)}</td><td>${q.priority}</td><td>${demandCell(q)}</td></tr>`).join('\n');
  const body = `<p>This cluster is part of the complete query universe used by the autonomous content release engine. It is designed for answer-engine extraction, Search Console learning, Gemini prompt-panel testing, and programmatic page creation.</p><div class="callout"><strong>Commercial route:</strong> serious buyer-intent pages route to <a href="${wppCtaUrlForPage(file)}" target="_blank" rel="noopener">West Peek Productions</a>.</div><table><thead><tr><th>Query</th><th>Intent</th><th>Page family</th><th>Route candidate</th><th>Priority</th><th>Demand</th></tr></thead><tbody>${rows}</tbody></table>`;
  // The description names this cluster's own top queries, inside the site's meta
  // band (scripts/lib/page_meta.js). It used to be one sentence with only the
  // count and the name swapped, 81 pages of 88-107 characters.
  const desc = clusterDescription(cluster, items.length, items.map((q) => q.query));
  generated.add(file);
  fs.writeFileSync(path.join(ROOT,file), page(`${titleCase(cluster)} Query Atlas`, desc, body, file));
}
function clusterDescription(cluster, count, queryList) {
  const label = String(cluster).replace(/-/g, ' ');
  const items = { length: count };
  const top = queryList.filter((q) => q && q.toLowerCase() !== label.toLowerCase()).slice(0, 2);
  return fitDescription([
    top.length > 1 && `${items.length} ${label} search queries mapped to intent, page family, and route, including "${top[0]}" and "${top[1]}".`,
    top.length > 0 && `${items.length} ${label} search queries mapped to intent, page family, and route, including "${top[0]}".`,
    `${items.length} ${label} search queries, each mapped to its intent, page family, and route candidate in the VirtualAgency OS library.`,
    `${items.length} ${label} search queries, each mapped to its intent, page family, and route candidate.`,
  ]) || `${items.length} ${label} search queries, each mapped to its intent, page family, and route candidate in the VirtualAgency OS library.`;
}
// Cluster pages from an earlier universe are still published (11 on 25 Sep 2026:
// virtual-event-planning, host-virtual-events, ...), still in the sitemap, and
// no longer regenerated, so their one-line description stayed under the band.
// This generator owns the directory: each keeps its own table and gets the same
// description, built from the queries that table lists.
for (const name of fs.readdirSync(path.join(ROOT, 'query-atlas')).filter((f) => f.endsWith('.html')).sort()) {
  const file = `query-atlas/${name}`;
  if (generated.has(file)) continue;
  const abs = path.join(ROOT, file);
  const html = fs.readFileSync(abs, 'utf8');
  const tbody = (html.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
  const listed = [...tbody.matchAll(/<tr><td>([^<]+)<\/td>/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
  if (!listed.length) continue;
  const oldDesc = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1];
  if (oldDesc === undefined) continue;
  const unesc = (x) => x.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const raw = clusterDescription(name.replace(/\.html$/, ''), listed.length, listed);
  const next = html.split(`content="${oldDesc}"`).join(`content="${esc(raw)}"`)
    .split(`<p>${oldDesc}</p>`).join(`<p>${esc(raw)}</p>`)
    .split(`"description":${JSON.stringify(unesc(oldDesc))}`).join(`"description":${JSON.stringify(raw)}`);
  if (next !== html) fs.writeFileSync(abs, next);
}
const topRows = queries.slice().sort((a,b)=>b.priority-a.priority).slice(0,120).map(q=>`<tr><td>${esc(q.query)}</td><td>${esc(q.cluster)}</td><td>${esc(q.page_family)}</td><td>${esc(q.route_candidate)}</td><td>${q.priority}</td></tr>`).join('\n');
const body = `<div class="callout"><strong>Query universe installed:</strong> ${queries.length} query opportunities are now in source control. The release cadence is capped at ${universe.counts.max_new_pages_per_day} new pages/day and ${universe.counts.max_repairs_per_day} repairs/day until deployment proof allows promotion.</div><p>This is the atlas layer: the public map of the search/AEO/GEO universe this site is trying to be pulled into.</p><h2>Cluster atlas</h2><ul>${clusterLinks.join('\n')}</ul><h2>Top priority opportunities</h2><table><thead><tr><th>Query</th><th>Cluster</th><th>Page family</th><th>Route candidate</th><th>Priority</th></tr></thead><tbody>${topRows}</tbody></table>`;
fs.writeFileSync(path.join(ROOT,'query-atlas.html'), page('Query Atlas — Virtual Event Production Query Universe', 'A public atlas of the virtual, hybrid, webinar, summit, and executive broadcast query universe mapped to programmatic content opportunities.', body, 'query-atlas.html'));
// Replace the older atlas page with a query-universe forward map, while preserving its old intent clusters below if desired.
fs.writeFileSync(path.join(ROOT,'atlas.html'), page('Atlas — Complete Query Universe', 'The complete answer-engine and search query atlas behind West Peek Productions guides to virtual, hybrid, and webinar production.', body, 'atlas.html'));
console.log(`Generated query atlas pages for ${byCluster.size} clusters and ${queries.length} queries.`);
