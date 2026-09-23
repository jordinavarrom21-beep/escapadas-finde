/**
 * Service worker del panel: la interfaz se sirve desde la caché (y se actualiza
 * en segundo plano) y los datos, primero desde la red con la caché de respaldo.
 *
 * VERSION cambia con cada commit (el workflow le pone el SHA al desplegar): así el
 * navegador instala la interfaz nueva entera de una vez, sin mezclar módulos viejos
 * y nuevos, y borra la caché anterior.
 */

const VERSION = 'escapadas-interfaz-dev';
const CACHE_DATOS = 'escapadas-datos';
const INTERFAZ = [
  './',
  'index.html',
  'css/estilos.css',
  'icono.svg',
  'icono-192.png',
  'icono-512.png',
  'icono-maskable-512.png',
  'apple-touch-icon.png',
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
  // «reload» salta la caché HTTP del navegador: si no, podría guardar una versión de hace minutos.
  const peticiones = INTERFAZ.map((ruta) => new Request(ruta, { cache: 'reload' }));
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(peticiones)).then(() => self.skipWaiting()));
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
    // Sin red se sigue con la copia guardada; el fallo solo se anota.
    evento.waitUntil(actualizar.catch((error) => console.warn(`No se ha podido actualizar ${peticion.url}:`, error)));
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
