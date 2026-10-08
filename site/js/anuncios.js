/**
 * Cookies solo con permiso: Google Ads y Travelpayouts Drive. El despliegue
 * (scripts/preparar-web.js) pone sus etiquetas si están en config/ajustes.json:
 *  - <meta name="escapadas-google-ads"> con el ID de la cuenta (AW-…) y la conversión
 *    (AW-…/etiqueta), de «googleAds»;
 *  - <meta name="escapadas-drive"> con la dirección del script de Drive, de «travelpayoutsDrive».
 * Sin ninguna, este archivo no hace nada: ni aviso de cookies ni nada de fuera.
 *
 * Con alguna:
 *  - un aviso con «Aceptar» y «Rechazar» igual de fáciles (como pide la AEPD);
 *  - nada de Google ni de Travelpayouts hasta que se acepta (Google: modo de consentimiento
 *    v2, «básico»);
 *  - con permiso, cada clic en una oferta («Ver en…», «Reservar») cuenta como conversión de
 *    Google Ads, y Drive convierte en enlaces de afiliado los de las marcas de su red;
 *  - «Cookies» en el pie vuelve a abrir el aviso para cambiar de opinión.
 * La decisión se guarda en este navegador (localStorage), no en una cookie. Vale también en
 * las guías para buscadores (escapadas/, vuelos/…), que cargan este archivo si hay Drive.
 */
(() => {
  const etiqueta = document.querySelector('meta[name="escapadas-google-ads"]');
  // El despliegue solo las pone con un ID y una dirección válidos (src/google-ads.js, src/drive.js).
  const id = etiqueta?.content?.trim() || null;
  const drive = document.querySelector('meta[name="escapadas-drive"]')?.content?.trim() || null;
  if (!id && !drive) return;
  const conversion = id ? etiqueta.dataset.conversion?.trim() || null : null;
  const CLAVE = 'escapadas-cookies';
  // La raíz de la web (este archivo está en js/): «Más información» vale también desde las guías.
  const raiz = new URL('../', document.currentScript?.src ?? location.href).href;

  // A qué se dijo que sí: si luego se añade algo (Drive a quien solo aceptó Google Ads), se
  // vuelve a preguntar. Las decisiones guardadas antes de Drive eran solo de Google Ads.
  const ALCANCE = [id && 'google-ads', drive && 'drive'].filter(Boolean);

  // Sin almacenamiento (bloqueado o lleno), la decisión vale al menos mientras dure la visita.
  let decisionVisita = null;
  const leer = () => {
    try {
      const guardada = JSON.parse(localStorage.getItem(CLAVE));
      if (!guardada?.decision) return decisionVisita;
      if (guardada.decision === 'si' && !ALCANCE.every((a) => (guardada.para ?? ['google-ads']).includes(a))) return decisionVisita;
      return guardada.decision;
    } catch { return decisionVisita; }
  };
  const guardar = (decision) => {
    decisionVisita = decision;
    try { localStorage.setItem(CLAVE, JSON.stringify({ decision, para: ALCANCE, fecha: new Date().toISOString() })); } catch { /* modo privado */ }
  };

  // gtag.js necesita el objeto `arguments`, no un array: así lo define Google.
  function gtag() { window.dataLayer.push(arguments); }
  if (id) {
    window.dataLayer = window.dataLayer || [];
    gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
  }

  let cargado = false;
  let driveCargado = false;
  function activar() {
    if (drive && !driveCargado) {
      driveCargado = true;
      const script = document.createElement('script');
      script.async = true;
      script.src = drive;
      document.head.append(script);
    }
    if (!id) return;
    gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
    if (cargado) return;
    cargado = true;
    gtag('js', new Date());
    gtag('config', id);
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.append(script);
  }
  function desactivar() {
    if (id) gtag('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    // Las cookies de Google Ads y la de sesión de Drive que ya hubiera en este dominio.
    const dominio = location.hostname.replace(/^www\./, '');
    for (const nombre of document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^(_gcl_|_ga|am_user_session$)/.test(n))) {
      document.cookie = `${nombre}=; Max-Age=0; path=/; domain=.${dominio}`;
      document.cookie = `${nombre}=; Max-Age=0; path=/`;
    }
    if (!drive) return;
    // Lo que Drive guarda en este navegador.
    try {
      for (const clave of Object.keys(localStorage).filter((c) => /^(emerald_|mn:)/.test(c))) localStorage.removeItem(clave);
    } catch { /* modo privado */ }
    // Drive ya cargado en esta visita: solo se va del todo recargando la página.
    if (driveCargado) location.reload();
  }

  /**
   * Con una ficha abierta (diálogo modal), el resto de la página no se puede pulsar: el aviso
   * va dentro del diálogo abierto, y vuelve a la página al cerrarlo.
   */
  function colocar(caja) {
    const modal = () => {
      try { return document.querySelector('dialog:modal'); } catch { return document.querySelector('dialog[open]'); }
    };
    const sitio = modal() ?? document.body;
    if (caja.parentElement !== sitio) sitio.append(caja);
    // Los avisos flotantes («Hay datos nuevos»…) suben para que el de cookies no los tape.
    document.body.style.setProperty('--alto-cookies', `${caja.offsetHeight + 12}px`);
  }
  // Solo cuando se abre o se cierra una ficha (<dialog>): los filtros también cambian «open»
  // (son <details>) y recolocar en cada uno obligaba a recalcular toda la página.
  const vigilarDialogos = new MutationObserver((cambios) => {
    if (!cambios.some((cambio) => cambio.target.tagName === 'DIALOG')) return;
    const caja = document.querySelector('.aviso-cookies');
    if (caja) colocar(caja);
  });

  function cerrarAviso(caja) {
    caja.remove();
    vigilarDialogos.disconnect();
    document.body.style.removeProperty('--alto-cookies');
  }

  /** Qué se pregunta: lo que de verdad hay configurado. */
  function textoAviso() {
    const mas = `<a href="${raiz}#/ayuda?seccion=privacidad">Más información</a>`;
    if (id && drive) {
      return `<p><strong>¿Aceptas cookies de Google Ads y de afiliación?</strong> Sirven para saber si alguien llegó por un anuncio
      nuestro y entró en una oferta, y para que, si reservas en una web de la red de Travelpayouts, esa web nos pague una
      comisión. A ti no te cuesta más y sin ellas la web funciona igual. ${mas}</p>`;
    }
    if (drive) {
      return `<p><strong>¿Aceptas cookies de afiliación?</strong> Con ellas, si reservas en una web de la red de Travelpayouts
      después de pasar por aquí, esa web nos paga una comisión. A ti no te cuesta más y sin ellas la web funciona igual. ${mas}</p>`;
    }
    return `<p><strong>¿Aceptas cookies de Google Ads?</strong> Solo sirven para saber si alguien llegó por un anuncio
      nuestro y entró en una oferta. Sin ellas la web funciona igual. ${mas}</p>`;
  }

  function aviso() {
    document.querySelector('.aviso-cookies')?.remove();
    const caja = document.createElement('section');
    caja.className = 'aviso-cookies';
    caja.setAttribute('aria-label', 'Cookies');
    caja.innerHTML = `${textoAviso()}
      <div class="aviso-cookies__botones">
        <button type="button" class="boton" data-cookies="no">Rechazar</button>
        <button type="button" class="boton boton--tinta" data-cookies="si">Aceptar</button>
      </div>`;
    caja.addEventListener('click', (evento) => {
      const decision = evento.target.closest('[data-cookies]')?.dataset.cookies;
      if (!decision) return;
      guardar(decision);
      cerrarAviso(caja);
      if (decision === 'si') activar(); else desactivar();
    });
    colocar(caja);
    vigilarDialogos.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  }

  /**
   * Con permiso ya dado, Drive y Google Ads esperan a que el panel pinte las ofertas: así no
   * compiten con ellas por la conexión y el procesador al abrir la web (sobre todo en el
   * móvil). En las guías, que no tienen panel, enseguida. Si el panel tarda mucho, a los 8 s.
   */
  function despuesDelPanel(fn) {
    const hayPanel = document.querySelector('script[type="module"][src$="js/app.js"]');
    if (!hayPanel || window.escapadasListo) { fn(); return; }
    let hecho = false;
    const una = () => { if (!hecho) { hecho = true; fn(); } };
    window.addEventListener('escapadas:listo', una, { once: true });
    setTimeout(una, 8000);
  }

  function arrancar() {
    // El pie ya no dice «Sin cookies ni seguimiento»: enlaza al aviso.
    for (const marca of document.querySelectorAll('[data-sin-cookies]')) {
      const enlace = document.createElement('a');
      enlace.href = '#';
      enlace.dataset.abrirCookies = '';
      enlace.textContent = 'Cookies';
      marca.replaceWith(enlace);
    }
    document.addEventListener('click', (evento) => {
      if (evento.target.closest?.('[data-abrir-cookies]')) {
        evento.preventDefault();
        aviso();
        return;
      }
      // Entrar en una oferta es la conversión (los enlaces llevan data-clic, ver plantillas.js).
      if (conversion && cargado && leer() === 'si' && evento.target.closest?.('a[data-clic]')) gtag('event', 'conversion', { send_to: conversion });
    });
    const decision = leer();
    if (decision === 'si') despuesDelPanel(activar);
    else if (decision === null) aviso();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
