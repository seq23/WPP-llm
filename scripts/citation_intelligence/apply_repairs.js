#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Bounded repair mutator.
 *
 * Replaces the previously no-op "repair" branch in apply_release_plan.js for a
 * distinct, separate lane: it consumes data/opportunities/page_diagnostics.json
 * AUTO / AUTO_WATCH findings and applies small, mechanical, source-derived fixes
 * to already-admitted pages. It never fabricates facts, never deletes/merges
 * pages, and never touches routing/admission.
 *
 * Freeze-law compliance (EXACT_ROUTE_THAW_VALIDATE_REFREEZE):
 *  1. this script thaws exactly the routes it is about to mutate by writing
 *     data/release/active_mutation_scope.json
 *  2. it mutates only those files
 *  3. the caller (npm run repairs:apply) runs validate:all, then
 *     authority:scale:freeze to re-accept the new hashes, then
 *     authority:scale:clear-scope
 *
 * Anti-thrash: per-route cooldown + a small daily cap tracked in
 * data/release/repair_receipts_index.json, independent of the release-plan
 * create/repair ledger.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
const DOMAIN = 'https://virtualagency-os.com';

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fallback; }
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(data, null, 2) + '\n');
}
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
const titleCase = (s) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const SECTION_LABEL = { learn: 'Learn', programmatic: 'Guide', 'query-atlas': 'Query Atlas', pillars: 'Pillar', 'case-studies': 'Case Study', insights: 'Insight', answers: 'Answer' };

function extractSourceText(html) {
  const hero = html.match(/<section class="hero">([\s\S]*?)<\/section>/);
  if (hero) { const p = hero[1].match(/<p>([\s\S]*?)<\/p>/); if (p) return strip(p[1]); }
  const art = html.match(/<article>([\s\S]*?)<\/article>/);
  if (art) { const p = art[1].match(/<p>([\s\S]*?)<\/p>/); if (p) return strip(p[1]); }
  const lede = html.match(/<p class="lede">([\s\S]*?)<\/p>/);
  if (lede) return strip(lede[1]);
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (main) { const p = main[1].match(/<p[^>]*>([\s\S]*?)<\/p>/); if (p) return strip(p[1]); }
  return null;
}
const TRAILING_STOPWORDS = new Set(['and', 'or', 'the', 'a', 'an', 'with', 'for', 'to', 'of', 'in', 'on', 'is', 'as', 'at', 'by']);
function truncateAtWord(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  let out = (lastSpace > Math.floor(max * 0.5) ? cut.slice(0, lastSpace) : cut).trim();
  // Avoid ending on a dangling connector word.
  let words = out.split(' ');
  while (words.length > 3 && TRAILING_STOPWORDS.has(words[words.length - 1].toLowerCase().replace(/[,;:]$/, ''))) words.pop();
  out = words.join(' ').replace(/[\s,;:]+$/, '');
  if (!/[.!?]$/.test(out)) out += '.';
  return out;
}
function slugTitleFromRoute(route) {
  const segs = route.split('/').filter(Boolean);
  return titleCase(segs[segs.length - 1] || '');
}
function sectionLabel(route) {
  const seg = route.split('/').filter(Boolean)[0] || '';
  return SECTION_LABEL[seg] || titleCase(seg);
}

function repairMissingCanonical(html, route) {
  if (/<link rel="canonical"/.test(html)) return { html, applied: false };
  const canonicalTag = `<link rel="canonical" href="${DOMAIN}${route}">`;
  if (!/<\/head>/.test(html)) return { html, applied: false };
  return { html: html.replace('</head>', `${canonicalTag}</head>`), applied: true };
}

function repairMetaDescription(html) {
  const existing = html.match(/<meta name="description" content="([^"]*)">/);
  const source = extractSourceText(html);
  if (!source || source.length < 40) return { html, applied: false, reason: 'no_usable_source_text' };
  const desc = truncateAtWord(source, 160);
  if (desc.length < 40) return { html, applied: false, reason: 'derived_description_too_short' };
  const tag = `<meta name="description" content="${esc(desc)}">`;
  if (existing) {
    return { html: html.replace(/<meta name="description" content="[^"]*">/, tag), applied: true, new_value: desc };
  }
  if (!/<title>[^<]*<\/title>/.test(html)) return { html, applied: false, reason: 'no_title_anchor' };
  return { html: html.replace(/(<title>[^<]*<\/title>)/, `$1${tag}`), applied: true, new_value: desc };
}

function repairDuplicateTitle(html, route, existingTitles) {
  const current = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const sepIdx = current.lastIndexOf(' | ');
  const suffix = sepIdx >= 0 ? current.slice(sepIdx + 3) : null;
  if (!suffix) return { html, applied: false, reason: 'no_recognized_title_separator' };

  let candidate = `${slugTitleFromRoute(route)} | ${suffix}`;
  if (existingTitles.has(candidate)) {
    candidate = `${slugTitleFromRoute(route)} (${sectionLabel(route)}) | ${suffix}`;
  }
  if (existingTitles.has(candidate) || candidate === current) {
    return { html, applied: false, reason: 'could_not_produce_unique_title' };
  }
  const newHtml = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(candidate)}</title>`);
  return { html: newHtml, applied: true, new_value: candidate };
}

function main() {
  const diagPath = 'data/opportunities/page_diagnostics.json';
  const diag = readJson(diagPath, null);
  if (!diag) { console.log('No diagnostics file found. Run repairs:diagnose first.'); return; }

  const index = readJson('data/release/repair_receipts_index.json', { daily_cap: 20, route_cooldown_days: 14, today: { date: null, repairs_used: 0 }, receipts: [] });
  const today = new Date().toISOString().slice(0, 10);
  if (index.today.date !== today) index.today = { date: today, repairs_used: 0 };

  const cooldownMs = (index.route_cooldown_days || 14) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const recentlyRepaired = new Set(
    index.receipts.filter((r) => now - new Date(r.repaired_at).getTime() < cooldownMs).map((r) => r.route)
  );

  // All current titles in the corpus, used to guarantee duplicate-title fixes produce unique output.
  const existingTitles = new Set();
  {
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['.git', '.pages-output', 'node_modules', '.build', 'logs', 'artifacts', 'admin'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.html')) {
          const t = (fs.readFileSync(full, 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1];
          if (t) existingTitles.add(t);
        }
      }
    }
    walk(ROOT);
  }

  const candidates = diag.diagnostics.filter((d) => d.diagnosis_type === 'technical' && d.state === 'DIAGNOSED' && ['AUTO', 'AUTO_WATCH'].includes(d.classification) && d.confidence >= 0.7 && !recentlyRepaired.has(d.route));

  const remainingBudget = Math.max(0, (index.daily_cap || 20) - index.today.repairs_used);
  const selected = candidates.slice(0, remainingBudget);

  if (!selected.length) {
    console.log(`No repairs applied this run (candidates: ${candidates.length}, remaining daily budget: ${remainingBudget}).`);
    writeJson(diagPath, diag);
    return;
  }

  const scopeRoutes = new Set();
  const receiptsThisRun = [];
  const retestQueue = readJson('data/authority_scale/retest_queue.json', { entries: [] });

  for (const d of selected) {
    const file = path.join(ROOT, d.file);
    if (!fs.existsSync(file)) { d.state = 'SKIPPED_FILE_MISSING'; continue; }
    let html = fs.readFileSync(file, 'utf8');
    const before = { title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || null, description: (html.match(/<meta name="description" content="([^"]*)">/) || [])[1] ?? null, canonical: (html.match(/<link rel="canonical" href="([^"]*)">/) || [])[1] || null };

    let result;
    if (d.repair_type === 'missing_canonical') result = repairMissingCanonical(html, d.route);
    else if (d.repair_type === 'missing_meta_description' || d.repair_type === 'meta_description_length') result = repairMetaDescription(html);
    else if (d.repair_type === 'duplicate_title') result = repairDuplicateTitle(html, d.route, existingTitles);
    else { d.state = 'SKIPPED_UNSUPPORTED_REPAIR_TYPE'; continue; }

    if (!result.applied) {
      d.state = 'REVIEW_REQUIRED';
      d.classification = 'REVIEW';
      d.review_reason = result.reason || 'repair_not_applied';
      continue;
    }

    fs.writeFileSync(file, result.html);
    if (result.new_value) existingTitles.add(result.new_value); // keep uniqueness set current within this run
    scopeRoutes.add(d.route);

    const after = { title: (result.html.match(/<title>([^<]*)<\/title>/) || [])[1] || null, description: (result.html.match(/<meta name="description" content="([^"]*)">/) || [])[1] ?? null, canonical: (result.html.match(/<link rel="canonical" href="([^"]*)">/) || [])[1] || null };
    const repairId = `repair_${crypto.randomBytes(6).toString('hex')}`;
    const repairedAt = new Date().toISOString();
    const receipt = {
      repair_id: repairId,
      diagnostic_id: d.id,
      route: d.route,
      file: d.file,
      repair_type: d.repair_type,
      classification: d.classification,
      confidence: d.confidence,
      before,
      after,
      repaired_at: repairedAt,
      validation_result: 'PENDING',
      publication_state: 'PENDING_FREEZE'
    };
    writeJson(`data/release/repair_receipts/${repairId}.json`, receipt);
    receiptsThisRun.push(receipt);

    d.state = 'REPAIRED';
    d.repair_id = repairId;
    d.repaired_at = repairedAt;

    retestQueue.entries.push({
      route: d.route,
      query: d.query || null,
      repair_id: repairId,
      diagnostic_id: d.id,
      repair_type: d.repair_type,
      state: 'AWAITING_SEARCH_RESPONSE',
      repaired_at: repairedAt,
      retest_not_before: new Date(now + (retestQueue.default_retest_delay_days || 14) * 24 * 60 * 60 * 1000).toISOString()
    });

    index.today.repairs_used += 1;
    index.receipts.push({ repair_id: repairId, route: d.route, repair_type: d.repair_type, repaired_at: repairedAt });
  }

  if (scopeRoutes.size) {
    const existingScope = readJson('data/release/active_mutation_scope.json', { routes: [] });
    const mergedRoutes = [...new Set([...(existingScope.routes || []), ...scopeRoutes])];
    writeJson('data/release/active_mutation_scope.json', { schema_version: '1.0', generated_at: new Date().toISOString(), source: 'apply_repairs.js', routes: mergedRoutes });
  }

  index.updated_at = new Date().toISOString();
  writeJson('data/release/repair_receipts_index.json', index);
  writeJson('data/authority_scale/retest_outcomes.json', readJson('data/authority_scale/retest_outcomes.json', { events: [] }));
  retestQueue.updated_at = new Date().toISOString();
  writeJson('data/authority_scale/retest_queue.json', retestQueue);
  diag.generated_at = diag.generated_at; // unchanged; state fields updated in place above
  writeJson(diagPath, diag);

  fs.mkdirSync(path.join(ROOT, 'artifacts/release'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'artifacts/release/apply_repairs_summary.json'), JSON.stringify({ at: new Date().toISOString(), candidates: candidates.length, applied: receiptsThisRun.length, routes_thawed: [...scopeRoutes] }, null, 2) + '\n');

  console.log(`Applied ${receiptsThisRun.length} repair(s) across ${scopeRoutes.size} route(s). Routes thawed for refreeze: ${[...scopeRoutes].join(', ') || 'none'}.`);
}

main();
