/*
 * ShiftSentry service worker.
 *
 * Scope is deliberately narrow. Every page in this app is `force-dynamic` and
 * rendered per signed-in user, so cached HTML would be a real hazard: on a
 * shared device the next person to open the app could be served the previous
 * user's dashboard, and everyone would see stale hours. So HTML is never
 * written to the cache. Navigations go to the network, and if the network is
 * gone the user gets a static offline page instead of the browser's error.
 *
 * Only two classes of request are cached, both safe:
 *   - /_next/static/*  content-hashed build output; a URL never changes meaning
 *   - the icons and the offline page, which contain no user data
 *
 * Cross-origin requests (Supabase) and every non-GET request are ignored
 * outright, so auth calls and Server Action posts always hit the network.
 */

const CACHE = "shiftsentry-shell-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())));
    return;
  }

  if (!isImmutableAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (!response.ok) return response;
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
      return response;
    })),
  );
});
