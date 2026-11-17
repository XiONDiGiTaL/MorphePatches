/* visualvm service worker. App shell only. */
const CACHE = 'visualvm-shell-v1';

// The worker lives at "<scope>sw.js", so its own path gives the app root at
// both "/" and "/visualvm/". Everything below is derived from that.
const SCOPE = self.location.pathname.replace(/sw\.js$/, '');
const SHELL = [SCOPE, `${SCOPE}icon-192.png`, `${SCOPE}icon-512.png`];

// The browser must see these fresh: the worker script to detect updates, and
// the manifest for install metadata. They are never precached or stored.
const BYPASS = new Set([`${SCOPE}sw.js`, `${SCOPE}manifest.webmanifest`]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Third-party traffic (fonts, the Whisper runtime and model, Gmail) is never cached.
  if (url.origin !== self.location.origin) return;
  if (BYPASS.has(url.pathname)) return;

  // Navigations go network-first so a new deploy is picked up, with the cached
  // shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(SCOPE, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(SCOPE).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Hashed build assets are immutable, so cache-first keeps the shell usable offline.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    }),
  );
});
