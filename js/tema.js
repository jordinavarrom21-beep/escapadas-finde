/**
 * Lo primero que hace la página, antes de pintar nada. Es un script clásico y síncrono en el
 * <head> (no un módulo): los módulos se ejecutan después de pintar. Va en archivo aparte
 * porque la CSP no permite scripts en línea.
 *  - El tema claro u oscuro guardado, para que no parpadee.
 *  - Pide ya los datos (ofertas.json, historial.json): app.js los recoge al arrancar. Si no,
 *    no se pedían hasta tener los 22 módulos del panel (en un móvil, más de un segundo).
 *  - Si el panel no llega a arrancar (un módulo que no llega, uno viejo de la caché mezclado
 *    con los nuevos justo después de publicar, un error al pintar), en vez de «Cargando
 *    ofertas…» para siempre dice qué pasa, ofrece «Recargar» (tira la copia guardada y pide la
 *    versión publicada) y enseña la portada sin JavaScript (lo mejor de ahora y las guías).
 */
// Con JavaScript, la portada para buscadores (.portada-estatica) no llega a verse: el panel
// la sustituye al pintar y así no salta de un contenido a otro.
document.documentElement.classList.add('js');
// La vista que se va a pintar, ya desde el principio: en la portada la cabecera no lleva la
// búsqueda ni «Tu salida» (estilos: body[data-vista="finde"]) y, si se quitaban al pintar, todo
// lo de debajo subía de golpe (desplazamiento de contenido, CLS).
// El enlace de una ficha (#/oferta/<id>) abre la portada con la ficha encima.
document.documentElement.dataset.vistaInicial = location.hash.startsWith('#/oferta/') ? 'finde' : location.hash.replace(/^#\/?/, '').split('?')[0] || 'finde';
try {
  const tema = localStorage.getItem('escapadas:tema');
  if (tema === 'claro' || tema === 'oscuro') document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark';
  // Lo mismo con «Lista» o «Tarjetas» en los resultados.
  if (localStorage.getItem('escapadas:modoLista') === 'lista') document.documentElement.classList.add('modo-lista');
} catch (error) {
  // Sin acceso a localStorage (bloqueado o modo privado) se usa el tema del sistema.
  console.warn('No se puede leer el tema guardado:', error);
}

/**
 * fetch con un límite para que el servidor empiece a responder (no para la descarga entera,
 * que en un móvil lento puede tardar): una conexión colgada no deja «Cargando…» para siempre.
 * El mismo en app.js (pedirJson).
 */
window.escapadasPedir = function pedirConLimite(ruta, limiteMs = 15000) {
  const control = typeof AbortController === 'function' ? new AbortController() : null;
  const reloj = control && setTimeout(() => control.abort(), limiteMs);
  return fetch(ruta, { cache: 'no-cache', signal: control?.signal }).finally(() => clearTimeout(reloj));
};

// Los datos, ya. Con datos de otra web («escapadas-datos», hosting con datos remotos) los pide
// app.js como siempre. Las mismas opciones que app.js (pedirJson): sin caché vieja.
(function adelantarDatos() {
  try {
    if (typeof fetch !== 'function' || document.querySelector('meta[name="escapadas-datos"]')) return;
    const pedir = (ruta) => window.escapadasPedir(ruta).then((respuesta) => {
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} en ${ruta}`);
      return respuesta.json();
    });
    const pedidos = { 'data/ofertas.json': pedir('data/ofertas.json'), 'data/historial.json': pedir('data/historial.json') };
    // Un fallo aquí lo trata app.js cuando los recoge: que no salga antes como error suelto.
    Object.values(pedidos).forEach((pedido) => pedido.catch(() => {}));
    window.escapadasDatos = pedidos;
  } catch (error) {
    console.warn('No se han podido adelantar los datos:', error);
  }
}());

(function vigilarArranque() {
  // app.js pone escapadasListo al pintar la primera vista.
  const listo = () => Boolean(window.escapadasListo);
  let avisado = false;
  const delPanel = (url) => typeof url === 'string' && url.startsWith(location.origin) && /\/js\/[\w-]+\.js/.test(url);
  /**
   * `motivo`: «lento» (más de 15 s), «modulo» (un archivo del panel que no llega o no encaja con
   * los demás: lo arregla bajar la versión publicada entera) o «error» (otro fallo al arrancar).
   */
  function avisar(motivo) {
    if (listo() || avisado) return;
    const cargando = document.querySelector('#principal .cargando');
    if (!cargando) return;
    avisado = motivo !== 'lento';
    const textos = {
      lento: 'Está tardando más de lo normal (conexión lenta o mucho tráfico).',
      modulo: 'No se ha podido abrir la web: falta una parte o es de una versión anterior guardada en tu navegador.',
      error: 'No se ha podido abrir la web por un error al preparar las ofertas.',
    };
    cargando.textContent = `${textos[motivo] ?? textos.error} `;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton boton--primario';
    boton.dataset.recargarLimpio = '';
    boton.textContent = 'Recargar la versión actual';
    cargando.append(document.createElement('br'), boton);
    if (motivo !== 'lento') mostrarPortadaSinPanel(cargando);
  }
  // Recargar sin la copia guardada (service worker y su caché): la versión publicada, entera.
  async function recargarLimpio() {
    try {
      const registros = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(registros.map((r) => r.unregister()));
      const claves = await window.caches?.keys?.() ?? [];
      await Promise.all(claves.map((clave) => caches.delete(clave)));
    } catch (error) {
      console.warn('No se ha podido borrar la copia guardada:', error);
    }
    location.reload();
  }
  window.escapadasRecargarLimpio = recargarLimpio;
  // Cualquier botón «data-recargar-limpio» (aquí y en los errores de app.js), aunque el panel no arranque.
  document.addEventListener('click', (evento) => {
    if (!evento.target.closest?.('[data-recargar-limpio]')) return;
    evento.preventDefault();
    recargarLimpio();
  });
  /**
   * La alternativa mientras tanto: la portada para buscadores (lo mejor de ahora y las guías,
   * sin JavaScript), que va en index.html escondida detrás del panel.
   */
  function mostrarPortadaSinPanel(cargando) {
    if (!document.querySelector('.portada-estatica')) return;
    document.documentElement.classList.add('sin-panel');
    const nota = document.createElement('p');
    nota.className = 'suave';
    nota.textContent = 'Mientras tanto, aquí tienes las mejores ofertas de ahora y las guías:';
    cargando.append(nota);
  }
  window.escapadasSinPanel = (motivo = 'error') => avisar(motivo);
  const cuandoHayaPagina = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());
  window.addEventListener('error', (evento) => {
    if (listo()) return;
    // Un módulo que no llega (404, sin red): el error es del <script> o del <link rel="modulepreload">.
    const elemento = evento.target;
    if (elemento && elemento !== window && /^(SCRIPT|LINK)$/.test(elemento.tagName ?? '')) {
      if (delPanel(elemento.src || elemento.href)) cuandoHayaPagina(() => avisar('modulo'));
      return;
    }
    // Un error del propio panel antes de pintar: «does not provide an export named…» (versiones
    // mezcladas) o cualquier otro.
    if (delPanel(evento.filename)) {
      const mezcla = evento.error instanceof SyntaxError || /export named|import/i.test(evento.message ?? '');
      cuandoHayaPagina(() => avisar(mezcla ? 'modulo' : 'error'));
    }
  }, true);
  // Un fallo dentro de una función asíncrona del panel no llega como «error».
  window.addEventListener('unhandledrejection', (evento) => {
    if (!listo() && delPanel(String(evento.reason?.stack ?? '').match(/https?:\/\/[^\s)]+/)?.[0])) cuandoHayaPagina(() => avisar('error'));
  });
  setTimeout(() => avisar('lento'), 15000);
}());
