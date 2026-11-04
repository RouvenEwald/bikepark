/* Bikepark Lernkarten – Service Worker.
   Cache-first für App-Shell und Inhalte. Bei jeder Änderung an Dateien oder content.json VERSION erhöhen.
   Neue Versionen warten, bis in der App „Jetzt aktualisieren“ getippt wird (kein stiller Austausch). */
const VERSION = "2026-11-03.3";
const CACHE = "bikepark-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./engine.js",
  "./scenes.js",
  "./content.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./maskable-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("bikepark-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // keine fremden Domains
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    } catch (e) {
      return new Response("Offline und nicht im Speicher.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
