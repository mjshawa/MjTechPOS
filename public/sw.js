// MjTech POS service worker.
// Goal: once the app has been opened ONCE online, every later launch works, even with no / bad signal.
// - install: pre-cache the app shell (index.html + the hashed JS/CSS it references + icons)
// - navigations: network first (updates arrive), but with a short timeout, falling back to the cached shell
// - assets: cache first, refreshed in the background
const VERSION = 'v3';
const SHELL = 'mjtech-shell-' + VERSION;
const RUNTIME = 'mjtech-runtime-' + VERSION;
const BASE = new URL('./', self.location).href;          // folder the app is served from (works on sub-paths too)
const INDEX = BASE + 'index.html';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Fetch index.html fresh (bypass HTTP cache) and read which assets it needs.
    const res = await fetch(INDEX, { cache: 'reload', redirect: 'follow' }).catch(() => fetch(BASE, { cache: 'reload' }));
    const html = await res.clone().text();
    await cache.put(INDEX, new Response(await res.clone().blob(), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    const urls = new Set(['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']);
    for (const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const u = m[1];
      if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) continue;
      urls.add(u.replace(/^\.\//, '').replace(/^\//, ''));
    }
    await Promise.all([...urls].map(async u => {
      try {
        const r = await fetch(new URL(u, BASE).href, { cache: 'reload', redirect: 'follow' });
        if (r.ok && !r.redirected) await cache.put(new URL(u, BASE).href, r);
      } catch (_) { /* a missed icon must not block install */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL, RUNTIME];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.disable().catch(() => {});
    await self.clients.claim();
  })());
});

const shellResponse = async () =>
  (await caches.match(INDEX)) || (await caches.match(BASE)) || new Response('Offline. Open the app once with internet, then it works offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // Supabase etc. go straight to the network

  // Page loads (launching the installed app, refresh, any deep link)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 4000);   // weak signal: do not hang, use the saved copy
        const res = await fetch(INDEX, { signal: ctl.signal, cache: 'no-cache', redirect: 'follow' });
        clearTimeout(timer);
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(INDEX, copy));
          return res;
        }
        return await shellResponse();
      } catch (_) {
        return await shellResponse();
      }
    })());
    return;
  }

  // Assets: cache first, update in the background
  event.respondWith((async () => {
    const hit = await caches.match(req);
    const refresh = fetch(req, { redirect: 'follow' }).then(res => {
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); }
      return res;
    });
    if (hit) { refresh.catch(() => {}); return hit; }
    try { return await refresh; } catch (_) { return Response.error(); }
  })());
});
