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
  'fonts/figtree.woff2',
  'fonts/bricolage-grotesque.woff2',
  'icono.svg',
  'icono-192.png',
  'icono-512.png',
  'icono-maskable-512.png',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'js/anuncios.js',
  'js/app.js',
  'js/cdn.js',
  'js/coste.js',
  'js/fechas.js',
  'js/fechas-enlaces.js',
  'js/ficha.js',
  'js/filtros.js',
  'js/formato.js',
  'js/geo.js',
  'js/iconos.js',
  'js/local.js',
  'js/mapa.js',
  'js/nota.js',
  'js/plantillas.js',
  'js/plantillas-ficha.js',
  'js/rutas.js',
  'js/tema.js',
  'js/ubicacion.js',
  'js/viaje.js',
  'js/vistas.js',
  'js/vistas-comun.js',
  'js/vistas-info.js',
  'js/vistas-portada.js',
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

/**
 * La interfaz de esta versión, tal como se guardó al instalarla. No se «actualiza por
 * detrás»: eso metía en la caché de esta versión archivos de la siguiente publicación y, si
 * no llegaban todos, quedaban módulos viejos y nuevos mezclados y el panel no arrancaba. Lo
 * nuevo llega entero con el service worker nuevo (otra VERSION). Lo que no se guardó al
 * instalar (p. ej. un icono que pide el sistema) se pide y se guarda.
 */
async function primeroCache(peticion) {
  const cache = await caches.open(VERSION);
  const guardada = await cache.match(peticion, { ignoreSearch: true });
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) await cache.put(peticion, respuesta.clone());
  return respuesta;
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);
  // Los datos pueden venir de la web de GitHub Pages (hosting propio con datos remotos).
  const datosRemotos = url.hostname.endsWith('.github.io') && url.pathname.includes('/data/');
  if (request.method !== 'GET' || (url.origin !== self.location.origin && !datosRemotos)) return;
  // Los datos y las guías para buscadores (src/paginas.js) cambian con cada escaneo: primero la red.
  if (url.pathname.includes('/data/') || /\/(escapadas|vuelos|actividades)\/|sitemap\.xml$/.test(url.pathname)) evento.respondWith(primeroRed(request));
  else evento.respondWith(primeroCache(request));
});
