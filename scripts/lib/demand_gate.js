/**
 * The single place that answers "is there evidence anyone searches for this?"
 *
 * Before this existed, `generate_query_universe.js` wrote a field called
 * `demand_estimate` and computed it as `Math.max(10, priority * 3)`, where
 * `priority` is an integer a human typed into a seed list. Fan-out records got
 * a flat literal 240. Across 10,000 query records the field held five distinct
 * values between 240 and 288. Nothing in it was measured. `build_release_plan.js`
 * then sorted candidates by that number and published the top 50 each day, so
 * the corpus grew at a fixed rate regardless of whether a single person had ever
 * typed any of those strings into a search box.
 *
 * `virtual event production` has a measured Semrush volume of 2,900/mo. The
 * repo had assigned it a demand_estimate of 288. The number was not a worse
 * measurement; it was not a measurement.
 *
 * Every caller that decides whether a page may exist imports `hasDemand` from
 * here. There is deliberately no second copy of this logic: the generator, the
 * release planner, and the validator must agree by construction, because a
 * generator and a sitemap that each keep their own idea of what counts are how
 * a corpus ends up listing URLs that nothing will ever render.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Two sources, unioned, both already evidence-tiered.
 *
 * `query_atlas.json` was here before this module and holds 522 queries with
 * real GSC measurement, an `evidence_tier`, and a `policy` string that already
 * says the right thing: "Pages may only be generated against evidence_tier T1-T3.
 * T4 synthetic permutations are a hypothesis reserve ... and never publish on
 * their own." Nothing read it. This module is the thing that finally enforces
 * the policy the file already declared.
 *
 * `measured_demand.json` adds the portfolio Semrush packet, which carries
 * keyword difficulty and competitor-strength readings the GSC pull cannot, and
 * is the only place an owner-approved seed may be written.
 */
const ATLAS_FILE = path.join(ROOT, 'data/authority_scale/query_atlas.json');
const DEMAND_FILE = path.join(ROOT, 'data/demand/measured_demand.json');
const ADMISSIBLE_TIERS = new Set(['T1', 'T2a', 'T2b', 'T3']);

/**
 * Demand arrives in TWO units and they are not interchangeable.
 *
 *   search_volume     monthly searches the whole market runs, from a keyword tool
 *   impressions_90d   times THIS domain was shown, over a 90-day Search Console window
 *
 * Both were once written to one field named `volume`, and every consumer -
 * including this gate - read that field as though it meant the first thing. It
 * meant the second thing on 521 of 522 atlas rows. `virtual event production
 * company` has 1,300 monthly searches and 8 of this site's own impressions; the
 * gate was ranking it on the 8.
 *
 * Both units are real evidence that a query exists, so both still open the gate.
 * Neither may be reported as the other, so callers get the basis alongside the
 * number and there is no function here that returns "the demand" as one figure.
 */
function demandUnits(r) {
  const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const search_volume = num(r.search_volume);
  const impressions_90d = num(r.impressions_90d);
  return {
    search_volume,
    impressions_90d,
    demand_basis: search_volume !== null ? 'search_volume'
      : impressions_90d !== null ? 'impressions_90d'
      : 'none'
  };
}

/** Same normalization on both sides of every comparison, so a trailing space
 *  or a capital letter can never be the reason a real query is refused. */
function normalize(query) {
  return String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

let cache = null;

function admit(byQuery, r, origin) {
  const key = normalize(r.query_normalized || r.query);
  if (!key) return;
  // A record carrying the removed `volume` field is a record whose unit nobody
  // can name. Refuse it loudly rather than guess which of the two it holds.
  if (Object.prototype.hasOwnProperty.call(r, 'volume')) {
    throw new Error(
      `demand_gate: record "${r.query}" (${origin}) carries the removed ambiguous \`volume\` field. ` +
      `That name held monthly search volume on keyword-tool rows and this domain's own 90-day ` +
      `impressions on GSC rows. Write search_volume or impressions_90d instead.`
    );
  }
  const units = demandUnits(r);
  // An owner-approved seed is allowed to carry no measurement in either unit -
  // that is the point of it - but it must say who approved it, or it is
  // indistinguishable from a row someone appended to get past this gate.
  if (r.source_type === 'owner_approved_seed') {
    if (!r.approved_by) throw new Error(`demand_gate: owner_approved_seed "${r.query}" has no approved_by. Refusing to treat it as evidence.`);
  } else {
    // Either unit is evidence that the query is real. Neither is a substitute for
    // the other, which is why the basis travels with the record from here on.
    const value = units.demand_basis === 'search_volume' ? units.search_volume
      : units.demand_basis === 'impressions_90d' ? units.impressions_90d
      : null;
    if (!(value > 0)) {
      throw new Error(
        `demand_gate: record "${r.query}" (${origin}) claims a measured source but carries neither ` +
        `a keyword-tool search_volume nor a measured impressions_90d. Refusing to treat it as evidence.`
      );
    }
    if (r.evidence_tier && !ADMISSIBLE_TIERS.has(r.evidence_tier)) return; // T4 is a hypothesis reserve, not a publishing queue.
  }
  // First writer wins, and the atlas is loaded second, so a Semrush record with
  // difficulty data is not overwritten by the bare GSC row for the same string.
  if (!byQuery.has(key)) byQuery.set(key, { ...r, ...units, demand_source_file: origin });
}

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DEMAND_FILE) && !fs.existsSync(ATLAS_FILE)) {
    throw new Error(
      `demand_gate: neither ${path.relative(ROOT, DEMAND_FILE)} nor ${path.relative(ROOT, ATLAS_FILE)} ` +
      `exists. Page generation is refused rather than run against no evidence.`
    );
  }
  const byQuery = new Map();
  let doc = { provenance: {} };
  if (fs.existsSync(DEMAND_FILE)) {
    doc = JSON.parse(fs.readFileSync(DEMAND_FILE, 'utf8'));
    for (const r of doc.records || []) admit(byQuery, r, 'data/demand/measured_demand.json');
  }
  if (fs.existsSync(ATLAS_FILE)) {
    const atlas = JSON.parse(fs.readFileSync(ATLAS_FILE, 'utf8'));
    for (const r of atlas.queries || []) admit(byQuery, r, 'data/authority_scale/query_atlas.json');
  }
  cache = { doc, byQuery, records: [...byQuery.values()] };
  return cache;
}

/** The demand record backing a query, or null. Null means: do not make a page. */
function demandRecord(query) {
  return load().byQuery.get(normalize(query)) || null;
}

/** The gate. Callers that create pages must pass through exactly this. */
function hasDemand(query) {
  return demandRecord(query) !== null;
}

/** Monthly searches the MARKET runs for this query, from a keyword tool. Null
 *  when no keyword tool has measured it - including when the only evidence is
 *  this domain's own impressions, which are a different quantity and are never
 *  substituted here. Never returns a fabricated number: a caller that wants to
 *  sort by demand must decide for itself what to do with null rather than
 *  receive a placeholder it will mistake for market volume. */
function marketSearchVolume(query) {
  const r = demandRecord(query);
  return r ? demandUnits(r).search_volume : null;
}

/** The demand evidence behind a query, with its unit attached:
 *  `{ search_volume, impressions_90d, demand_basis }`, or null when the query has
 *  no record. Callers that need one number must read `demand_basis` to know what
 *  the number counts; there is deliberately no accessor that hides that. */
function demandSignal(query) {
  const r = demandRecord(query);
  return r ? demandUnits(r) : null;
}

function allRecords() {
  return load().records.slice();
}

function provenance() {
  return load().doc.provenance;
}

module.exports = { hasDemand, demandRecord, marketSearchVolume, demandSignal, demandUnits, allRecords, provenance, normalize, DEMAND_FILE };
