#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Writes data/seo/demand_families.json: every measured Search Console query in
 * data/seo/measured_targets.json grouped into a query family (shared head term +
 * the page Google shows for it), ranked by 90-day impressions.
 *
 * WHY. On 11 Oct 2026 the owner asked "are we figuring out what people are
 * asking for and serving pages according to that?" The demand was known (482
 * measured queries, 7,288 impressions in 90 days, 0 clicks) but nothing grouped
 * it, so the strengthening pass worked off the three pages in the 28-day window
 * and missed the families that carry the impressions.
 *
 * Rules live in data/seo/demand_family_rules.json (first match wins). A query
 * no rule matches joins an automatic family named after the head slug of its
 * landing page, so every query is in exactly one family and the impressions add
 * up to the measured total (validate_demand_families.js proves both).
 *
 * The top 12 eligible families are the ones whose primary page must serve the
 * family's intent (data/seo/demand_pages.json, applied by apply_site_head.js).
 */
const fs = require('fs');
const path = require('path');
const { resolvePath } = require('./lib/pages_routing.js');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = 'data/seo/measured_targets.json';
const RULES = 'data/seo/demand_family_rules.json';
const OUT = 'data/seo/demand_families.json';
const TOP_N = 12;
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const round1 = (n) => Math.round(n * 10) / 10;

const MODIFIERS = /-(for-.*|vs-.*|cost|pricing|examples?|checklist|timeline|template|process|workflow|agency|companies|consultant|services|best-practices|measurement|roi-factors|deliverables|scope-of-work|strategy-framework|implementation-guide|operating-model|how-to-.*|what-a-good-.*|questions-to-ask|common-failure-points|case-pattern|comparison|audit|mistakes|2026|red-flags|when-to-hire)$/;
function headSlug(page) {
  let s = String(page || '/').replace(/^\/(programmatic|learn|answers|insights|query-atlas|topics|pillars)\//, '/').replace(/^\//, '').replace(/^what-is-/, '');
  for (let i = 0; i < 3; i++) s = s.replace(MODIFIERS, '');
  return s || 'home';
}

function buildFamilies({ targets, rules, root = ROOT }) {
  const compiled = rules.families.map((r) => ({ ...r, re: new RegExp(r.pattern, 'i') }));
  const meta = new Map();
  for (const r of rules.families) if (!meta.has(r.id)) meta.set(r.id, r);
  const fams = new Map();
  const resolveNow = (p) => {
    const r = resolvePath(p, { root });
    return r.kind === 'redirect' ? r.to : r.kind === 'page' ? p : null;
  };
  for (const t of targets) {
    const rule = compiled.find((r) => r.re.test(t.query));
    let id; let m;
    if (rule) { id = rule.id; m = meta.get(id); }
    else {
      const head = headSlug((t.pages || [])[0]);
      id = `auto-${head}`;
      m = { id, label: head.replace(/-/g, ' '), intent: 'informational', primary_route: null, auto: true };
    }
    if (!fams.has(id)) fams.set(id, { meta: m, queries: [] });
    fams.get(id).queries.push(t);
  }
  const families = [...fams.values()].map(({ meta: m, queries }) => {
    const impressions = queries.reduce((a, q) => a + Number(q.impressions || 0), 0);
    const pageImp = new Map();
    for (const q of queries) for (const p of q.pages || []) pageImp.set(p, (pageImp.get(p) || 0) + Number(q.impressions || 0) / (q.pages.length || 1));
    const pages = [...pageImp.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const current = pages.length ? pages[0][0] : null;
    const weighted = impressions ? queries.reduce((a, q) => a + Number(q.best_position) * Number(q.impressions), 0) / impressions : null;
    return {
      family: m.id,
      label: m.label,
      intent: m.intent,
      impressions,
      clicks: queries.reduce((a, q) => a + Number(q.clicks || 0), 0),
      query_count: queries.length,
      best_position: round1(Math.min(...queries.map((q) => Number(q.best_position)))),
      weighted_position: weighted === null ? null : round1(weighted),
      head_query: [...queries].sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))[0].query,
      current_page: current,
      current_page_resolves_to: current ? resolveNow(current) : null,
      primary_route: m.primary_route || (current ? resolveNow(current) : null),
      eligible_for_strengthening: m.eligible_for_strengthening !== false && !m.auto,
      ...(m.why_not_eligible ? { why_not_eligible: m.why_not_eligible } : {}),
      ...(m.auto ? { auto_family: true } : {}),
      landing_pages: pages.map(([p, n]) => ({ page: p, impressions: round1(n), resolves_to: resolveNow(p) })),
      queries: [...queries]
        .sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))
        .map((q) => ({ query: q.query, impressions: q.impressions, best_position: q.best_position, pages: q.pages })),
    };
  }).sort((a, b) => b.impressions - a.impressions || a.family.localeCompare(b.family));
  let rank = 0;
  families.forEach((f, i) => {
    f.rank = i + 1;
    if (f.eligible_for_strengthening && rank < TOP_N) { rank += 1; f.top12_rank = rank; f.top12 = true; } else f.top12 = false;
  });
  return families;
}

function build(root = ROOT) {
  const mt = JSON.parse(fs.readFileSync(path.join(root, TARGETS), 'utf8'));
  const rules = JSON.parse(fs.readFileSync(path.join(root, RULES), 'utf8'));
  const targets = mt.targets || [];
  const families = buildFamilies({ targets, rules, root });
  return {
    _comment: [
      'Written by scripts/build_demand_families.js from data/seo/measured_targets.json and data/seo/demand_family_rules.json. Do not edit by hand.',
      'Every measured query is in exactly one family; impressions add up to the measured total. top12 marks the families whose primary page must serve the intent (data/seo/demand_pages.json).',
      'Proven by scripts/validators/validate_demand_families.js (fresh and consistent with measured_targets).',
    ],
    measured_targets_generated_at: mt.generated_at,
    window: 'Search Console, 90 days (plus the 28-day rows), as merged by scripts/build_measured_targets.js',
    target_count: targets.length,
    impressions_total: targets.reduce((a, t) => a + Number(t.impressions || 0), 0),
    family_count: families.length,
    top_n: TOP_N,
    top12: families.filter((f) => f.top12).map((f) => f.family),
    families,
  };
}

if (require.main === module) {
  const out = build();
  if (!out.target_count) { console.error('demand-families: zero measured targets; refusing to write an empty family list.'); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`demand-families: ${out.target_count} queries, ${out.impressions_total} impressions in ${out.family_count} families; top 12: ${out.top12.join(', ')}.`);
}
module.exports = { build, buildFamilies, headSlug, OUT, TOP_N };
