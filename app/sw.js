/* ═══════════════════════════════════════════════════════════════════════
   UBA app service worker.

   Two rules, and the second one is the important one:

   1. The SHELL is cache-first. index.html, the manifest and the icons come
      from cache so the app opens instantly and works with no signal.

   2. SUPABASE DATA IS NEVER CACHED (photos in public storage are the one
      exception — see the fetch handler). Not stale-while-revalidate, not anything —
      it goes straight to the network every time. Caching a league's
      rankings or a fight card would show somebody a result that is hours
      old with no way to tell, which is worse than showing nothing.
      (Offline reads are the PAGE's job, not this file's: q() in index.html
      keeps the last good answer in localStorage and hands it back only when
      fetch throws, under a pill that says how old it is. Here, a cached
      response would be served silently and to every caller alike.)

   Bump CACHE_VERSION on any change to the shell files, or people keep the
   old app until they clear site data.
   ═══════════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'uba-v232';
// Photos live in their OWN cache, which a version bump does not wipe: a new
// shell is 400KB, the photos are most of what a phone has downloaded.
const IMG_CACHE = 'uba-img-v1';
const IMG_MAX = 400;            // entries. Oldest go first.
// ...and a ceiling per photo, because a count is not a size: the originals are
// 2MB and `graphics` holds 15MB GIFs, and 400 of those is a phone's storage.
// A thumb is ~165KB. Anything heavier still loads, it just is not kept.
const IMG_MAX_BYTES = 600 * 1024;
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './game/vga-avatar.embed.js'   // the TRAIN boxer -- lazy on first open, then offline like the shell
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll rejects the whole install if any single file 404s, so each
      // one is added on its own and a miss is logged rather than fatal.
      .then(cache => Promise.all(SHELL.map(url =>
        // cache:'reload' skips the HTTP cache. Pages serves max-age=600, so a
        // plain add() inside ten minutes of the last deploy stored the OLD
        // index.html under the NEW version — and cache-first kept it there.
        cache.add(new Request(url, { cache: 'reload' }))
          .catch(err => console.warn('[uba sw] skipped', url, err))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION && k !== IMG_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// keys() comes back in insertion order, so the front of the list is the oldest.
function trimImages(cache) {
  return cache.keys().then(keys => {
    if (keys.length <= IMG_MAX) return;
    return Promise.all(keys.slice(0, keys.length - IMG_MAX).map(k => cache.delete(k)));
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // PHOTOS are the one thing on supabase.co that is not live data. A fighter's
  // face from last week is still their face, and offline a roster of blank
  // squares reads as broken. Cached copy first so it paints at once, refreshed
  // behind it so a replaced photo heals on the next open.
  //
  // The refetch is CORS on purpose. An <img> asks no-cors and gets an OPAQUE
  // response, which Chrome bills at ~7MB of quota EACH whatever its real size
  // — 400 of those evicts the whole origin. Storage sends ACAO:*, so asking
  // properly costs nothing and a photo is billed as the 40KB it is.
  if (url.hostname.endsWith('supabase.co') && req.destination === 'image' &&
      url.pathname.startsWith('/storage/v1/object/public/')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(cache => cache.match(req.url).then(hit => {
        const fresh = fetch(req.url, { mode: 'cors', credentials: 'omit' }).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            copy.blob().then(b => {
              if (b.size > IMG_MAX_BYTES) return;
              return cache.put(req.url, new Response(b, { headers: copy.headers }))
                .then(() => trimImages(cache));
            }).catch(() => {});
          } else if (res && res.status === 404) {
            cache.delete(req.url).catch(() => {});   // a deleted photo must not live on here
          }
          return res;
        });
        if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
        return fresh.catch(() => new Response('', { status: 504, statusText: 'Offline' }));
      }))
    );
    return;
  }

  // Rule 2. Live data and auth always go to the network, untouched.
  if (url.hostname.endsWith('supabase.co')) return;

  // Fonts: cache after first use — they never change and they are heavy.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // A7 — the 445 generated fighter pages are a SNAPSHOT that gets rebuilt.
  // Caching them cache-first froze whichever version a viewer happened to
  // open, for ever, and grew the cache without bound. They are cheap, they
  // redirect immediately, and they must never be stale: network only.
  if (url.pathname.includes('/app/f/')) return;

  // Anything else on our own origin: cache first, then network, and fall
  // back to the shell for a navigation so a deep link still opens offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      }))
    );
  }
});
