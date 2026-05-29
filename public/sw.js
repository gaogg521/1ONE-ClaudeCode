/** Bump when asset hashing / shell changes — old caches are deleted on activate. */
const CACHE_NAME = '1one-claudecode-webui-v2';
const LEGACY_CACHE_PREFIX = '1one-claudecode-webui-';
const NON_CACHEABLE_PATHS = new Set(['/qr-login']);
const OFFLINE_PAGE_URL = new URL('./index.html', self.location.href).toString();
const PRECACHE_URLS = [
  new URL('./', self.location.href).toString(),
  OFFLINE_PAGE_URL,
  new URL('./manifest.webmanifest', self.location.href).toString(),
  new URL('./pwa/icon-192.png', self.location.href).toString(),
  new URL('./pwa/icon-512.png', self.location.href).toString(),
];

function isHashedAsset(pathname) {
  return pathname.includes('/assets/');
}

function shouldHandleRequest(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  return !url.pathname.startsWith('/api/') && !NON_CACHEABLE_PATHS.has(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key === CACHE_NAME) {
              return Promise.resolve();
            }
            if (key.startsWith(LEGACY_CACHE_PREFIX)) {
              return caches.delete(key);
            }
            return caches.delete(key);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Hashed Vite chunks must always hit the network after a rebuild. */
async function networkOnly(request) {
  return fetch(request, { cache: 'no-store' });
}

async function networkFirstHtml(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      return response;
    }
  } catch {
    // fall through
  }
  return (await caches.match(OFFLINE_PAGE_URL)) || Response.error();
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void networkFetch;
    return cached;
  }

  return (await networkFetch) || Response.error();
}

self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) {
    return;
  }

  const url = new URL(event.request.url);

  if (isHashedAsset(url.pathname)) {
    event.respondWith(networkOnly(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstHtml(event.request));
    return;
  }

  const destination = event.request.destination;
  if (['script', 'style'].includes(destination)) {
    event.respondWith(networkOnly(event.request));
    return;
  }
  if (['image', 'font'].includes(destination)) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
