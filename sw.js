/**
 * GhostMeta AI - PWA Service Worker
 * Provides offline caching for 100% client-side privacy on mobile and desktop.
 */

const CACHE_NAME = 'ghostmeta-cache-v13';
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
  '/js/cleaners/watermark-remover.js',
  '/js/cleaners/video-watermark-cleaner.js',
  '/js/detectors/ai-detector.js',
  '/js/utils/samples.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
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
  // Navigation requests: Network first with offline index.html fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html', { ignoreSearch: true })
          .then(res => res || caches.match('/', { ignoreSearch: true }));
      })
    );
    return;
  }

  // Network first for JS modules & CSS so updates apply immediately
  const isCodeAsset = event.request.url.includes('/js/') || event.request.url.includes('.css');
  if (isCodeAsset) {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // Stale-while-revalidate for other assets
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
    })
  );
});
