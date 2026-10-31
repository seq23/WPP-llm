#!/usr/bin/env node
// entity_backlink_watch: does every sameAs profile still exist, and does it point back?
//
// Weekly (entity-backlink-watch.yml, cron + workflow_dispatch). For every URL in
// data/entity/entity.json (organization.sameAs, founder.sameAs, profiles_pending):
//   - FETCH with a browser user agent, following redirects, two attempts.
//       2xx                       -> resolves
//       404 / 410 / DNS failure   -> dead (both attempts)
//       anything else (999, 403, 429, 5xx, timeout) -> unverifiable, never removed
//   - LINK-BACK, where the platform renders server-side: the body must contain one
//     of the entity's link_back_hosts. Platforms that render client-side or wall
//     logged-out readers (LinkedIn, Instagram, Gumroad, Google Maps, Facebook
//     profiles) record the named state `unverifiable`, never a pass.
//   - SELF-HEAL (--apply):
//       dead sameAs URL              -> removed from sameAs, logged under `removed`
//       pending profile now resolving -> promoted into sameAs
//     The workflow then runs `npm run entity:converge` so every page follows, and
//     commits only through the repo's push gate.
//   - Missing link-back -> a NAMED STOP naming the exact profile field the owner
//     edits (her login). Named stops are notes: they print to the job summary and
//     the report and do not turn the run red.
// Writes artifacts/diagnostics/entity_backlink_watch.json.
//
// RULE 0: zero URLs to check exits 1 - a watch that looked at nothing has not passed.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENTITY_PATH = path.join(ROOT, 'data/entity/entity.json');
const REPORT_PATH = path.join(ROOT, 'artifacts/diagnostics/entity_backlink_watch.json');
const APPLY = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CLIENT_RENDERED = /(^|\.)(linkedin\.com|instagram\.com|gumroad\.com|maps\.google\.com|google\.com|facebook\.com|x\.com|twitter\.com|tiktok\.com)$/;

const entity = JSON.parse(fs.readFileSync(ENTITY_PATH, 'utf8'));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** The exact field the owner edits so a profile points back. */
function linkBackField(url, hosts) {
  const h = hostOf(url);
  const target = `https://${hosts[0]}/`;
  const qid = (url.match(/wikidata\.org\/wiki\/(Q\d+)/) || [])[1];
  if (qid) return `Wikidata ${qid}: add statement "official website" (P856) = ${target}`;
  if (/youtube\.com$/.test(h)) return `YouTube channel > Customise channel > Basic info > Links: add ${target}`;
  if (/pinterest\.com$/.test(h)) return `Pinterest profile > Edit profile > Website: ${target}`;
  if (/github\.com$/.test(h)) return `GitHub profile/org settings > URL: ${target}`;
  return `${url}: add a visible link to ${target} (footer or about page)`;
}

async function fetchOnce(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(20000) });
    const body = res.ok ? await res.text() : '';
    return { status: res.status, final_url: res.url, body };
  } catch (e) {
    const code = e?.cause?.code || e?.name || 'ERROR';
    return { status: 0, error: code, body: '' };
  }
}
const isDeadSignal = (r) => r.status === 404 || r.status === 410 || ['ENOTFOUND'].includes(r.error);

async function check(url, hosts) {
  let r = await fetchOnce(url);
  if (!(r.status >= 200 && r.status < 300)) {
    await new Promise((s) => setTimeout(s, 3000));
    const r2 = await fetchOnce(url);
    if (r2.status >= 200 && r2.status < 300) r = r2;
    else if (!(isDeadSignal(r) && isDeadSignal(r2))) r = { ...r2, transient: true };
    else r = r2;
  }
  const out = { url, http_status: r.status, error: r.error || null, final_url: r.final_url || null };
  if (r.status >= 200 && r.status < 300) {
    out.resolves = 'yes';
    if (CLIENT_RENDERED.test(hostOf(r.final_url || url))) out.link_back = 'unverifiable';
    else out.link_back = hosts.some((h) => r.body.includes(h)) ? 'yes' : 'missing';
  } else if (r.transient) {
    out.resolves = 'unverifiable';
    out.link_back = 'unverifiable';
  } else {
    out.resolves = 'dead';
    out.link_back = 'n/a';
  }
  return out;
}

// The organization, the founder, and every site the repo publishes. A site's own
// sameAs (its public source repository) is watched on the same terms as the rest, so
// Search Readiness k1 cannot quietly rot: a dead profile is dropped and logged here
// too, instead of sitting in entity.json unchecked.
const groups = [['organization', entity.organization], ['founder', entity.founder],
  ...Object.entries(entity.sites || {}).map(([host, node]) => [`site:${host}`, node])];
const total = groups.reduce((n, [, g]) => n + (g?.sameAs?.length || 0), 0) + (entity.profiles_pending || []).length;
if (!total) { console.error('[entity-backlink-watch] FAILED: entity.json lists no sameAs or pending profile to check'); process.exit(1); }

const results = [];
const namedStops = [];
const changes = [];
const today = new Date().toISOString().slice(0, 10);

for (const [label, g] of groups) {
  const hosts = g.link_back_hosts || [];
  for (const url of [...(g.sameAs || [])]) {
    const r = { group: label, kind: 'sameAs', ...(await check(url, hosts)) };
    results.push(r);
    if (r.resolves === 'dead') {
      changes.push(`removed dead ${label}.sameAs ${url} (HTTP ${r.http_status || r.error})`);
      if (APPLY) {
        g.sameAs = g.sameAs.filter((u) => u !== url);
        (entity.removed ||= []).push({ url, group: label, removed_on: today, reason: `dead: HTTP ${r.http_status || r.error} on two attempts` });
      }
    } else if (r.link_back === 'missing') {
      namedStops.push({ profile: url, field: linkBackField(url, hosts), why: `does not link to ${hosts.join(' or ')}` });
    }
  }
}
for (const p of [...(entity.profiles_pending || [])]) {
  const g = entity[p.group];
  if (!g) { results.push({ group: p.group, kind: 'pending', url: p.url, resolves: 'invalid-group' }); continue; }
  const r = { group: p.group, kind: 'pending', ...(await check(p.url, g.link_back_hosts || [])) };
  results.push(r);
  if (r.resolves === 'yes') {
    changes.push(`promoted pending ${p.group} profile ${p.url} into sameAs`);
    if (APPLY) {
      g.sameAs = [...(g.sameAs || []), p.url];
      entity.profiles_pending = entity.profiles_pending.filter((x) => x.url !== p.url);
    }
  }
}

if (APPLY && changes.length) fs.writeFileSync(ENTITY_PATH, JSON.stringify(entity, null, 2) + '\n');

const counts = results.reduce((c, r) => { c[`resolves_${r.resolves}`] = (c[`resolves_${r.resolves}`] || 0) + 1;
  if (r.link_back) c[`link_back_${r.link_back}`] = (c[`link_back_${r.link_back}`] || 0) + 1; return c; }, {});
const report = { checked_at: new Date().toISOString(), applied: APPLY, checked: results.length, counts, changes, named_stops: namedStops, results };
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

const lines = [`[entity-backlink-watch] checked ${results.length} profile(s): ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`];
for (const r of results) lines.push(`  ${r.group.padEnd(12)} ${r.kind.padEnd(7)} resolves=${r.resolves} link_back=${r.link_back} ${r.url}`);
lines.push(changes.length ? `SELF-HEAL${APPLY ? '' : ' (dry run)'}: ${changes.join('; ')}` : 'SELF-HEAL: nothing to change');
for (const s of namedStops) lines.push(`NAMED STOP (owner login): ${s.field} - ${s.profile} ${s.why}`);
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + lines.join('\n') + '\n```\n');
