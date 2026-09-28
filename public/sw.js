// Service Worker for PocaPocket
const CACHE_NAME = 'pocapocket-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/brand/favicon-32.png',
  '/brand/app-icon-192.png',
  '/brand/app-icon-512.png',
  '/brand/app-icon-maskable-192.png',
  '/brand/app-icon-maskable-512.png',
  '/brand/apple-touch-icon.png',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Fetch event — /api ve cross-origin isteklerini service worker'a alma
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Pinterest vb. harici CDN — SW fetch CORS'ta patlar, tarayıcıya bırak
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigasyon: network-first (PWA açılışında güncel shell)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('/')))
    );
    return;
  }

  // İkon / brand: cache-first
  if (url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

