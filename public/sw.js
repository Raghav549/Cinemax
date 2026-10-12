// Bump this version whenever the caching strategy changes so old caches are cleared.
const CACHE = "cinemax-prism-v6";
const PRECACHE = ["/offline.html", "/manifest.json", "/icon-192.png", "/icon-512.png", "/brand/cinemax-symbol.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function offlineFallback() {
  const cached = await caches.match("/offline.html");
  return cached || new Response("You are offline", { status: 503, headers: { "Content-Type": "text/plain" } });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Only handle same-origin requests (let images from TMDB etc. go straight to the network).
  if (url.origin !== self.location.origin) return;

  // API calls: network only, JSON error when offline
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request).catch(
        () =>
          new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  // Page navigations: network-first so new deployments show up immediately
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(offlineFallback));
    return;
  }

  // Static assets: cache-first (Next.js asset filenames are content-hashed)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (res.ok && url.pathname.startsWith("/_next/static/")) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => new Response("", { status: 504 }));
    })
  );
});
