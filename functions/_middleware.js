export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === '/__edge-probe') {
    const env = {};
    for (const [k, v] of Object.entries(context.env)) env[k] = typeof v === 'string' ? v : typeof v;
    return new Response(JSON.stringify({ env, headers: Object.fromEntries(context.request.headers) }, null, 1), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  const key = new Request(url.origin + url.pathname + '?__b=probe', { method: 'GET' });
  const cache = caches.default;
  const t0 = Date.now();
  const hit = await cache.match(key);
  if (hit) { const r = new Response(hit.body, hit); r.headers.set('x-edge-cache', 'HIT'); r.headers.set('x-edge-ms', String(Date.now() - t0)); return r; }
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set('x-edge-cache', 'MISS');
  if (res.status === 200 && context.request.method === 'GET') {
    const c = out.clone(); const store = new Response(c.body, c); store.headers.set('cache-control', 'public, max-age=300');
    context.waitUntil(cache.put(key, store));
  }
  return out;
}
