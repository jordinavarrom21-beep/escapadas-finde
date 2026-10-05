/**
 * Google Ads, solo con permiso: el despliegue (scripts/preparar-web.js) pone la etiqueta
 * <meta name="escapadas-google-ads"> con el ID de la cuenta (AW-…) y la conversión
 * (AW-…/etiqueta) si están en config/ajustes.json («googleAds»). Sin ella, este archivo no
 * hace nada: ni aviso de cookies ni nada de Google.
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
  const id = etiqueta?.content?.trim();
  if (!id || !/^AW-\d+$/.test(id)) return;
  const conversion = etiqueta.dataset.conversion?.trim() || null;
  const CLAVE = 'escapadas-cookies';

  const leer = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE))?.decision ?? null; } catch { return null; }
  };
  const guardar = (decision) => {
    try { localStorage.setItem(CLAVE, JSON.stringify({ decision, fecha: new Date().toISOString() })); } catch { /* modo privado */ }
  };

  window.dataLayer = window.dataLayer || [];
  // gtag.js necesita el objeto `arguments`, no un array: así lo define Google.
  function gtag() { window.dataLayer.push(arguments); }
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });

  let cargado = false;
  function activar() {
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
    gtag('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    // Las cookies de Google Ads que ya hubiera en este dominio.
    const dominio = location.hostname.replace(/^www\./, '');
    for (const nombre of document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^(_gcl_|_ga)/.test(n))) {
      document.cookie = `${nombre}=; Max-Age=0; path=/; domain=.${dominio}`;
      document.cookie = `${nombre}=; Max-Age=0; path=/`;
    }
  }

  function aviso() {
    document.querySelector('.aviso-cookies')?.remove();
    const caja = document.createElement('section');
    caja.className = 'aviso-cookies';
    caja.setAttribute('aria-label', 'Cookies');
    caja.innerHTML = `<p><strong>¿Aceptas cookies de Google Ads?</strong> Solo sirven para saber si alguien llegó por un anuncio
      nuestro y entró en una oferta. Sin ellas la web funciona igual. <a href="#/ayuda?seccion=privacidad">Más información</a></p>
      <div class="aviso-cookies__botones">
        <button type="button" class="boton" data-cookies="no">Rechazar</button>
        <button type="button" class="boton boton--tinta" data-cookies="si">Aceptar</button>
      </div>`;
    caja.addEventListener('click', (evento) => {
      const decision = evento.target.closest('[data-cookies]')?.dataset.cookies;
      if (!decision) return;
      guardar(decision);
      if (decision === 'si') activar(); else desactivar();
      caja.remove();
    });
    document.body.append(caja);
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
