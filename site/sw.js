/**
 * Service worker del panel: la interfaz se sirve desde la caché (y se actualiza
 * en segundo plano) y los datos, primero desde la red con la caché de respaldo.
 */

const VERSION = 'escapadas-interfaz-v1';
const CACHE_DATOS = 'escapadas-datos';
const INTERFAZ = [
  './',
  'index.html',
  'css/estilos.css',
  'icono.svg',
  'manifest.webmanifest',
  'js/app.js',
  'js/cdn.js',
  'js/fechas.js',
  'js/ficha.js',
  'js/filtros.js',
  'js/formato.js',
  'js/geo.js',
  'js/local.js',
  'js/mapa.js',
  'js/plantillas.js',
  'js/ubicacion.js',
  'js/vistas.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(INTERFAZ)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION && c !== CACHE_DATOS).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

async function primeroRed(peticion) {
  const cache = await caches.open(CACHE_DATOS);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) await cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(peticion);
    if (guardada) return guardada;
    throw error;
  }
}

async function primeroCache(peticion, evento) {
  const cache = await caches.open(VERSION);
  const guardada = await cache.match(peticion, { ignoreSearch: true });
  const actualizar = fetch(peticion)
    .then((respuesta) => {
      if (respuesta.ok) return cache.put(peticion, respuesta.clone()).then(() => respuesta);
      return respuesta;
    });
  if (guardada) {
    evento.waitUntil(actualizar.catch(() => {}));
    return guardada;
  }
  return actualizar;
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/data/')) evento.respondWith(primeroRed(request));
  else evento.respondWith(primeroCache(request, evento));
});
