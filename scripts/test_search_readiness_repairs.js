#!/usr/bin/env node
'use strict';

// Reproduce b10/e9 through the same assembler Pages deploys, including frozen
// pages. Fixtures also prove form/checkout recording survives the restriction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { formOrBuy, stripUnscopedClarity } = require('./lib/clarity_scope.js');
const { ROOT, walk, loadConfig } = require('./lib/site_head.js');
const { transform } = require('./apply_site_head.js');
const { TITLE_MIN, TITLE_MAX } = require('./lib/page_meta.js');

const loader = '<script data-clarity-loader>load("https://www.clarity.ms/tag/test")</script>';
for (const content of ['<form action="/send"><input name="name"></form>', '<a href="https://seller.gumroad.com/l/item">Buy</a>', '<a href="https://buy.stripe.com/test">Pay</a>', '<a href=/checkout>Checkout</a>']) {
  assert.equal(formOrBuy(content), true, content);
  assert.equal(stripUnscopedClarity(loader + content), loader + content, 'conversion recording was removed');
}
for (const content of ['<a href="/contact">Contact</a>', '<a href="mailto:test@example.invalid">Contact</a>', '<!-- <form> -->', '<script>const text="<form>"</script>', '<a href="https://gumroad.com.example.invalid/l/item">Other</a>', '<a href="/guide?next=/buy">Guide</a>']) {
  assert.equal(formOrBuy(content), false, content);
  assert.equal(stripUnscopedClarity(loader + content), content, 'article recording survived');
}

const cfg = loadConfig();
const titles = cfg.title_overrides || {};
assert.equal(Object.keys(titles).length, 4, 'the four b10 routes must be exercised');
const frozen = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/release/frozen_output_registry.json'))).pages;
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
const hashes = new Map(frozen.map((p) => [p.rendered_file, sha(p.rendered_file)]));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wpp-search-readiness-'));
const clarity = /clarity\.ms|clarity\.js|\/clarity[-.]|microsoft clarity/i;
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
try {
  execFileSync(process.execPath, ['scripts/assemble_pages_output.js'], { cwd: ROOT, env: { ...process.env, PAGES_ASSEMBLE_OUT: out }, stdio: 'pipe' });
  const pages = walk(out, out, []);
  assert.ok(pages.length >= 2000, 'assembled page walk reached too little of the site');
  let recording = 0, cleaned = 0;
  for (const rel of pages) {
    const html = fs.readFileSync(path.join(out, rel), 'utf8');
    if (clarity.test(html)) {
      assert.ok(formOrBuy(html), `${rel}: Clarity loads with no form or buy link`);
      recording++;
    } else if (fs.existsSync(path.join(ROOT, rel)) && clarity.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) cleaned++;
    assert.equal(stripUnscopedClarity(html), html, `${rel}: assembly is not idempotent`);
  }
  assert.ok(recording > 0, 'recording disappeared from every conversion page');
  assert.ok(cleaned >= 13, 'the regression never exercised the old all-page tags');
  for (const [rel, wanted] of Object.entries(titles)) {
    const html = fs.readFileSync(path.join(out, rel), 'utf8');
    const title = decode(html.match(/<title>([^<]*)<\/title>/i)[1]);
    assert.equal(title, wanted, `${rel}: editorial title lost in assembly`);
    assert.ok(title.includes('VirtualAgency OS'), `${rel}: title has no site name`);
    assert.ok(title.length >= TITLE_MIN && title.length <= TITLE_MAX, `${rel}: title outside the length band`);
    for (const key of ['og:title', 'twitter:title']) {
      const value = html.match(new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`))?.[1];
      assert.equal(decode(value || ''), wanted, `${rel}: ${key} is stale`);
    }
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(transform(rel, source, cfg), source, `${rel}: title is not stable on rebuild`);
  }
  for (const [file, before] of hashes) assert.equal(sha(file), before, `${file}: assembly mutated frozen content`);
  console.log(`Search Readiness repairs OK: 4 branded titles; ${pages.length} assembled pages checked; ${cleaned} old article tags removed; ${recording} conversion page(s) retain recording; ${hashes.size} frozen pages unchanged.`);
} finally { fs.rmSync(out, { recursive: true, force: true }); }
