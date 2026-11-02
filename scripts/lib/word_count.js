'use strict';
/**
 * One body-word counter, shared by the substance gate
 * (scripts/citation_intelligence/content_quality.js) and the consolidation
 * ledger (scripts/build_measured_targets.js). Before this file the two scripts
 * counted words by different rules - the ledger isolated <main>/<body> and the
 * substance gate counted the whole document - and disagreed by ~10-20 words on
 * pages near the 700-word floor, so a page could be thin on one count and clean
 * on the other (thin-ledger re-read, 2 Nov 2026). The substance gate's rule
 * wins: it is the one already driving real repairs (the one unit that reached
 * the lane preflighted to 1,147 words under this count), so the ledger now
 * matches it rather than the other way around.
 */

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function visibleText(html) {
  return decodeEntities(String(html || '')
    // Fan-out is a shared discovery/navigation surface added after admission.
    // It must not change a page's own substance count.
    .replace(/<section\b[^>]*data-fanout=["']true["'][^>]*>[\s\S]*?<\/section>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function wordCount(html) {
  const text = visibleText(html);
  return text ? text.split(' ').length : 0;
}

module.exports = { visibleText, wordCount };
