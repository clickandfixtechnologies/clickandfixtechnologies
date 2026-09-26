const CACHE_NAME = "click-fix-crm-static-v4";
const STATIC_ASSETS = [
    "./css/admin-shell.css",
    "./css/dashboard.css",
    "./js/admin-shell.js",
    "./js/pwa.js",
    "./manifest.webmanifest",
    "./icons/crm-icon-192.svg",
    "./icons/crm-icon-512.svg",
    "./icons/crm-icon-maskable.svg"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key.startsWith("click-fix-crm-static-") && key !== CACHE_NAME)
                .map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin || request.mode === "navigate") return;

    const isStaticAsset = /\/admin\/(?:css|js|icons)\/.+\.(?:css|js|svg)$/.test(url.pathname) ||
        url.pathname.endsWith("/admin/manifest.webmanifest");

    if (!isStaticAsset) return;

    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
        }))
    );
});
