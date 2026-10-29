// Kashi Tracker — service worker (offline-first app shell)
// Code files (html/js/css) are network-first so updates arrive right away;
// when offline, the cached copy is used. Fonts/images/icons are cache-first.
const CACHE = "kashi-v1";
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
  e.waitUntil(
    caches.open(CACHE)
      .then((c) =>
        Promise.all(
          SHELL.map((u) =>
            // cache:"reload" bypasses the browser HTTP cache so we never store a stale copy
            fetch(new Request(u, { cache: "reload" }))
              .then((r) => (r.ok ? c.put(u, r) : null))
              .catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCode(req, url) {
  return (
    req.mode === "navigate" ||
    /\.(html|js|css|webmanifest)$/.test(url.pathname) ||
    url.pathname.endsWith("/")
  );
}

function networkFirst(req) {
  const fresh = fetch(new Request(req.url, { cache: "no-cache" })).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  const timeout = new Promise((_, rej) => setTimeout(rej, 4000));
  return Promise.race([fresh, timeout]).catch(() =>
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))
  );
}

function cacheFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(
    (hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
  );
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(isCode(e.request, url) ? networkFirst(e.request) : cacheFirst(e.request));
});
