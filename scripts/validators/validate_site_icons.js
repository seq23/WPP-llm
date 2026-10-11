#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Icons and the social card exist at the sizes the pages declare.
 * favicon.ico returned 404 on 11 Oct 2026; og:image was absent. Built by
 * scripts/build_site_icons.py, declared in data/seo/site_head.json.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadConfig } = require('../lib/site_head.js');

const errors = [];
const abs = (p) => path.join(ROOT, p.replace(/^\//, ''));
function pngSize(p) {
  const b = fs.readFileSync(p);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
let cfg;
try { cfg = loadConfig(); } catch (e) { console.error(`site icons FAILED: ${e.message}`); process.exit(1); }
const icons = cfg.icons || {};
const checked = [];
const need = (p, what) => { if (!p || !fs.existsSync(abs(p))) { errors.push(`${what} missing: ${p}`); return false; } checked.push(p); return true; };

if (need(icons.favicon, 'favicon')) {
  const b = fs.readFileSync(abs(icons.favicon));
  const n = b.length >= 6 ? b.readUInt16LE(4) : 0;
  if (b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1 || n < 1) errors.push(`${icons.favicon} is not an ICO file`);
  const sizes = []; for (let i = 0; i < n; i++) sizes.push(b[6 + i * 16] || 256);
  if (!sizes.includes(32)) errors.push(`${icons.favicon} has no 32px image (has ${sizes.join(',')})`);
}
if (need(icons.apple_touch_icon, 'apple-touch-icon')) {
  const s = pngSize(abs(icons.apple_touch_icon));
  if (!s || s.w !== 180 || s.h !== 180) errors.push(`${icons.apple_touch_icon} must be a 180x180 PNG (is ${s ? `${s.w}x${s.h}` : 'not PNG'})`);
}
if (need(icons.manifest, 'web manifest')) {
  let m; try { m = JSON.parse(fs.readFileSync(abs(icons.manifest), 'utf8')); } catch (e) { errors.push(`${icons.manifest} is not JSON: ${e.message}`); }
  if (m) {
    if (!m.name) errors.push(`${icons.manifest} has no name`);
    if (!(m.icons || []).length) errors.push(`${icons.manifest} declares zero icons`);
    for (const i of m.icons || []) {
      if (!need(i.src, 'manifest icon')) continue;
      const s = pngSize(abs(i.src)); const [w, h] = String(i.sizes).split('x').map(Number);
      if (!s || s.w !== w || s.h !== h) errors.push(`${i.src} declared ${i.sizes} but is ${s ? `${s.w}x${s.h}` : 'not PNG'}`);
    }
  }
}
const og = cfg.og_image || {};
if (need(og.path, 'og:image')) {
  const s = pngSize(abs(og.path));
  if (!s || s.w !== og.width || s.h !== og.height || og.width !== 1200 || og.height !== 630) errors.push(`${og.path} must be 1200x630 and match config (is ${s ? `${s.w}x${s.h}` : 'not PNG'}, config ${og.width}x${og.height})`);
}
if (!checked.length) errors.push('zero icon files checked');
if (errors.length) { console.error('site icons FAILED:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log(`site icons OK: ${checked.length} file(s) present at declared sizes.`);
