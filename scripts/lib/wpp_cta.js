'use strict';
/**
 * One place that builds a West Peek Productions CTA URL.
 *
 * virtualagency-os deliberately routes conversion off-domain to
 * westpeekproductions.com -- that is the design, not a gap. But on 2026-08-27 only
 * 49 of 7,108 outbound CTA links carried any UTM parameters. The other 7,059 were
 * bare, so West Peek could see the traffic and not where it came from. Every one of
 * the five producers below hardcoded the bare URL independently, which is why the
 * handful of attributed links (hand-authored on the homepage) never spread.
 *
 * The attributed format already in use is preserved exactly:
 *   ?utm_source=virtualagency-os&utm_medium=referral&utm_campaign=<campaign>&utm_content=<slug>
 */

const WPP_ORIGIN = 'https://www.westpeekproductions.com';
const UTM_SOURCE = 'virtualagency-os';
const UTM_MEDIUM = 'referral';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * @param {object} opts
 * @param {string} [opts.path]      path on westpeekproductions.com, e.g. '/services/webinar-production'
 * @param {string} opts.campaign    where the CTA sits, e.g. 'cta-band', 'insight-footer'
 * @param {string} opts.content     what it is about -- usually the page slug or topic
 * @param {boolean} [opts.htmlEscape=true] escape & as &amp; for embedding in an href attribute
 */
function wppCtaUrl({ path = '/', campaign, content, htmlEscape = true } = {}) {
  if (!campaign) throw new Error('wppCtaUrl: campaign is required so a CTA can be told apart from every other CTA');
  if (!content) throw new Error('wppCtaUrl: content is required so the originating page is identifiable');
  const clean = String(path || '/').replace(/^(https?:\/\/[^/]+)?/, '') || '/';
  const params = [
    `utm_source=${UTM_SOURCE}`,
    `utm_medium=${UTM_MEDIUM}`,
    `utm_campaign=${slugify(campaign)}`,
    `utm_content=${slugify(content)}`,
  ].join(htmlEscape ? '&amp;' : '&');
  return `${WPP_ORIGIN}${clean}${clean.includes('?') ? (htmlEscape ? '&amp;' : '&') : '?'}${params}`;
}

/**
 * The campaign a CTA gets from the section of the site it sits in. Derived from the
 * page's own repo-relative path so every producer names a section the same way.
 * @param {string} relPath e.g. 'query-atlas/ai-content-operations.html'
 */
function campaignForPage(relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  if (rel === 'index.html') return 'home';
  const top = rel.split('/')[0];
  if (top === 'insights') return 'insight-page';
  if (top === 'programmatic') return 'programmatic-page';
  if (top === 'pillars') return 'pillar-page';
  if (top === 'case-studies') return 'case-study';
  if (top === 'answers') return 'answer-page';
  if (top === 'learn') return 'learn-page';
  if (top === 'topics') return 'topic-page';
  return 'site-page';
}

/**
 * The utm_content a CTA gets: the page's own path, so a lead is traceable to the
 * exact page that produced it rather than to the site as a whole.
 * @param {string} relPath e.g. 'query-atlas/ai-content-operations.html'
 */
function contentForPage(relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  return slugify(rel.replace(/(?:\/index)?\.html$/, '').replace(/\//g, '-')) || 'home';
}

/**
 * The attributed CTA URL a page at `relPath` should carry. Producers that emit a
 * CTA into a page they are writing should call this rather than deriving campaign
 * and content themselves -- that is how the bare origin kept coming back.
 */
function wppCtaUrlForPage(relPath, opts = {}) {
  return wppCtaUrl({ ...opts, campaign: campaignForPage(relPath), content: contentForPage(relPath) });
}

/** True for a westpeekproductions link that carries no attribution at all. */
function isUnattributedWppLink(href) {
  const s = String(href || '');
  if (!s.includes('westpeekproductions.com')) return false;
  return !/utm_source=/.test(s);
}

module.exports = {
  WPP_ORIGIN, UTM_SOURCE, UTM_MEDIUM,
  wppCtaUrl, wppCtaUrlForPage, campaignForPage, contentForPage,
  isUnattributedWppLink, slugify,
};
