/**
 * Google Ads y Travelpayouts Drive, solo con permiso: el despliegue (scripts/preparar-web.js)
 * pone <meta name="escapadas-google-ads"> con el ID de la cuenta (AW-…) y la conversión
 * (AW-…/etiqueta) si están en config/ajustes.json («googleAds»), y <meta name="escapadas-drive">
 * con el script de Drive («travelpayoutsDrive»). Sin ninguna, este archivo no hace nada: ni
 * aviso de cookies ni nada de terceros.
 *
 * Con ella:
 *  - un aviso con «Aceptar» y «Rechazar» igual de fáciles (como pide la AEPD);
 *  - nada de Google hasta que se acepta (modo de consentimiento v2, «básico»);
 *  - con permiso, cada clic en una oferta («Ver en…», «Reservar») cuenta como conversión;
 *  - «Cookies» en el pie vuelve a abrir el aviso para cambiar de opinión.
 * La decisión se guarda en este navegador (localStorage), no en una cookie.
 */
(() => {
  const etiqueta = document.querySelector('meta[name="escapadas-google-ads"]');
  // El despliegue solo las pone con datos válidos (src/google-ads.js, src/travelpayouts-drive.js).
  const id = etiqueta?.content?.trim() || null;
  const scriptDrive = document.querySelector('meta[name="escapadas-drive"]')?.content?.trim() || null;
  if (!id && !scriptDrive) return;
  const conversion = etiqueta?.dataset.conversion?.trim() || null;
  const CLAVE = 'escapadas-cookies';

  // Qué se pide aceptar: lo que está instalado. Una decisión guardada solo vale si cubría todo
  // esto: quien aceptó Google Ads no ha aceptado Drive (se le vuelve a preguntar al añadirlo).
  const alcance = [id && 'google-ads', scriptDrive && 'travelpayouts-drive'].filter(Boolean);
  // Sin localStorage (bloqueado o lleno), sessionStorage: así la decisión sobrevive a la recarga
  // que hace falta para quitar Drive; sin ninguno, vale mientras dure la página.
  let decisionVisita = null;
  const almacenes = () => [globalThis.localStorage, globalThis.sessionStorage];
  const leer = () => {
    for (const almacen of almacenes()) {
      try {
        const guardada = JSON.parse(almacen.getItem(CLAVE));
        if (!guardada?.decision) continue;
        // Una de antes sin alcance era solo de Google Ads.
        const cubre = guardada.alcance ?? ['google-ads'];
        // Rechazar vale siempre; aceptar, solo para lo que se preguntó.
        if (guardada.decision === 'no' || alcance.every((a) => cubre.includes(a))) return guardada.decision;
        return null;
      } catch { /* bloqueado: el siguiente */ }
    }
    return decisionVisita;
  };
  const guardar = (decision) => {
    decisionVisita = decision;
    const valor = JSON.stringify({ decision, alcance, fecha: new Date().toISOString() });
    for (const almacen of almacenes()) {
      try { almacen.setItem(CLAVE, valor); return; } catch { /* modo privado: el siguiente */ }
    }
  };

  window.dataLayer = window.dataLayer || [];
  // gtag.js necesita el objeto `arguments`, no un array: así lo define Google.
  function gtag() { window.dataLayer.push(arguments); }
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });

  let cargado = false;
  let driveCargado = false;
  function activar() {
    // Drive: un solo script, el de su panel; convierte en enlaces de afiliado los de sus webs al pulsarlos.
    if (scriptDrive && !driveCargado && /^https:\/\//.test(scriptDrive)) {
      driveCargado = true;
      const drive = document.createElement('script');
      drive.async = true;
      drive.src = scriptDrive;
      document.head.append(drive);
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
    // Esta web no pone cookies propias (lo suyo va en localStorage): las que haya en este
    // dominio son de Google Ads o de Drive, y al rechazar se borran todas.
    const dominio = location.hostname.replace(/^www\./, '');
    for (const nombre of document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean)) {
      document.cookie = `${nombre}=; Max-Age=0; path=/; domain=.${dominio}`;
      document.cookie = `${nombre}=; Max-Age=0; path=/`;
    }
    // Drive ya cargado no se puede descargar: deja de estar al recargar la página.
    if (driveCargado) setTimeout(() => location.reload(), 300);
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
  const vigilarDialogos = new MutationObserver(() => {
    const caja = document.querySelector('.aviso-cookies');
    if (caja) colocar(caja);
  });

  function cerrarAviso(caja) {
    caja.remove();
    vigilarDialogos.disconnect();
    document.body.style.removeProperty('--alto-cookies');
  }

  function aviso() {
    document.querySelector('.aviso-cookies')?.remove();
    const caja = document.createElement('section');
    caja.className = 'aviso-cookies';
    caja.setAttribute('aria-label', 'Cookies');
    // Qué se acepta, dicho para cada caso: solo lo que de verdad está instalado.
    const para = [
      id && 'saber si alguien llegó por un anuncio nuestro y entró en una oferta (Google Ads)',
      scriptDrive && 'que algunos enlaces a webs de viajes sean de afiliado, sin cambiar tu precio (Travelpayouts)',
    ].filter(Boolean).join(' y ');
    caja.innerHTML = `<p><strong>¿Aceptas cookies de ${id && scriptDrive ? 'publicidad y afiliación' : id ? 'Google Ads' : 'afiliación'}?</strong> Solo sirven para ${para}.
      Sin ellas la web funciona igual. <a href="#/ayuda?seccion=privacidad">Más información</a></p>
      <div class="aviso-cookies__botones">
        <button type="button" class="boton" data-cookies="no">Rechazar</button>
        <button type="button" class="boton boton--tinta" data-cookies="si">Aceptar</button>
      </div>`;
    caja.addEventListener('click', (evento) => {
      const decision = evento.target.closest('[data-cookies]')?.dataset.cookies;
      if (!decision) return;
      guardar(decision);
      if (decision === 'si') activar(); else desactivar();
      cerrarAviso(caja);
    });
    colocar(caja);
    vigilarDialogos.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
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
    if (decision === 'si') activar();
    else if (decision === null) aviso();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
