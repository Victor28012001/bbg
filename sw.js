const CACHE_NAME = "bbg-cache-v1";
const OFFLINE_URL = "/offline.html";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/main.js",
  "/style.css",
  "/assets/images/splash_screen.png",
  OFFLINE_URL,
  // Add other critical assets
  "/core/Game.js",
  "/core/SceneManager.js",
  "/systems/*",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});


self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// In your service worker
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-game-progress") {
    event.waitUntil(syncGameProgress());
  }
});

async function syncGameProgress() {
  const outbox = await getOutbox();
  return Promise.all(outbox.map((item) => sendToServer(item)));
}

self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Handle navigation requests
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Special handling for Three.js assets
  if (
    event.request.url.match(
      /\.(gltf|glb|fbx|obj|bin|png|jpg|jpeg|mp3|wav|ogg)$/
    )
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));
            return response;
          })
          .catch(() => cached || caches.match(OFFLINE_URL));
        return cached || fetchPromise;
      })
    );
  } else {
    event.respondWith(
      caches
        .match(event.request)
        .then((response) => response || fetch(event.request))
        .catch(() => caches.match(OFFLINE_URL))
    );
  }
});
