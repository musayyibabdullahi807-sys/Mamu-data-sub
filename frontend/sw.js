const CACHE_NAME = "mamu-data-sub-v10";

const APP_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/style.css",
  "/js/app.js",
  "/assets/network-logos/mtn.svg",
  "/assets/network-logos/airtel.svg",
  "/assets/network-logos/glo.svg",
  "/assets/network-logos/9mobile.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_FILES);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
