/**
 * 301s for consolidated pages under the prefixes in /_routes.json.
 *
 * Cloudflare Pages serves at most 2,000 static rules from _redirects, and the
 * consolidation of 2 Nov 2026 (data/seo/prune_ledger.json) alone needs ~2,600.
 * scripts/update_redirects_clean_to_html.js writes every rule whose source sits
 * under these prefixes into redirect_map.json (chains already resolved to the
 * final page) and leaves the rest in _redirects; Pages does not apply
 * _redirects to a request a Function handles, so the map holds all of them.
 */
import map from './redirect_map.json';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  let p = url.pathname;
  if (p.length > 1) p = p.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/\/+$/, '');
  const to = map[p];
  if (to) {
    const dest = new URL(to, url.origin);
    return Response.redirect(dest.toString(), 301);
  }
  return next();
}
