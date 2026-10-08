/**
 * Lo primero que hace la página, antes de pintar nada. Es un script clásico y síncrono en el
 * <head> (no un módulo): los módulos se ejecutan después de pintar. Va en archivo aparte
 * porque la CSP no permite scripts en línea.
 *  - El tema claro u oscuro guardado, para que no parpadee.
 *  - Pide ya los datos (ofertas.json, historial.json): app.js los recoge al arrancar. Si no,
 *    no se pedían hasta tener los 22 módulos del panel (en un móvil, más de un segundo).
 *  - Si el panel no llega a arrancar (un archivo que falla, o uno viejo de la caché mezclado
 *    con los nuevos justo después de publicar), en vez de «Cargando ofertas…» para siempre
 *    dice qué pasa y ofrece «Recargar», que tira la copia guardada.
 */
// Con JavaScript, la portada para buscadores (.portada-estatica) no llega a verse: el panel
// la sustituye al pintar y así no salta de un contenido a otro.
document.documentElement.classList.add('js');
try {
  const tema = localStorage.getItem('escapadas:tema');
  if (tema === 'claro' || tema === 'oscuro') document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark';
  // Lo mismo con «Lista» o «Tarjetas» en los resultados.
  if (localStorage.getItem('escapadas:modoLista') === 'lista') document.documentElement.classList.add('modo-lista');
} catch (error) {
  // Sin acceso a localStorage (bloqueado o modo privado) se usa el tema del sistema.
  console.warn('No se puede leer el tema guardado:', error);
}

// Los datos, ya. Con datos de otra web («escapadas-datos», hosting con datos remotos) los pide
// app.js como siempre. Las mismas opciones que app.js (pedirJson): sin caché vieja.
(function adelantarDatos() {
  try {
    if (typeof fetch !== 'function' || document.querySelector('meta[name="escapadas-datos"]')) return;
    const pedir = (ruta) => fetch(ruta, { cache: 'no-cache' }).then((respuesta) => {
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
  function avisar(lento) {
    if (listo() || avisado) return;
    const cargando = document.querySelector('#principal .cargando');
    if (!cargando) return;
    avisado = !lento;
    cargando.textContent = lento
      ? 'Está tardando más de lo normal (conexión lenta o mucho tráfico). '
      : 'No se ha podido abrir la web: puede que tu navegador guarde una versión anterior. ';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton boton--primario';
    boton.textContent = 'Recargar';
    boton.addEventListener('click', recargarLimpio);
    cargando.append(document.createElement('br'), boton);
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
  // Un error del propio panel antes de pintar (p. ej. «does not provide an export named…»).
  window.addEventListener('error', (evento) => {
    if (!listo() && /\/js\/[\w-]+\.js/.test(evento.filename ?? '') && evento.filename.startsWith(location.origin)) {
      document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => avisar(false)) : avisar(false);
    }
  });
  setTimeout(() => avisar(true), 15000);
}());
