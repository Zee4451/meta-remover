/**
 * GhostMeta AI - PWA Service Worker
 * Provides offline caching for 100% client-side privacy on mobile and desktop.
 */

const CACHE_NAME = 'ghostmeta-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/wifi-qr.svg',
  '/js/app.js',
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
      // Use individual promises so a single optional asset doesn't fail the whole installation
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => console.warn('Cache error for', url, err)))
      );
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
  // Handle navigation requests specifically (PWA offline check)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html', { ignoreSearch: true })
          .then(res => res || caches.match('/', { ignoreSearch: true }));
      })
    );
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
      if (cachedResponse) {
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
    }).catch(() => {
      if (event.request.headers.get('accept')?.includes('text/html')) {
        return caches.match('/index.html', { ignoreSearch: true });
      }
    })
  );
});
