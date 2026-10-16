#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * No published page may carry an email address Cloudflare will rewrite into a
 * /cdn-cgi/l/email-protection link.
 *
 * WHY. 16 Oct 2026: a portfolio link audit found the footer of every page on
 * virtualagency-os.com linking to /cdn-cgi/l/email-protection, which answers 404
 * to any client without JavaScript (crawlers, AI fetchers, link checkers). The
 * zone's Email Obfuscation rewrites any address in served HTML unless it sits
 * inside <!--email_off--> ... <!--/email_off-->. scripts/assemble_pages_output.js
 * now wraps every published HTML page in those markers.
 *
 * HOW. This runs the real assembler into a temp dir (the exact tree Pages
 * publishes) and scans every HTML file in it. It fails when:
 *   - any page contains a /cdn-cgi/l/email-protection reference (a page saved
 *     from the live site, already obfuscated);
 *   - any page has an email address outside an email_off region, or unbalanced
 *     markers;
 *   - zero HTML pages were assembled (a scan of nothing proves nothing).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const CF = /\/cdn-cgi\/l\/email-protection/i;
const OFF = '<!--email_off-->';
const OFF_END = '<!--/email_off-->';

function outsideEmailOff(html) {
  const opens = html.split(OFF).length - 1;
  const closes = html.split(OFF_END).length - 1;
  if (opens !== closes) return { unbalanced: true, emails: [] };
  const stripped = html.replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, '');
  // Asset filenames like logo@2x.png are not addresses.
  const emails = (stripped.match(EMAIL) || []).filter((e) => !/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(e));
  return { unbalanced: false, emails };
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.name.endsWith('.html')) out.push(abs);
  }
  return out;
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'email-off-'));
try {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'assemble_pages_output.js')], {
    cwd: ROOT, env: { ...process.env, PAGES_ASSEMBLE_OUT: out }, encoding: 'utf8',
  });
  if (run.status !== 0) {
    console.error('email-obfuscation-safe: assembler failed:\n' + (run.stderr || run.stdout).slice(-2000));
    process.exit(1);
  }
  const pages = walk(out, []);
  if (pages.length === 0) {
    console.error('email-obfuscation-safe: zero HTML pages assembled; refusing to report success.');
    process.exit(1);
  }
  const bad = [];
  let protectedPages = 0;
  for (const abs of pages) {
    const rel = path.relative(out, abs);
    const html = fs.readFileSync(abs, 'utf8');
    if (CF.test(html)) { bad.push(`${rel}: contains /cdn-cgi/l/email-protection`); continue; }
    const r = outsideEmailOff(html);
    if (r.unbalanced) { bad.push(`${rel}: unbalanced email_off markers`); continue; }
    if (r.emails.length) { bad.push(`${rel}: email outside email_off: ${[...new Set(r.emails)].slice(0, 3).join(', ')}`); continue; }
    if (EMAIL.test(html)) protectedPages += 1;
    EMAIL.lastIndex = 0;
  }
  if (bad.length) {
    console.error(`email-obfuscation-safe: ${bad.length} of ${pages.length} published page(s) would be obfuscated by Cloudflare:`);
    console.error(bad.slice(0, 20).map((b) => '  ' + b).join('\n'));
    process.exit(1);
  }
  if (protectedPages === 0) {
    console.error('email-obfuscation-safe: no published page carries an email address; the scan governs nothing. Check the assembler output.');
    process.exit(1);
  }
  console.log(`email-obfuscation-safe OK: ${pages.length} published HTML pages, ${protectedPages} with addresses all inside email_off, none with /cdn-cgi/l/email-protection.`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
