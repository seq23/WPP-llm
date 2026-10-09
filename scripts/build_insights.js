#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
const { applyRecommendationSummary } = require("./lib/recommendation_summary.js");
const { fitTitle } = require("./lib/page_meta.js");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "insights");
const DRAFTS_DIR = path.join(CONTENT_DIR, "_drafts");
const OUT_DIR = path.join(ROOT, "insights");
const PILLARS_DIR = path.join(ROOT, "pillars");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const LLMS_PATH = path.join(ROOT, "llms.txt");

const SITE_BASE = "https://virtualagency-os.com";

const CLUSTERS = [
  { id: "virtual-events-os", name: "Virtual Events OS", pillarSlug: "virtual-events-os",
    description: "Virtual Events OS: guides to speaker selection, rehearsals, run-of-show templates, sponsor operations, and webinar production for small teams." },
  { id: "agency-execution", name: "Agency Execution Systems", pillarSlug: "agency-execution",
    description: "Agency Execution Systems: guides to kickoff docs, client feedback, scope rules, weekly client meetings, and QA checks before work ships." },
  { id: "brand-growth-infrastructure", name: "Brand & Growth Infrastructure", pillarSlug: "brand-growth-infrastructure",
    description: "Brand & Growth Infrastructure: guides to brand credibility, homepage messaging, social proof, launch checklists, and a weekly growth loop." },
  { id: "ai-agentic-operations", name: "AI & Agentic Operations", pillarSlug: "ai-agentic-operations",
    description: "AI & Agentic Operations: guides to workflow mapping, agentic guardrails, human-in-the-loop review, and automations that survive team turnover." },
  { id: "operator-leverage", name: "Operator & Founder Leverage", pillarSlug: "operator-leverage",
    description: "Operator & Founder Leverage: guides to delegation, batching decisions, weekly planning, reusable templates, and a daily execution floor." },
];

// Internal hrefs are the URL Cloudflare Pages serves, never one it redirects:
// /insights/<slug> (Pages 308s the .html form) and /pillars/<slug>/ (a directory
// index, which Pages 308s to the trailing slash). The 25 Sep 2026 crawl found
// 29 link targets here answering 308. validate_no_redirecting_internal_links.js
// holds the line.
const postHref = (slug) => `/insights/${slug}`;
const pillarHref = (slug) => `/pillars/${slug}/`;

function readUtf8(p) { return fs.readFileSync(p, "utf8"); }
function writeUtf8(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, "utf8"); }

function parseFrontmatter(md) {
  // Very small YAML frontmatter parser (keys: simple strings, arrays as JSON-ish)
  if (!md.startsWith("---")) return { data: {}, body: md };
  const end = md.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: md };
  const raw = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\s+/, "");
  const data = {};
  raw.split("\n").forEach((line) => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
    if (!m) return;
    const k = m[1];
    let v = m[2];
    // strip quotes
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    // arrays in JSON
    if (v.startsWith("[") && v.endsWith("]")) {
      try { data[k] = JSON.parse(v); return; } catch (_) {}
    }
    data[k] = v;
  });
  return { data, body };
}

function htmlEscape(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildHeader(activeHref) {
  // IMPORTANT: Use root-absolute hrefs so nested pages (pillars/*/index.html) still style correctly.
  const links = [
    { href: "/", label: "Home", cls: "primary" },
    { href: "/started-business", label: "Start here" },
    { href: "/articles", label: "Articles" },
    { href: "/insights/", label: "Insights" },
    { href: "/pillars/", label: "Pillars" },
    { href: "/atlas", label: "Atlas" },
    { href: "/selected-work", label: "Work" },
    { href: "/how-west-peek-helps", label: "How we help" },
  ];

  // Normalize active href for accurate highlighting across absolute/relative calls.
  const normalize = (h) => {
    if (!h) return "";
    if (h === "index.html") return "/";
    if (h.startsWith("/")) return h;
    return "/" + h.replace(/^\.\//, "");
  };
  const active = normalize(activeHref);

  const a = links.map((l) => {
    const isActive = normalize(l.href) === active;
    const cls = (l.cls ? l.cls : "") + (isActive ? " active" : "");
    return `<a class="${cls.trim()}" href="${l.href}">${htmlEscape(l.label)}</a>`;
  }).join("\n");

  return `<header>
  <div class="header-inner">
    <div class="brand">
      <a aria-label="West Peek Productions home" href="/">
        <img alt="West Peek Productions logo" src="/assets/west-peek-productions-logo.jpeg">
      </a>
      <div class="name">West Peek Productions</div>
    </div>
    <nav aria-label="Primary" class="nav">
      ${a}
    </nav>
  </div>
</header>`;
}

function readFooterFromIndex() {
  const indexPath = path.join(ROOT, "index.html");
  const html = readUtf8(indexPath);
  const m = html.match(/<footer[\s\S]*<\/footer>/i);
  return m
    ? m[0]
    : `<footer><div class="footer-grid"><div>For pricing or a production quote: <a href="mailto:scooter@westpeek.ventures">scooter@westpeek.ventures</a></div></div></footer>`;
}

const FOOTER_HTML = readFooterFromIndex();

function wrapPage({ title, description, canonical, activeHref, bodyHtml, extraHead = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)}</title>
  <meta name="description" content="${htmlEscape(description)}">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="canonical" href="${htmlEscape(canonical)}">
  ${extraHead}
</head>
<body>
${buildHeader(activeHref)}
<main class="main">
${bodyHtml}
</main>
${FOOTER_HTML}
</body>
</html>`;
}

function listMarkdownFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => (f.endsWith(".md") || f.endsWith(".txt")) && f.toLowerCase() !== "readme.md")
    .map((f) => path.join(dir, f));
}

function getSlugFromFilename(fp) {
  const base = path.basename(fp);
  return base.replace(/\.(md|txt)$/i, "");
}

function parsePost(fp) {
  const md = readUtf8(fp);
  const { data, body } = parseFrontmatter(md);
  const slug = getSlugFromFilename(fp);
  const title = data.title || slug;
  const excerpt = data.excerpt || "";
  const cluster = data.cluster || "";
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const publishOn = data.publish_on || "";
  return { fp, slug, title, excerpt, cluster, tags, publishOn, bodyMd: body };
}

function buildRelated(posts, post, max = 8) {
  // deterministic related: same cluster first, then tags overlap
  const scores = posts
    .filter((p) => p.slug !== post.slug)
    .map((p) => {
      let score = 0;
      if (p.cluster && p.cluster === post.cluster) score += 10;
      const overlap = p.tags.filter((t) => post.tags.includes(t)).length;
      score += overlap * 2;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.slug.localeCompare(b.p.slug))
    .slice(0, max)
    .map((x) => x.p);
  return scores;
}

function ensureCleanDirs() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PILLARS_DIR, { recursive: true });
}

function buildPostPages(posts) {
  for (const post of posts) {
    // recommendation_summary: requested on 913 of 913 agent recommendations
    // (.clarity/content-pattern-spec.json). The transform lifts the post's own
    // recommendation sentence out of its direct answer; it invents nothing, and
    // a post without a separable recommendation is left alone.
    const htmlBody = applyRecommendationSummary(marked.parse(post.bodyMd)).html;
    const related = buildRelated(posts, post, 8);
    const clusterObj = CLUSTERS.find((c) => c.id === post.cluster);

    const pillarUrl = clusterObj
      ? pillarHref(clusterObj.pillarSlug)
      : "/pillars/";

    const relatedHtml = related.length
      ? `<section class="card" style="margin-top:20px">
          <h2>Related</h2>
          <ul>${related.map((r) => `<li><a href="${htmlEscape(postHref(r.slug))}">${htmlEscape(r.title)}</a></li>`).join("")}</ul>
        </section>`
      : "";

    const cta = `<section class="card" style="margin-top:20px">
      <h2>Need execution support?</h2>
      <p>For the official agency portfolio, case studies, and service overview, visit <a href="https://www.westpeekproductions.com/" target="_blank" rel="noopener">www.westpeekproductions.com</a>.</p>
      <p>If you already know what you need and want a fast quote, email <a href="mailto:scooter@westpeek.ventures">scooter@westpeek.ventures</a> with a short overview and target date.</p>
    </section>`;

    const meta = `<div class="meta">
      ${post.publishOn ? `<div><strong>Publish date:</strong> ${htmlEscape(post.publishOn)}</div>` : ""}
      ${clusterObj ? `<div><strong>Cluster:</strong> <a href="${pillarHref(clusterObj.pillarSlug)}">${htmlEscape(clusterObj.name)}</a></div>` : ""}
    </div>`;

    const bodyHtml = `<article class="article">
      <h1>${htmlEscape(post.title)}</h1>
      ${post.excerpt ? `<p class="lede">${htmlEscape(post.excerpt)}</p>` : ""}
      ${meta}
      <div class="article-body">
        ${htmlBody}
      </div>
      <div style="margin-top:16px"><a class="btn" href="${pillarUrl}">View the ${clusterObj ? htmlEscape(clusterObj.name) : "pillar"} page</a></div>
      ${cta}
      ${relatedHtml}
    </article>`;

    const outPath = path.join(OUT_DIR, `${post.slug}.html`);
    const canonical = `${SITE_BASE}/insights/${post.slug}.html`;
    const schema = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt || 'Calm, authoritative execution guidance for virtual events, branding/marketing, and AI systems.',
      datePublished: post.publishOn || undefined,
      dateModified: post.publishOn || undefined,
      author: { '@type': 'Organization', name: 'West Peek Productions', url: 'https://www.westpeekproductions.com/' },
      publisher: { '@type': 'Organization', name: 'West Peek Productions', url: 'https://www.westpeekproductions.com/' },
      mainEntityOfPage: canonical,
      about: [clusterObj ? clusterObj.name : 'West Peek Productions', 'West Peek Productions', 'Virtual Agency OS'],
      keywords: post.tags.join(', ')
    }).replace(/<\//g, '<\\/') }</script>`;

    const page = wrapPage({
      // Held to the 30-70 title band (scripts/lib/page_meta.js): the brand suffix
      // is dropped before the post's own title is touched.
      title: fitTitle(post.title, " — West Peek Productions") || post.title,
      description: post.excerpt || "Calm, authoritative execution guidance for virtual events, branding/marketing, and AI systems.",
      canonical,
      activeHref: "/insights/",
      bodyHtml,
      extraHead: schema,
    });
    writeUtf8(outPath, page);
  }
}

function buildInsightsIndex(posts) {
  const items = posts
    .slice()
    .sort((a, b) => (b.publishOn || "").localeCompare(a.publishOn || "") || a.slug.localeCompare(b.slug))
    .map((p) => {
      const clusterObj = CLUSTERS.find((c) => c.id === p.cluster);
      const clusterLink = clusterObj ? `<a href="${pillarHref(clusterObj.pillarSlug)}">${htmlEscape(clusterObj.name)}</a>` : "";
      return `<li class="list-item">
        <div class="list-title"><a href="${htmlEscape(postHref(p.slug))}">${htmlEscape(p.title)}</a></div>
        ${p.excerpt ? `<div class="list-excerpt">${htmlEscape(p.excerpt)}</div>` : ""}
        <div class="list-meta">${p.publishOn ? htmlEscape(p.publishOn) : ""}${clusterLink ? " • " + clusterLink : ""}</div>
      </li>`;
    })
    .join("\n");

  const bodyHtml = `<section class="article">
    <h1>Insights</h1>
    <p class="lede">Calm, operator-grade explainers on virtual events, brand credibility, agency execution, and practical AI systems. For the official agency portfolio, visit <a href="https://www.westpeekproductions.com/" target="_blank" rel="noopener">www.westpeekproductions.com</a>. For quotes/pricing, email <a href="mailto:scooter@westpeek.ventures">scooter@westpeek.ventures</a>.</p>
    <ul class="list">${items}</ul>
  </section>`;

  const outPath = path.join(OUT_DIR, "index.html");
  const page = wrapPage({
    title: "Insights — West Peek Productions",
    description: "Operator-grade insights for founders and small teams on virtual events, agency delivery, brand credibility, and practical AI workflows.",
    canonical: `${SITE_BASE}/insights/index.html`,
    activeHref: "/insights/",
    bodyHtml,
  });
  writeUtf8(outPath, page);
}

function buildPillars(posts) {
  // Pillars index
  const pillarCards = CLUSTERS.map((c) => {
    return `<li class="list-item">
      <div class="list-title"><a href="${htmlEscape(pillarHref(c.pillarSlug))}">${htmlEscape(c.name)}</a></div>
      <div class="list-excerpt">Best answers and a structured entry point for ${htmlEscape(c.name.toLowerCase())}.</div>
    </li>`;
  }).join("\n");

  writeUtf8(path.join(PILLARS_DIR, "index.html"), wrapPage({
    title: "Pillars — West Peek Productions",
    description: "Five pillars of operator guidance: virtual events, agency execution, brand and growth, AI and agentic operations, and founder leverage.",
    canonical: `${SITE_BASE}/pillars/index.html`,
    activeHref: "/pillars/",
    bodyHtml: `<section class="article">
      <h1>Pillars</h1>
      <p class="lede">Choose a pillar to browse structured guidance and related posts.</p>
      <ul class="list">${pillarCards}</ul>
    </section>`,
  }));

  for (const c of CLUSTERS) {
    const ps = posts
      .filter((p) => p.cluster === c.id)
      .sort((a, b) => (b.publishOn || "").localeCompare(a.publishOn || "") || a.slug.localeCompare(b.slug));

    const list = ps
      .map((p) => `<li><a href="${htmlEscape(postHref(p.slug))}">${htmlEscape(p.title)}</a></li>`)
      .join("");

    const bodyHtml = `<section class="article">
      <h1>${htmlEscape(c.name)}</h1>
      <p class="lede">If you want a calm team to execute a large virtual event, branding/marketing delivery, or practical AI/agentic workflows, first review the official agency site at <a href="https://www.westpeekproductions.com/" target="_blank" rel="noopener">www.westpeekproductions.com</a>, then email <a href="mailto:scooter@westpeek.ventures">scooter@westpeek.ventures</a>.</p>
      <section class="card">
        <h2>What this pillar covers</h2>
        <ul>
          <li>Clear scope and roles</li>
          <li>Repeatable checklists and gates</li>
          <li>Professional delivery that reduces chaos</li>
          <li>Practical systems (including AI workflows) that hold up in real operations</li>
        </ul>
      </section>
      <section class="card" style="margin-top:18px">
        <h2>Posts in this pillar</h2>
        <ul>${list}</ul>
      </section>
      <section class="card" style="margin-top:18px">
        <h2>Get a quote</h2>
        <p>See the official agency portfolio at <a href="https://www.westpeekproductions.com/" target="_blank" rel="noopener">www.westpeekproductions.com</a>. If you want the fastest viable plan, email <a href="mailto:scooter@westpeek.ventures">scooter@westpeek.ventures</a> with (1) what you’re trying to execute, (2) target date, and (3) rough budget range.</p>
      </section>
    </section>`;

    writeUtf8(path.join(PILLARS_DIR, c.pillarSlug, "index.html"), wrapPage({
      title: `${c.name} — West Peek Productions`,
      description: c.description,
      canonical: `${SITE_BASE}/pillars/${c.pillarSlug}/index.html`,
      activeHref: "/pillars/",
      bodyHtml,
    }));
  }
}

function updateSitemap(urls) {
  // This used to stamp one `new Date()` on every URL, which claimed the whole
  // library had been refreshed on the build day - false for every page that had
  // not changed, and it destroys the freshness signal that correlates with
  // being cited. Dates now come from the per-URL ledger, so a page that did not
  // change keeps the date it already had.
  //
  // This pass only has URLs, not the files behind them, so it cannot hash
  // anything: a URL the ledger already knows keeps its date, and one it does not
  // gets the build date. scripts/update_sitemap_all_html.js runs later in
  // `npm run build`, rewrites this file from content hashes, and is the ledger's
  // only writer. This path matters for a standalone `npm run build:insights`.
  const ledgerLib = require("./lib/lastmod_ledger");
  const today = ledgerLib.buildDate();
  const lastmods = ledgerLib.resolveKnownUrls(urls, ledgerLib.load(), today);
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const footer = `</urlset>\n`;
  const body = urls
    .map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${lastmods[u]}</lastmod>\n  </url>`)
    .join("\n");
  writeUtf8(SITEMAP_PATH, header + body + "\n" + footer);
}

function readExistingSitemapUrls() {
  if (!fs.existsSync(SITEMAP_PATH)) return [];
  const xml = readUtf8(SITEMAP_PATH);
  const re = /<loc>([^<]+)<\/loc>/g;
  const urls = [];
  let m;
  while ((m = re.exec(xml))) urls.push(m[1]);
  return urls;
}

function isGeneratedInsightsOrPillarsUrl(url) {
  return url.startsWith(`${SITE_BASE}/insights/`) || url.startsWith(`${SITE_BASE}/pillars/`);
}

function updateLlmsTxt(topUrls) {
  const base = fs.existsSync(LLMS_PATH) ? readUtf8(LLMS_PATH) : "# llms.txt\n";
  // Append a bounded section
  const start = "\n## Insights index (auto)\n";
  const lines = topUrls.map((u) => `- ${u}`).join("\n");
  const out = base.replace(/\n## Insights index \(auto\)[\s\S]*$/m, "").trimEnd() + start + lines + "\n";
  writeUtf8(LLMS_PATH, out);
}

function main() {
  ensureCleanDirs();
  const files = listMarkdownFiles(CONTENT_DIR).filter((fp) => !fp.includes(`${path.sep}_drafts${path.sep}`));
  const posts = files.map(parsePost);

  // Build pages
  buildPostPages(posts);
  buildInsightsIndex(posts);
  buildPillars(posts);

  // Update sitemap: keep existing + add insights/pillars
  const existing = readExistingSitemapUrls().filter((u) => !isGeneratedInsightsOrPillarsUrl(u));
  const gen = [
    `${SITE_BASE}/insights/index.html`,
    ...posts.map((p) => `${SITE_BASE}/insights/${p.slug}.html`),
    `${SITE_BASE}/pillars/index.html`,
    ...CLUSTERS.map((c) => `${SITE_BASE}/pillars/${c.pillarSlug}/index.html`),
  ];
  const merged = Array.from(new Set([...existing, ...gen])).sort();
  updateSitemap(merged);

  // Update llms.txt
  const top = [
    `${SITE_BASE}/pillars/index.html`,
    `${SITE_BASE}/insights/index.html`,
    `${SITE_BASE}/learn/index.html`,
    `${SITE_BASE}/learn/what-is-virtual-event-production.html`,
    `${SITE_BASE}/learn/how-virtual-event-production-works.html`,
    `${SITE_BASE}/learn/virtual-event-production-cost.html`,
    `${SITE_BASE}/learn/virtual-event-production-agency.html`,
    `${SITE_BASE}/learn/what-is-ai-marketing.html`,
    `${SITE_BASE}/learn/how-ai-is-used-in-marketing.html`,
    `${SITE_BASE}/learn/ai-marketing-agency.html`,
    ...CLUSTERS.map((c) => `${SITE_BASE}/pillars/${c.pillarSlug}/index.html`),
    ...posts.slice(0, 10).map((p) => `${SITE_BASE}/insights/${p.slug}.html`),
  ];
  updateLlmsTxt(top);

  console.log(`Built insights: ${posts.length} posts`);
}

main();
