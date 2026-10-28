'use strict';

// Recording belongs on the step where a visitor fills a form or buys. A link
// to the site's contact page or a mailto CTA is not a form on this page.
//
// The homepage is always in scope, whatever it links to. The 28 Oct 2026 scope
// restriction read "the step where a visitor converts" and nothing else, so
// assembly stripped the loader from index.html: the live homepage went out as
// the committed homepage minus exactly that one line, and Clarity recorded
// nothing on the one page Search Readiness e6 and i8 actually read ("the
// homepage, or a sampled page where visitors fill a form or buy, loads
// Microsoft Clarity"). It is also the page every entry path crosses, so it is
// where session data is worth most. Frozen editorial pages stay out.
const ALWAYS_RECORDING = new Set(['index.html']);

function formOrBuy(html, base = 'https://virtualagency-os.com/') {
  const visible = String(html).replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  if (/<form(?:\s|>)/i.test(visible)) return true;
  for (const tag of visible.matchAll(/<a\b[^>]*>/gi)) {
    const href = tag[0].match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!href) continue;
    let url;
    try { url = new URL((href[1] ?? href[2] ?? href[3]).replace(/&amp;/gi, '&'), base); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    if (/(^|\.)(gumroad\.com|stripe\.com|paypal\.com|lemonsqueezy\.com|square\.link|checkout\.shopify\.com)$/.test(url.hostname)
      || /\/(checkout|cart|buy|order|book(ing)?)(\/|$)/i.test(url.pathname)) return true;
  }
  return false;
}

// `rel` is the page's repo-relative path ('index.html', 'answers/x.html'). It is
// optional so a bare fixture still behaves as before, but every caller walking
// real files passes it, or the homepage loses its recording again.
function inScope(html, rel = '', base = 'https://virtualagency-os.com/') {
  return ALWAYS_RECORDING.has(String(rel).replace(/^\.?\//, '')) || formOrBuy(html, base);
}

// Accepted pages still carry the old all-page loader in their frozen HTML.
// Reconcile that shell at assembly, without mutating frozen editorial content.
function stripUnscopedClarity(html, base, rel) {
  return inScope(html, rel, base) ? html : html.replace(/<script\b[^>]*\bdata-clarity-loader\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
}

module.exports = { ALWAYS_RECORDING, formOrBuy, inScope, stripUnscopedClarity };
