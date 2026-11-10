// Hace que la app siga funcionando sin señal una vez que se cargó la
// primera vez. Guarda una copia en el teléfono y la sirve de ahí.

const CACHE = "hds-v26";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
];

// Cuánto se espera a la red antes de tirar de la copia guardada. En
// planta el teléfono muchas veces marca señal pero no pasa nada: sin este
// límite la app se quedaba esperando en blanco. Mejor abrir rápido con la
// copia, y que la red actualice cuando de verdad conteste.
const ESPERA_RED = 3500;

function conLimite(promesa, ms) {
  return new Promise((listo, falla) => {
    const reloj = setTimeout(() => falla(new Error("tardo demasiado")), ms);
    promesa.then(
      r => { clearTimeout(reloj); listo(r); },
      e => { clearTimeout(reloj); falla(e); }
    );
  });
}

async function guardarTodo() {
  const c = await caches.open(CACHE);
  // Uno por uno, NO con addAll: addAll es todo o nada, asi que un icono
  // que fallara dejaba la cache VACIA y la app sin poder abrir sin señal.
  await Promise.all(ARCHIVOS.map(a => c.add(a).catch(() => {})));
  // index.html es el unico imprescindible: sin el, la app no abre.
  const hay = await c.match("./index.html");
  if (!hay) throw new Error("no se pudo guardar index.html");
}

self.addEventListener("install", e => {
  e.waitUntil(guardarTodo().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    // Las caches viejas se borran SOLO si la nueva ya quedo lista. Antes
    // se borraban siempre, asi que si la nueva no alcanzaba a guardarse,
    // el telefono se quedaba sin ninguna copia y la app ya no abria sin
    // internet.
    const c = await caches.open(CACHE);
    if (await c.match("./index.html")) {
      const llaves = await caches.keys();
      await Promise.all(llaves.filter(k => k !== CACHE).map(k => caches.delete(k)));
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   // Drive y demas, directo

  e.respondWith((async () => {
    // Primero la red (con limite de espera), para que las mejoras lleguen
    // solas cuando si hay internet.
    try {
      const resp = await conLimite(fetch(e.request), ESPERA_RED);
      if (resp && resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
      }
      return resp;
    } catch (err) {
      // Sin señal, o la red no contesto a tiempo: la copia guardada.
      const guardada = await caches.match(e.request);
      if (guardada) return guardada;

      // Si lo que se pedia era ABRIR la app, se devuelve index.html aunque
      // la direccion no coincida exacto: el icono instalado a veces pide
      // "./" y a veces "./index.html".
      if (e.request.mode === "navigate" || url.pathname.endsWith("/")) {
        const inicio = (await caches.match("./index.html")) || (await caches.match("./"));
        if (inicio) return inicio;
      }
      return new Response(
        "Sin conexion y sin copia guardada. Abre la app una vez con " +
        "internet para que se guarde en el telefono.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
  })());
});
