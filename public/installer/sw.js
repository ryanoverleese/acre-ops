/* Acre Field installer — tile cache only (dead-zone mode).
 * Scope: /installer/. Does not try to offline the whole app.
 */
const TILE_CACHE = 'af-installer-tiles-v1';
const MAX_ENTRIES = 600;

function isGoogleTile(url) {
  try {
    const u = new URL(url);
    return /^mt\d\.google\.com$/i.test(u.hostname) && u.pathname.indexOf('/vt') === 0;
  } catch {
    return false;
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const drop = keys.length - MAX_ENTRIES;
  for (let i = 0; i < drop; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('af-installer-tiles-') && n !== TILE_CACHE)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !isGoogleTile(req.url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(TILE_CACHE);
      const cached = await cache.match(req);
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          try {
            await cache.put(req, res.clone());
            await trimCache(cache);
          } catch {
            /* quota / opaque edge cases — still return network */
          }
        }
        return res;
      } catch {
        if (cached) return cached;
        // Transparent 1x1 so Leaflet doesn't pink-screen; pins stay on bg.
        return new Response(
          Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) =>
            c.charCodeAt(0)
          ),
          { status: 200, headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } }
        );
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'AF_PREFETCH_TILES' || !Array.isArray(data.urls)) return;

  event.waitUntil(
    (async () => {
      const cache = await caches.open(TILE_CACHE);
      for (const url of data.urls) {
        if (typeof url !== 'string' || !isGoogleTile(url)) continue;
        try {
          const hit = await cache.match(url);
          if (hit) continue;
          const res = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
          // no-cors → opaque; still cacheable and usable for later match.
          await cache.put(url, res);
        } catch {
          /* ignore single-tile failures */
        }
      }
      await trimCache(cache);
    })()
  );
});
