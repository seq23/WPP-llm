'use strict';

// Recording belongs on the step where a visitor fills a form or buys. A link
// to the site's contact page or a mailto CTA is not a form on this page.
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

// Accepted pages still carry the old all-page loader in their frozen HTML.
// Reconcile that shell at assembly, without mutating frozen editorial content.
function stripUnscopedClarity(html, base) {
  return formOrBuy(html, base) ? html : html.replace(/<script\b[^>]*\bdata-clarity-loader\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
}

module.exports = { formOrBuy, stripUnscopedClarity };
