#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Zero-cost live query observation ingestion.
 *
 * Reads the manual citation log CSV (produced by generate_zero_cost_query_report.js
 * and filled in by hand from real Google/Perplexity/ChatGPT/Gemini checks) and
 * writes structured, truthful evidence into:
 *  - data/signals/query_surface_observations.json (own-domain surfaced + competitors seen)
 *  - data/signals/citation_observation_ledger.json (true external citation events only)
 *
 * This is the repo's zero_paid_provider_default / browser_automation_vendor-forbidden
 * path for live query observation and competitor capture: a human records what they
 * actually saw, this script normalizes it. No row is fabricated or inferred.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const DOMAIN = 'virtualagency-os.com';
const CSV_PATH = path.join(ROOT, 'logs/query-testing/manual-citation-log.csv');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fallback; }
}
function writeJson(p, data) {
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(data, null, 2) + '\n');
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // simple CSV split honoring quoted fields (no embedded commas expected beyond query text)
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === ',' && !inQuotes) { cells.push(cur); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur);
    const row = {};
    header.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log(`No manual observation log at ${path.relative(ROOT, CSV_PATH)} — nothing to ingest (this is not a failure; the operator/VA has not filled one in yet).`);
    return;
  }
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  const filled = rows.filter((r) => r.date && r.surface && r.query_id);
  if (!filled.length) {
    console.log('Manual observation log present but no completed rows found. Nothing ingested.');
    return;
  }

  const surfaceLedger = readJson('data/signals/query_surface_observations.json', { records: [] });
  const citationLedger = readJson('data/signals/citation_observation_ledger.json', { records: [] });
  const existingSurfaceKeys = new Set(surfaceLedger.records.map((r) => `${r.query_id}::${r.surface}::${r.observed_at}`));
  const existingCitationKeys = new Set(citationLedger.records.map((r) => `${r.query}::${r.engine}::${r.observed_at}`));

  let addedSurface = 0;
  let addedCitation = 0;
  for (const r of filled) {
    const observedAt = new Date(r.date).toISOString();
    const key = `${r.query_id}::${r.surface}::${observedAt}`;
    if (!existingSurfaceKeys.has(key)) {
      const ownSurfaced = /^(y|yes|true)$/i.test(r.own_url_surfaced || '');
      const competitors = (r.competitor_domains_observed || '')
        .split(/[;|]/)
        .map((d) => d.trim())
        .filter(Boolean)
        .map((domain) => ({ domain, observed_at: observedAt }));
      surfaceLedger.records.push({
        observed_at: observedAt,
        surface: r.surface,
        query_id: r.query_id,
        query: r.query,
        target_page: r.target_page || null,
        own_url_surfaced: ownSurfaced,
        own_url: ownSurfaced ? (r.observed_citation_url || `https://${DOMAIN}${r.target_page || ''}`) : null,
        observed_rank_or_position: r.observed_rank_or_position || null,
        competitors_observed: competitors,
        notes: r.notes || ''
      });
      existingSurfaceKeys.add(key);
      addedSurface++;
    }

    const citedUrl = r.observed_citation_url || '';
    if (citedUrl && citedUrl.includes(DOMAIN)) {
      const ckey = `${r.query}::${r.surface}::${observedAt}`;
      if (!existingCitationKeys.has(ckey)) {
        citationLedger.records.push({
          observed_at: observedAt,
          engine: r.surface,
          query: r.query,
          cited_url: citedUrl,
          evidence: `manual_check:${r.query_id}`
        });
        existingCitationKeys.add(ckey);
        addedCitation++;
      }
    }
  }

  surfaceLedger.updated = new Date().toISOString();
  citationLedger.updated = new Date().toISOString();
  writeJson('data/signals/query_surface_observations.json', surfaceLedger);
  writeJson('data/signals/citation_observation_ledger.json', citationLedger);

  const costLedger = readJson('data/admin/cost_ledger.json', null);
  if (costLedger) {
    const today = new Date().toISOString().slice(0, 10);
    if (costLedger.today.date !== today) { costLedger.today = { date: today, gsc_requests: 0, gemini_requests: 0, manual_ingest_runs: 0 }; }
    costLedger.today.manual_ingest_runs += 1;
    costLedger.updated_at = new Date().toISOString();
    writeJson('data/admin/cost_ledger.json', costLedger);
  }

  console.log(`Ingested manual observations: ${addedSurface} surface record(s), ${addedCitation} new citation event(s).`);
}

main();
