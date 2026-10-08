/**
 * Service worker del panel: la interfaz se sirve desde la caché de su versión y los datos,
 * primero desde la red con la caché de respaldo.
 *
 * VERSION cambia con cada commit (el workflow le pone el SHA al desplegar): así el
 * navegador instala la interfaz nueva entera de una vez, sin mezclar módulos viejos
 * y nuevos, y borra la caché anterior. Al desplegar, los módulos y los estilos se piden
 * además con «?v=<versión>» (scripts/preparar-web.js): ni el navegador ni la caché o el CDN
 * del hosting pueden servir un archivo de otra publicación con la dirección de este.
 */

const VERSION = 'escapadas-interfaz-dev';
/** La versión tal como va en «?v=» (VERSION sin el prefijo). */
const V = VERSION.replace('escapadas-interfaz-', '');
/** Sin respuesta de la red en este tiempo, los datos guardados (y la red los renueva para la próxima vez). */
const ESPERA_RED_MS = 8000;
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
  'js/vigencia.js',
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

/**
 * Primero la red; si falla, o si tarda más de ESPERA_RED_MS y hay copia guardada, la copia
 * (una conexión colgada no deja la web en «Cargando…»). La respuesta de la red, cuando llega,
 * se guarda igualmente para la próxima vez.
 */
async function primeroRed(peticion, evento) {
  const cache = await caches.open(CACHE_DATOS);
  // Una respuesta de error (500, 404…) cuenta como fallo: con copia guardada, mejor la copia.
  const red = fetch(peticion).then(async (respuesta) => {
    if (!respuesta.ok) throw Object.assign(new Error(`HTTP ${respuesta.status} en ${peticion.url}`), { respuesta });
    await cache.put(peticion, respuesta.clone());
    return respuesta;
  });
  // Que el service worker no se pare antes de guardar la respuesta, aunque ya se haya usado la copia.
  evento?.waitUntil(red.catch((error) => console.warn(`Sin respuesta de la red para ${peticion.url}:`, error)));
  const guardada = await cache.match(peticion);
  // Sin copia, lo que haya dicho la red (también su error, para que la página lo explique).
  if (!guardada) return red.catch((error) => { if (error.respuesta) return error.respuesta; throw error; });
  const espera = new Promise((listo) => { setTimeout(() => listo(null), ESPERA_RED_MS); });
  try {
    return (await Promise.race([red, espera])) ?? guardada;
  } catch {
    return guardada;
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
  // Un módulo con «?v=»: el de esa versión exacta. Lo demás (index.html?utm_…), sin mirar la «?…».
  const version = new URL(peticion.url).searchParams.get('v');
  const guardada = await cache.match(peticion, { ignoreSearch: version == null });
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  // Lo de otra versión (una pestaña vieja abierta) no entra en la caché de esta.
  if (respuesta.ok && (version == null || version === V)) await cache.put(peticion, respuesta.clone());
  return respuesta;
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);
  // Los datos pueden venir de la web de GitHub Pages (hosting propio con datos remotos).
  const datosRemotos = url.hostname.endsWith('.github.io') && url.pathname.includes('/data/');
  if (request.method !== 'GET' || (url.origin !== self.location.origin && !datosRemotos)) return;
  // Los datos y las guías para buscadores (src/paginas.js) cambian con cada escaneo: primero la red.
  if (url.pathname.includes('/data/') || /\/(escapadas|vuelos|actividades)\/|sitemap\.xml$/.test(url.pathname)) evento.respondWith(primeroRed(request, evento));
  else evento.respondWith(primeroCache(request));
});
