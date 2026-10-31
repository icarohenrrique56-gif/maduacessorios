const CACHE_PREFIX = 'madu-pwa-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v2`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-v2`;
const SHELL_FILES = [
  '/offline.html',
  '/assets/brand/madu-favicon.png',
  '/assets/brand/madu-app-icon.svg',
  '/assets/brand/madu-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && requestUrl.pathname === '/' && !requestUrl.search) {
            const responseCopy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put('/', responseCopy));
          }
          return response;
        })
        .catch(async () => {
          const cachedPage = !requestUrl.search ? await caches.match(request) : undefined;
          return cachedPage ?? (await caches.match('/')) ?? (await caches.match('/offline.html'));
        }),
    );
    return;
  }

  const isStaticAsset =
    requestUrl.pathname.startsWith('/assets/') &&
    /-[\w-]{8,}\.(?:js|css|png|jpe?g|webp|svg|woff2?)$/i.test(requestUrl.pathname);

  if (!isStaticAsset) return;

  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cachedAsset = await cache.match(request);
      if (cachedAsset) return cachedAsset;

      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }),
  );
});
