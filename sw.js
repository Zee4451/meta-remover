/**
 * GhostMeta AI - PWA Service Worker
 * Provides offline caching for 100% client-side privacy on mobile and desktop.
 */

const CACHE_NAME = 'ghostmeta-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/js/app.js?v=7',
  '/js/vendor/jszip.min.js',
  '/js/vendor/FileSaver.min.js',
  '/js/cleaners/cleaner-hub.js',
  '/js/cleaners/jpeg-cleaner.js',
  '/js/cleaners/png-cleaner.js',
  '/js/cleaners/webp-cleaner.js',
  '/js/cleaners/mp4-cleaner.js',
  '/js/cleaners/canvas-cleaner.js',
  '/js/detectors/ai-detector.js',
  '/js/utils/samples.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Bypass cache for dynamic API endpoints
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Return cached, and revalidate in background
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => caches.match('/index.html'))
  );
});
