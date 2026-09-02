const CACHE_NAME = "comissionamento-hvac-v1";
const APP_SHELL = [
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/supabase-client.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first para o app shell; passa direto (rede) para chamadas ao Supabase.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // deixa Supabase/CDN passarem direto
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});