#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const {
  ROOT, readJson, cleanRoute, governedRoute, listProgrammaticPages, candidateQuality,
  shingleSetFromHtml, wordCountFromHtml,
} = require('./content_quality.js');
const { renderProgrammaticPage } = require('./render_programmatic_page.js');

const plan = readJson('data/releases/daily_release_plan.json', { units: [] });
const adm = readJson('data/content/page_admission_registry.json', { admissions: [] });
const state = readJson('data/content/content_state_registry.json', { published_routes: [], blocked_routes: [] });
let created = 0; let repaired = 0; let qualityRejected = 0; const skipped = [];
let stagedCorpus = listProgrammaticPages();

function recordAdmission(u, route) {
  const i = (adm.admissions || []).findIndex(a => governedRoute(a.route) === route && a.query === u.query);
  const rec = {
    route,
    source_route: cleanRoute(u.source_route || u.target_route),
    query: u.query,
    cluster: u.cluster || null,
    pillar: u.pillar || 'experiences',
    page_family: u.page_family,
    action: u.release_action,
    status: 'admitted',
    entity_binding: 'west_peek_productions',
    updated_at: new Date().toISOString(),
    admitted_at: i >= 0 ? adm.admissions[i].admitted_at : new Date().toISOString(),
  };
  if (i >= 0) adm.admissions[i] = { ...adm.admissions[i], ...rec }; else adm.admissions.push(rec);
  if (!state.published_routes.includes(route)) state.published_routes.push(route);
}

for (const u of plan.units || []) {
  const publicRoute = governedRoute(u.target_route);
  const rel = publicRoute.replace(/^\//, '');
  const file = path.join(ROOT, rel + '.html');
  const html = renderProgrammaticPage({ ...u, target_route: publicRoute });
  const quality = candidateQuality(html, { ...u, target_route: publicRoute }, stagedCorpus);
  if (!quality.ok) {
    qualityRejected += 1;
    skipped.push({ route:publicRoute, source_route:u.target_route, reason:'quality_rejected_at_apply', details:quality.reasons, word_count:quality.word_count, max_similarity:quality.max_similarity, nearest_route:quality.nearest_route });
    continue;
  }
  if (u.release_action === 'create') {
    if (fs.existsSync(file)) { skipped.push({route:publicRoute,source_route:u.target_route,reason:'create_target_already_exists'}); continue; }
    fs.mkdirSync(path.dirname(file), { recursive:true });
    fs.writeFileSync(file, html);
    created += 1;
  } else if (u.release_action === 'repair') {
    if (!fs.existsSync(file)) { skipped.push({route:publicRoute,source_route:u.target_route,reason:'repair_target_missing'}); continue; }
    const existing = fs.readFileSync(file, 'utf8');
    if (existing === html) { skipped.push({route:publicRoute,source_route:u.target_route,reason:'repair_no_change'}); continue; }
    fs.writeFileSync(file, html);
    repaired += 1;
  } else {
    skipped.push({route:publicRoute,source_route:u.target_route,reason:'unsupported_release_action'});
    continue;
  }
  stagedCorpus = stagedCorpus.filter(p => p.route !== publicRoute);
  if (publicRoute.startsWith('/programmatic/')) stagedCorpus.push({route:publicRoute,cluster:u.cluster||publicRoute,html,word_count:wordCountFromHtml(html),shingles:shingleSetFromHtml(html)});
  recordAdmission(u, publicRoute);
}

adm.updated = new Date().toISOString();
state.updated = new Date().toISOString();
state.last_release_run = { created, repaired, skipped:skipped.length, quality_rejected:qualityRejected, at:new Date().toISOString() };
fs.writeFileSync(path.join(ROOT,'data/content/page_admission_registry.json'),JSON.stringify(adm,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'data/content/content_state_registry.json'),JSON.stringify(state,null,2)+'\n');

const today = new Date().toISOString().slice(0,10);
const ledgerPath = path.join(ROOT,'data/releases/daily_velocity_ledger.json');
let ledger={date:today,new_pages_used:0,repairs_used:0,runs:[]};
try { const prior=JSON.parse(fs.readFileSync(ledgerPath,'utf8')); if(prior.date===today) ledger=prior; } catch {}
ledger.new_pages_used=Number(ledger.new_pages_used||0)+created;
ledger.repairs_used=Number(ledger.repairs_used||0)+repaired;
ledger.runs=[...(ledger.runs||[]),{at:new Date().toISOString(),created,repairs:repaired,skipped:skipped.length,quality_rejected:qualityRejected}];
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');

fs.mkdirSync(path.join(ROOT,'artifacts/release'),{recursive:true});
const status=(created||repaired)?'COMPLETED_WITH_CHANGES':skipped.length?'COMPLETED_ALL_SKIPPED':'COMPLETED_NO_CHANGES';
fs.writeFileSync(path.join(ROOT,'artifacts/release/apply_release_plan_summary.json'),JSON.stringify({status,plan_generated_at:plan.generated_at||null,created,repaired,quality_rejected:qualityRejected,skipped:skipped.length,total:(plan.units||[]).length,skipped_records:skipped,at:new Date().toISOString()},null,2)+'\n');
console.log(`Applied quality-gated release plan: ${created} created, ${repaired} pages substantively repaired, ${qualityRejected} quality-rejected, ${skipped.length} total skipped.`);
