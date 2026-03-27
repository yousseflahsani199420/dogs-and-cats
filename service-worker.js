const CACHE_NAME = "petzone-static-v4";
const PRECACHE = [
  "./",
  "./index.html",
  "./search.html",
  "./about.html",
  "./contact.html",
  "./privacy.html",
  "./terms.html",
  "./faq.html",
  "./assets/css/styles.css",
  "./assets/js/main.js",
  "./assets/js/article.js",
  "./assets/js/category.js",
  "./assets/js/searchPage.js",
  "./assets/js/staticPage.js",
  "./assets/js/ui.js",
  "./assets/js/utils.js",
  "./assets/images/logo-full.svg",
  "./assets/images/logo-mark.svg",
  "./assets/images/favicon.svg",
  "./assets/images/placeholder-pet.svg",
  "./assets/icons/icon-192.svg",
  "./assets/icons/icon-512.svg",
];

function isCacheable(response) {
  return response && response.ok && response.status === 200;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (request.mode === "navigate") {
      return cache.match("./index.html");
    }
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(networkFirst(event.request));
});
