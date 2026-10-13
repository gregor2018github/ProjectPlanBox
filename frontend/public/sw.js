// PlanBox service worker (ARCHITECTURE §9, phone access).
//
// Keeps the app shell (index.html and the hashed bundles) so PlanBox opens
// from the home screen even when the PC is off; it then shows that the
// server is unreachable. Data (/api) is never cached: the PC is the only
// source of truth. Browsers run this only on https or localhost.

const CACHE = "planbox-shell-v1";

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/assets/")) {
    // Hashed names never change content: cache first.
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    // Network first, so an update shows at once; the cached shell when offline.
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put("/", response.clone());
            await pruneAssets(cache, await response.clone().text());
          }
          return response;
        })
        .catch(async () => (await caches.match("/")) ?? Response.error()),
    );
    return;
  }

  // Icons, manifest and the like: network first, cache as a fallback.
  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.ok) void (await caches.open(CACHE)).put(request, response.clone());
        return response;
      })
      .catch(async () => (await caches.match(request)) ?? Response.error()),
  );
});

/** Drops cached bundles the current index.html no longer refers to. */
async function pruneAssets(cache, html) {
  const used = new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? []);
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/") && !used.has(path)) await cache.delete(request);
  }
}
