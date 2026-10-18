// MiLey PWA cache namespace; change this version when offline assets change.
const CACHE = "miley-v1";
const PRECACHE = ["/offline.html", "/manifest.json", "/brand/miley-symbol.svg", "/brand/miley-app-icon.svg", "/brand/miley-app-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

async function offlineFallback() {
  const cached = await caches.match("/offline.html");
  return cached || new Response("You are offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Authenticated/private API responses and catalogs are never cached.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ error: "Offline" }), {
      status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    })));
    return;
  }

  // HTML is network-first; the offline page is only a fallback, never stale content.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(offlineFallback));
    return;
  }

  // Cache only immutable Next.js assets. User content and media always come from the network.
  event.respondWith(caches.match(event.request).then((cached) => {
    if (cached) return cached;
    return fetch(event.request).then((response) => {
      if (response.ok && url.pathname.startsWith("/_next/static/")) {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => new Response("", { status: 504 }));
  }));
});
