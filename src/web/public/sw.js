/**
 * Service Worker — makes the dashboard installable as a PWA.
 * Strategy: network-first for everything (dashboard needs live data).
 * Falls back to cache only for the main HTML shell when offline.
 */

const CACHE = 'barbershop-v1';
const SHELL  = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always network-first — dashboard needs live API data
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
