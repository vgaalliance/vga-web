/* ═══════════════════════════════════════════════════════════════════════
   UBA app service worker.

   Two rules, and the second one is the important one:

   1. The SHELL is cache-first. index.html, the manifest and the icons come
      from cache so the app opens instantly and works with no signal.

   2. SUPABASE IS NEVER CACHED. Not stale-while-revalidate, not anything —
      it goes straight to the network every time. Caching a league's
      rankings or a fight card would show somebody a result that is hours
      old with no way to tell, which is worse than showing nothing.

   Bump CACHE_VERSION on any change to the shell files, or people keep the
   old app until they clear site data.
   ═══════════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'uba-v149';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll rejects the whole install if any single file 404s, so each
      // one is added on its own and a miss is logged rather than fatal.
      .then(cache => Promise.all(SHELL.map(url =>
        cache.add(url).catch(err => console.warn('[uba sw] skipped', url, err))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

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
