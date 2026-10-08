/**
 * Cookies solo con permiso: Google Analytics 4, Google Ads y Travelpayouts Drive. El despliegue
 * (scripts/preparar-web.js) pone sus etiquetas si están en config/ajustes.json:
 *  - <meta name="escapadas-google-analytics"> con el ID de medición (G-…), de «googleAnalytics»;
 *  - <meta name="escapadas-google-ads"> con el ID de la cuenta (AW-…) y la conversión
 *    (AW-…/etiqueta), de «googleAds»;
 *  - <meta name="escapadas-drive"> con la dirección del script de Drive, de «travelpayoutsDrive».
 * Sin ninguna, este archivo no hace nada: ni aviso de cookies ni nada de fuera.
 *
 * Con alguna:
 *  - un aviso con «Rechazar» y «Aceptar» iguales, uno al lado del otro, y, si hay más de una
 *    finalidad, «Configurar» para elegir cada una (medición, publicidad, afiliación), como pide
 *    la AEPD;
 *  - nada de Google ni de Travelpayouts hasta que se acepta (Google: modo de consentimiento
 *    v2, «básico»), y de cada uno solo lo aceptado;
 *  - con la medición, una visita por cada sección del panel (Inicio, Escapadas…), cada clic en
 *    una oferta («Ver en…», «Reservar») como evento «clic_oferta» con la web, y lo que avisa
 *    app.js (abrir la ficha de una oferta, guardarla, buscar, compartir); con Google Ads, ese
 *    clic cuenta como conversión; con Drive, los enlaces de las marcas de su red pasan a ser
 *    de afiliado;
 *  - «Cookies» en el pie vuelve a abrir el aviso para cambiar de opinión.
 * La decisión se guarda en este navegador (localStorage), no en una cookie. Vale también en
 * las guías para buscadores (escapadas/, vuelos/…), que cargan este archivo si hay Drive o
 * Analytics. Las visitas de quien administra la web («?propietario=1») no se miden.
 */
(() => {
  const etiqueta = document.querySelector('meta[name="escapadas-google-ads"]');
  // El despliegue solo las pone con un ID y una dirección válidos (src/google-ads.js,
  // src/google-analytics.js, src/drive.js).
  const id = etiqueta?.content?.trim() || null;
  const analitica = document.querySelector('meta[name="escapadas-google-analytics"]')?.content?.trim() || null;
  const drive = document.querySelector('meta[name="escapadas-drive"]')?.content?.trim() || null;
  if (!id && !drive && !analitica) return;
  const conversion = id ? etiqueta.dataset.conversion?.trim() || null : null;
  const CLAVE = 'escapadas-cookies';
  // La raíz de la web (este archivo está en js/): «Más información» vale también desde las guías.
  const raiz = new URL('../', document.currentScript?.src ?? location.href).href;
  // El panel (index.html) o una guía para buscadores, que no lo tiene.
  const hayPanel = Boolean(document.querySelector('script[type="module"][src*="js/app.js"]'));

  // Cada finalidad, con lo que se pregunta en el aviso.
  const FINALIDADES = [
    analitica && { clave: 'analytics', corto: 'medición', nombre: 'Medición (Google Analytics)', para: 'medir cuántas visitas tiene cada parte de la web' },
    id && { clave: 'google-ads', corto: 'Google Ads', nombre: 'Publicidad (Google Ads)', para: 'saber si quien llega por un anuncio nuestro entra en alguna oferta' },
    drive && { clave: 'drive', corto: 'afiliación', nombre: 'Afiliación (Travelpayouts)', para: 'que, si reservas en una web de la red de Travelpayouts, esa web nos pague una comisión (a ti no te cuesta más)' },
  ].filter(Boolean);
  // Lo que se pregunta: si luego se añade algo (Analytics a quien aceptó Drive), se vuelve a
  // preguntar. Las decisiones guardadas antes de Drive eran solo de Google Ads.
  const ALCANCE = FINALIDADES.map((f) => f.clave);

  // Sin almacenamiento (bloqueado o lleno), la elección vale al menos mientras dure la visita.
  let eleccionVisita = null;
  /** Lo aceptado (una lista, vacía si se rechazó todo) o null si hay que preguntar. */
  const leer = () => {
    try {
      const guardada = JSON.parse(localStorage.getItem(CLAVE));
      if (!guardada?.decision) return eleccionVisita;
      const preguntado = guardada.para ?? ['google-ads'];
      // Antes de «Configurar» solo había «sí» a todo lo preguntado o «no».
      const acepta = Array.isArray(guardada.acepta) ? guardada.acepta : guardada.decision === 'si' ? preguntado : [];
      // A quien aceptó algo se le pregunta por lo nuevo; a quien lo rechazó todo, no.
      if (acepta.length && !ALCANCE.every((a) => preguntado.includes(a))) return eleccionVisita;
      return acepta.filter((a) => ALCANCE.includes(a));
    } catch { return eleccionVisita; }
  };
  const guardar = (acepta) => {
    eleccionVisita = acepta;
    const decision = acepta.length === ALCANCE.length ? 'si' : acepta.length ? 'parte' : 'no';
    try { localStorage.setItem(CLAVE, JSON.stringify({ decision, para: ALCANCE, acepta, fecha: new Date().toISOString() })); } catch { /* modo privado */ }
  };
  const permitido = (clave) => (leer() ?? []).includes(clave);
  // Quien administra la web (app.js lo guarda al entrar con «?propietario=1»): sus visitas no cuentan.
  const esPropietario = () => {
    try { return localStorage.getItem('escapadas:propietario') === '1'; } catch { return false; }
  };

  // gtag.js necesita el objeto `arguments`, no un array: así lo define Google.
  function gtag() { window.dataLayer.push(arguments); }
  if (id || analitica) {
    window.dataLayer = window.dataLayer || [];
    gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
  }

  // Lo que ya está funcionando en esta visita (para no cargarlo dos veces, y para quitarlo).
  const activo = new Set();
  let gtagCargado = false;
  const midiendo = () => activo.has('analytics') && permitido('analytics');

  /**
   * Una visita a una página. En el panel, la sección (#/escapadas…) sin los filtros: así se
   * agrupa por sección y no se envía lo que se busca. Con la «?…» de la dirección: ahí vienen
   * utm_…, gclid… y sin ellos las visitas de una campaña o un anuncio no se atribuyen. La
   * página anterior es la sección de antes (la primera, la web de la que se llega). En una
   * guía, su dirección.
   */
  let anterior = null;
  function visita() {
    if (!midiendo()) return;
    const vista = document.body.dataset.vista;
    if (hayPanel && !vista) return; // el panel aún no ha pintado: lo enviará al pintar
    const direccion = hayPanel ? `${location.origin}${location.pathname}${location.search}#/${vista}` : location.href;
    if (direccion === anterior) return;
    gtag('event', 'page_view', {
      send_to: analitica,
      page_title: document.title,
      page_location: direccion,
      ...(anterior ? { page_referrer: anterior } : {}),
    });
    anterior = direccion;
  }

  function cargarGtag(cuenta) {
    if (gtagCargado) return;
    gtagCargado = true;
    gtag('js', new Date());
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cuenta)}`;
    document.head.append(script);
  }

  /** Pone en marcha lo aceptado (`acepta`) que aún no lo esté. */
  function activar(acepta) {
    if (drive && acepta.includes('drive') && !activo.has('drive')) {
      activo.add('drive');
      const script = document.createElement('script');
      script.async = true;
      script.src = drive;
      document.head.append(script);
    }
    if (!id && !analitica) return;
    const anuncios = Boolean(id && acepta.includes('google-ads'));
    const medir = Boolean(analitica && acepta.includes('analytics') && !esPropietario());
    gtag('consent', 'update', {
      ad_storage: anuncios ? 'granted' : 'denied',
      ad_user_data: anuncios ? 'granted' : 'denied',
      ad_personalization: anuncios ? 'granted' : 'denied',
      analytics_storage: medir ? 'granted' : 'denied',
    });
    if (anuncios && !activo.has('google-ads')) {
      activo.add('google-ads');
      cargarGtag(id);
      gtag('config', id);
    }
    if (medir && !activo.has('analytics')) {
      activo.add('analytics');
      cargarGtag(analitica);
      // Las visitas las cuenta visita(): una por sección del panel, con su nombre.
      gtag('config', analitica, { send_page_view: false });
      visita();
    }
  }

  /** Quita lo que se ha dejado de aceptar: sus cookies y, si ya estaba cargado, recargando. */
  function retirar(acepta) {
    const fuera = ALCANCE.filter((clave) => !acepta.includes(clave));
    if (!fuera.length) return;
    // Las cookies de Google (Ads: _gcl_…; Analytics: _ga, _ga_…) y la de sesión de Drive.
    const patron = new RegExp(`^(${[
      fuera.includes('google-ads') && '_gcl_',
      fuera.includes('analytics') && '_ga',
      fuera.includes('drive') && 'am_user_session$',
    ].filter(Boolean).join('|')})`);
    const dominio = location.hostname.replace(/^www\./, '');
    for (const nombre of document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => patron.test(n))) {
      document.cookie = `${nombre}=; Max-Age=0; path=/; domain=.${dominio}`;
      document.cookie = `${nombre}=; Max-Age=0; path=/`;
    }
    // Lo que Drive guarda en este navegador.
    if (fuera.includes('drive')) {
      try {
        for (const clave of Object.keys(localStorage).filter((c) => /^(emerald_|mn:)/.test(c))) localStorage.removeItem(clave);
      } catch { /* modo privado */ }
    }
    if (id || analitica) {
      gtag('consent', 'update', {
        ...(fuera.includes('google-ads') ? { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' } : {}),
        ...(fuera.includes('analytics') ? { analytics_storage: 'denied' } : {}),
      });
    }
    // Un script ya cargado en esta visita solo se va del todo recargando la página.
    if (fuera.some((clave) => activo.has(clave))) location.reload();
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

  const enumerar = (partes) => (partes.length < 2 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`);

  /** Qué se pregunta: lo que de verdad hay configurado. */
  function textoAviso() {
    const mas = `<a href="${raiz}#/ayuda?seccion=privacidad">Más información</a>`;
    return `<p><strong>¿Aceptas cookies de ${enumerar(FINALIDADES.map((f) => f.corto))}?</strong>
      Sirven para ${enumerar(FINALIDADES.map((f) => f.para))}. Sin ellas la web funciona igual. ${mas}</p>`;
  }

  /** «Configurar»: una casilla por finalidad, sin marcar salvo lo que ya se aceptó. */
  function opciones(acepta) {
    return FINALIDADES.map((f) => `<label class="aviso-cookies__opcion">
        <input type="checkbox" name="${f.clave}"${acepta.includes(f.clave) ? ' checked' : ''}>
        <span><strong>${f.nombre}</strong>: sirve para ${f.para}.</span>
      </label>`).join('');
  }

  function aviso() {
    document.querySelector('.aviso-cookies')?.remove();
    const anterior = leer();
    const caja = document.createElement('section');
    caja.className = 'aviso-cookies';
    caja.setAttribute('aria-label', 'Cookies');
    const variasFinalidades = FINALIDADES.length > 1;
    // Quien ya eligió y vuelve desde «Cookies» ve directamente qué tiene aceptado.
    const configurando = variasFinalidades && anterior !== null;
    caja.innerHTML = `${textoAviso()}
      ${variasFinalidades ? `<fieldset class="aviso-cookies__elegir"${configurando ? '' : ' hidden'}><legend class="sr">Elige qué cookies aceptas</legend>${opciones(anterior ?? [])}</fieldset>` : ''}
      <div class="aviso-cookies__botones">
        ${variasFinalidades ? `<button type="button" class="aviso-cookies__configurar${configurando ? ' boton' : ''}" data-cookies="${configurando ? 'guardar' : 'elegir'}">${configurando ? 'Guardar mi elección' : 'Configurar'}</button>` : ''}
        <button type="button" class="boton boton--tinta" data-cookies="no">Rechazar</button>
        <button type="button" class="boton boton--tinta" data-cookies="si">Aceptar</button>
      </div>`;
    caja.addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-cookies]');
      if (!boton) return;
      if (boton.dataset.cookies === 'elegir') {
        caja.querySelector('.aviso-cookies__elegir').hidden = false;
        boton.dataset.cookies = 'guardar';
        boton.textContent = 'Guardar mi elección';
        boton.classList.add('boton');
        colocar(caja);
        caja.querySelector('.aviso-cookies__elegir input')?.focus();
        return;
      }
      const acepta = {
        si: ALCANCE,
        no: [],
        guardar: [...caja.querySelectorAll('.aviso-cookies__elegir input:checked')].map((casilla) => casilla.name),
      }[boton.dataset.cookies];
      if (!acepta) return;
      guardar(acepta);
      cerrarAviso(caja);
      activar(acepta);
      retirar(acepta);
    });
    colocar(caja);
    vigilarDialogos.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  }

  /**
   * Con permiso ya dado, Drive y Google esperan a que el panel pinte las ofertas: así no
   * compiten con ellas por la conexión y el procesador al abrir la web (sobre todo en el
   * móvil). En las guías, que no tienen panel, enseguida. Si el panel tarda mucho, a los 8 s.
   */
  function despuesDelPanel(fn) {
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
      // Entrar en una oferta (los enlaces llevan data-clic, ver plantillas.js): la web a la
      // que se va para la medición y, en Google Ads, la conversión.
      const oferta = evento.target.closest?.('a[data-clic]');
      if (!oferta) return;
      if (midiendo()) {
        gtag('event', 'clic_oferta', { send_to: analitica, web: oferta.dataset.clic, tipo: oferta.dataset.clicOferta, enlace: oferta.dataset.clicTipo });
      }
      if (conversion && activo.has('google-ads') && permitido('google-ads')) gtag('event', 'conversion', { send_to: conversion });
    });
    // Cada sección del panel que se abre (app.js lo avisa al pintarla) es una visita.
    window.addEventListener('escapadas:vista', visita);
    // Lo que se hace en el panel (app.js: ver_oferta, guardar_oferta, search, share).
    window.addEventListener('escapadas:medir', ({ detail }) => {
      if (midiendo() && detail?.evento) gtag('event', detail.evento, { send_to: analitica, ...detail.datos });
    });
    const acepta = leer();
    if (acepta === null) aviso();
    else if (acepta.length) despuesDelPanel(() => activar(acepta));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
