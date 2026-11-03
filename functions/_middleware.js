import redirects from '../data/redirects/consolidation_map.json' with { type: 'json' };

// Generated from the prune ledger and legacy rules by
// scripts/update_redirects_clean_to_html.js. Targets are flattened at build time.
export function onRequest({ request, next }) {
  const url = new URL(request.url);
  const clean = url.pathname.replace(/\/+$/, '').replace(/\.html$/, '').replace(/\/index$/, '') || '/';
  const target = Object.hasOwn(redirects, clean) ? redirects[clean] : null;
  if (!target) return next();
  const destination = new URL(target, url.origin);
  if (!destination.search) destination.search = url.search;
  return Response.redirect(destination, 301);
}
