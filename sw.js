// Hace que la app siga funcionando sin señal una vez que se cargó la
// primera vez. Guarda una copia en el teléfono y la sirve de ahí.

const CACHE = "hds-v21";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(llaves => Promise.all(
        llaves.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    // Primero intenta la red, para que las mejoras lleguen solas.
    fetch(e.request)
      .then(resp => {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
        return resp;
      })
      // Sin señal: sirve la copia guardada.
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
