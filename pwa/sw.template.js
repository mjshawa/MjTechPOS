/*
 * MjTech POS service worker.
 * Source template: pwa/sw.template.js. The build (vite.config.ts) fills in the two placeholders below and
 * writes the result to dist/sw.js. Do not edit dist/sw.js by hand.
 *
 * Strategy (the app is offline-first, so the shell must always open without internet):
 *  - Every file of the build is precached on install, including the lazy Excel chunk.
 *  - Page loads are answered from the cache, so the register opens instantly even with no signal.
 *  - Only same-origin GET requests are touched. Supabase and everything else go straight to the network.
 *  - A new version waits until the person taps "Update" (see src/pwa), so the app never reloads mid-sale.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE_URLS__;
const CACHE_PREFIX = 'mjtech-pos-';
const CACHE = CACHE_PREFIX + BUILD_ID;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the browser's HTTP cache so a stale copy can never be stored as the new version.
    await Promise.all(PRECACHE.map(async url => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error('Precache failed: ' + url + ' (' + res.status + ')');
      await cache.put(url, res);
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase etc.: never intercepted

  // Opening or refreshing the app: serve the cached shell (this is a single-page app with no routes).
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { cacheName: CACHE }).then(hit => hit || fetch(req))
    );
    return;
  }

  // Everything else: cache first, then network (and remember what the network returned).
  event.respondWith(
    caches.match(req, { cacheName: CACHE }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
