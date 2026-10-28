// Kashi Tracker — service worker (offline-first app shell)
const CACHE = "kashi-v6";
const SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "css/all.min.css", "css/app.css",
  "js/chart.min.js", "js/script.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/logo-mark.png",
  "fonts/fa-solid-900.woff2", "fonts/fa-regular-400.woff2", "fonts/fa-brands-400.woff2",
  "fonts/fa-v4compatibility.woff2",
  "fonts/inter-v20-latin-300.woff2", "fonts/inter-v20-latin-regular.woff2",
  "fonts/inter-v20-latin-500.woff2", "fonts/inter-v20-latin-600.woff2",
  "fonts/inter-v20-latin-700.woff2", "fonts/inter-v20-latin-800.woff2",
  "images/Cash.png", "images/Credit.png", "images/Debit.png", "images/Debt.png",
  "images/Digital Bank.png", "images/E-wallet.png", "images/Investments.png", "images/Savings.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit || caches.match("index.html"));
      return hit || net;
    })
  );
});
