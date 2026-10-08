/**
 * Google Analytics 4, solo con permiso: sin «googleAnalytics» en config/ajustes.json la web queda
 * como siempre; con el ID de medición (G-…), la etiqueta que lee anuncios.js (lo carga al aceptar
 * la medición), la CSP abierta solo a Analytics, las guías con el mismo aviso, una visita por
 * sección del panel y la privacidad que lo explica.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { googleAnalyticsDeAjustes, ponerAnaliticaGuia, ponerDrive, ponerDriveGuia, ponerGoogleAds, ponerGoogleAnalytics, prepararWeb } from '../scripts/preparar-web.js';
import { normalizarGoogleAnalytics, problemasGoogleAnalytics } from '../src/google-analytics.js';
import { validarAjustes } from '../src/ajustes.js';
import { generarPaginas } from '../src/paginas.js';
import { vistaAyuda } from '../site/js/vistas.js';
import { estadoPanel } from './ayudas-panel.js';

const INDICE = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const ANUNCIOS = readFileSync(new URL('../site/js/anuncios.js', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../site/js/app.js', import.meta.url), 'utf8');
const GA = 'G-AB12CD34EF';
const ADS = { id: 'AW-123456789', conversion: 'AW-123456789/AbC-d_1' };
const DRIVE = 'https://emrldco.com/NTgyMTQz.js?t=582143';
const csp = (html) => Object.fromEntries(html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1].split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
const datos = JSON.parse(readFileSync(new URL('./fixtures/panel-real/ofertas.json', import.meta.url), 'utf8'));
const unaGuia = () => generarPaginas(datos, { base: 'https://escapadasfinde.com/' }).archivos.find((a) => /^escapadas\/[^/]+\/index\.html$/.test(a.ruta));
const veces = (texto, buscado) => texto.split(buscado).length - 1;

describe('Google Analytics 4: el ID de medición', () => {
  it('vale «G-» con letras y números; vacío o sin poner, nada; otra cosa, error claro', () => {
    assert.equal(normalizarGoogleAnalytics(GA), GA);
    assert.equal(normalizarGoogleAnalytics(` ${GA} `), GA);
    for (const nada of [undefined, null, '']) {
      assert.deepEqual(problemasGoogleAnalytics(nada), []);
      assert.equal(normalizarGoogleAnalytics(nada), null);
    }
    // El de Universal Analytics (UA-), el de Google Ads (AW-), minúsculas, demasiado corto o con
    // algo que rompería la etiqueta: error, no se publica.
    for (const mal of ['UA-12345-1', 'AW-123456789', 'g-ab12cd34ef', 'G-12', 'G-AB12"><script>', 123, {}]) {
      assert.equal(problemasGoogleAnalytics(mal).length, 1, String(mal));
      assert.equal(normalizarGoogleAnalytics(mal), null);
    }
  });

  it('la configuración lo valida y la de config/ajustes.json es buena', () => {
    const ajustes = JSON.parse(readFileSync(new URL('../config/ajustes.json', import.meta.url), 'utf8'));
    assert.deepEqual(validarAjustes(ajustes), []);
    assert.deepEqual(validarAjustes({ ...ajustes, googleAnalytics: GA }), []);
    assert.equal(validarAjustes({ ...ajustes, googleAnalytics: 'UA-1-1' }).length, 1);
  });

  it('googleAnalyticsDeAjustes: vacío o sin el campo, null; bien, el ID; mal escrito, error', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ga-ajustes-'));
    const ruta = path.join(dir, 'ajustes.json');
    try {
      for (const [googleAnalytics, esperado] of [[undefined, null], ['', null], [GA, GA]]) {
        writeFileSync(ruta, JSON.stringify({ googleAnalytics }));
        assert.equal(googleAnalyticsDeAjustes(ruta), esperado);
      }
      writeFileSync(ruta, JSON.stringify({ googleAnalytics: 'UA-1-1' }));
      assert.throws(() => googleAnalyticsDeAjustes(ruta), /googleAnalytics/);
      assert.equal(googleAnalyticsDeAjustes(path.join(dir, 'no-existe.json')), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Google Analytics en la portada (index.html)', () => {
  it('sin ID válido no cambia nada', () => {
    for (const nada of [null, '', 'UA-1-1']) assert.equal(ponerGoogleAnalytics(INDICE, nada), INDICE);
  });

  it('con él: la etiqueta y la CSP abierta a Analytics (gtag.js y los envíos de cada región), lo demás igual', () => {
    const html = ponerGoogleAnalytics(INDICE, GA);
    assert.match(html, /<meta name="escapadas-google-analytics" content="G-AB12CD34EF">/);
    // El ID va en la etiqueta, no como <script>: lo carga anuncios.js al aceptar.
    assert.doesNotMatch(html, /<script[^>]*googletagmanager/);
    const directivas = csp(html);
    assert.ok(directivas['script-src'].includes('https://*.googletagmanager.com'));
    for (const origen of ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com']) assert.ok(directivas['connect-src'].includes(origen), origen);
    assert.ok(directivas['img-src'].includes('https:'), 'sus píxeles ya caben');
    assert.ok(directivas['script-src'].includes('https://cdnjs.cloudflare.com'));
    assert.ok(!directivas['script-src'].includes("'unsafe-inline'"), 'sigue sin scripts en línea');
    assert.deepEqual(directivas['object-src'], ["'none'"]);
  });

  it('se puede repetir sin duplicar y, sin ID, vuelve a ser la de antes', () => {
    const una = ponerGoogleAnalytics(INDICE, GA);
    assert.equal(ponerGoogleAnalytics(una, GA), una);
    assert.equal(ponerGoogleAnalytics(una, null), INDICE);
  });

  it('con Google Ads y Drive a la vez: cada uno se pone y se quita sin tocar a los otros', () => {
    const sinGa = ponerDrive(ponerGoogleAds(INDICE, ADS), DRIVE);
    const las3 = ponerGoogleAnalytics(sinGa, GA);
    for (const etiqueta of ['escapadas-google-analytics', 'escapadas-google-ads', 'escapadas-drive']) assert.match(las3, new RegExp(etiqueta));
    assert.equal(ponerGoogleAnalytics(las3, null), sinGa);
    // Sin Google Ads, Analytics sigue pudiendo cargar gtag.js.
    const sinAds = ponerGoogleAds(las3, null);
    assert.ok(csp(sinAds)['script-src'].includes('https://*.googletagmanager.com'));
    assert.ok(!csp(sinAds)['script-src'].includes('https://www.googleadservices.com'));
    assert.equal(ponerGoogleAnalytics(sinAds, null), ponerDrive(INDICE, DRIVE));
  });
});

describe('Google Analytics en las guías para buscadores', () => {
  it('la guía carga el aviso de cookies y la CSP deja cargar gtag.js; se puede repetir', () => {
    const { ruta, contenido } = unaGuia();
    const html = ponerAnaliticaGuia(contenido, GA);
    const raiz = '../'.repeat(ruta.split('/').length - 1);
    assert.ok(html.includes(`<script src="${raiz}js/anuncios.js" defer></script>\n</head>`));
    assert.match(html, /<meta name="escapadas-google-analytics" content="G-AB12CD34EF">/);
    const directivas = csp(html);
    assert.deepEqual(directivas['script-src'], ["'self'", 'https://*.googletagmanager.com']);
    assert.ok(directivas['connect-src'].includes('https://*.google-analytics.com'));
    assert.match(html, / · <a href="#" data-abrir-cookies>Cookies<\/a>\.<\/p>\s*<\/footer>/);
    assert.equal(ponerAnaliticaGuia(html, GA), html);
    assert.equal(ponerAnaliticaGuia(contenido, null), contenido);
  });

  it('con Drive también: un solo anuncios.js y un solo «Cookies», en el orden que sea', () => {
    const { contenido } = unaGuia();
    for (const html of [ponerAnaliticaGuia(ponerDriveGuia(contenido, DRIVE), GA), ponerDriveGuia(ponerAnaliticaGuia(contenido, GA), DRIVE)]) {
      assert.equal(veces(html, 'js/anuncios.js'), 1);
      assert.equal(veces(html, 'data-abrir-cookies'), 1);
      assert.match(html, /escapadas-drive/);
      assert.match(html, /escapadas-google-analytics/);
      const directivas = csp(html);
      assert.ok(directivas['script-src'].includes('https://emrldco.com') && directivas['script-src'].includes('https://*.googletagmanager.com'));
      assert.equal(veces(html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1], 'connect-src'), 1);
    }
  });

  it('prepararWeb lo pone en la portada y en todas las guías; sin ID, en ninguna', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ga-web-'));
    try {
      cpSync(new URL('../site/index.html', import.meta.url), path.join(dir, 'index.html'));
      const { ruta, contenido } = unaGuia();
      mkdirSync(path.dirname(path.join(dir, ruta)), { recursive: true });
      writeFileSync(path.join(dir, ruta), contenido);
      assert.deepEqual(prepararWeb({ dir }), []);
      assert.ok(prepararWeb({ dir, googleAnalytics: GA }).includes(`Google Analytics ${GA} con permiso (portada y 1 guías)`));
      assert.match(readFileSync(path.join(dir, 'index.html'), 'utf8'), /escapadas-google-analytics/);
      assert.match(readFileSync(path.join(dir, ruta), 'utf8'), /escapadas-google-analytics/);
      prepararWeb({ dir });
      assert.equal(readFileSync(path.join(dir, 'index.html'), 'utf8'), INDICE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('la medición en la web (anuncios.js y app.js)', () => {
  const entre = (desde, hasta) => ANUNCIOS.slice(ANUNCIOS.indexOf(desde), ANUNCIOS.indexOf(hasta));

  it('Analytics solo con su permiso, sin la visita automática y nunca para quien administra la web', () => {
    const activar = entre('function activar(', 'function retirar(');
    assert.match(activar, /const medir = Boolean\(analitica && acepta\.includes\('analytics'\) && !esPropietario\(\)\);/);
    assert.match(activar, /analytics_storage: medir \? 'granted' : 'denied'/);
    assert.match(activar, /gtag\('config', analitica, \{ send_page_view: false \}\);/);
    assert.match(ANUNCIOS, /localStorage\.getItem\('escapadas:propietario'\) === '1'/);
  });

  it('una visita por sección del panel, sin filtros ni búsquedas en la dirección', () => {
    const visita = entre('function visita()', 'function cargarGtag(');
    assert.match(visita, /if \(!midiendo\(\)\) return;/);
    // Con la «?…» (utm_…, gclid…): sin ella, una campaña no se atribuye.
    assert.match(visita, /`\$\{location\.origin\}\$\{location\.pathname\}\$\{location\.search\}#\/\$\{vista\}`/);
    assert.match(visita, /if \(direccion === anterior\) return;/);
    assert.match(visita, /\.\.\.\(anterior \? \{ page_referrer: anterior \} : \{\}\)/);
    assert.match(ANUNCIOS, /window\.addEventListener\('escapadas:vista', visita\);/);
    // app.js avisa solo al cambiar de sección (filtrar no es otra visita).
    assert.match(APP, /if \(cambiaVista\) window\.dispatchEvent\(new CustomEvent\('escapadas:vista', \{ detail: vista \}\)\);/);
  });

  it('el clic en una oferta se mide con la web de destino, solo con permiso', () => {
    assert.match(ANUNCIOS, /if \(midiendo\(\)\) \{\n\s*gtag\('event', 'clic_oferta', \{ send_to: analitica, web: oferta\.dataset\.clic,/);
  });

  it('abrir, guardar, buscar y compartir: app.js lo avisa y solo se envía con permiso', () => {
    assert.match(ANUNCIOS, /window\.addEventListener\('escapadas:medir', \(\{ detail \}\) => \{\n\s*if \(midiendo\(\) && detail\?\.evento\)/);
    for (const evento of ["medir('ver_oferta'", "medir('guardar_oferta'", "medir('search', { search_term: q.slice(0, 80) })", "medir('share'"]) assert.ok(APP.includes(evento), evento);
    // De la oferta, nada personal: la web, qué es, dónde y el precio.
    assert.match(APP, /const datosOferta = \(o\) => \(\{ web: o\.fuente, tipo: o\.tipo, destino: o\.lugar\?\.nombre \?\? '',/);
  });

  it('dejar de aceptar la medición borra sus cookies (_ga…) y lo deniega', () => {
    const retirar = entre('function retirar(', 'function colocar(');
    assert.match(retirar, /fuera\.includes\('analytics'\) && '_ga'/);
    assert.match(retirar, /fuera\.includes\('analytics'\) \? \{ analytics_storage: 'denied' \} : \{\}/);
  });
});

describe('la privacidad con Google Analytics', () => {
  it('lo explica, sin decir «sin cookies», y deja cambiar de opinión una vez', () => {
    const conGa = vistaAyuda({ ...estadoPanel(), googleAnalytics: true });
    assert.doesNotMatch(conGa, /sin cookies/i);
    assert.match(conGa, /Cookies de medición de Google Analytics, solo si las aceptas/);
    assert.match(conGa, /lo que escribes en «Buscar»/);
    assert.match(conGa, /Los filtros que eliges no se envían/);
    assert.equal(veces(conGa, 'data-abrir-cookies'), 1);
    const las3 = vistaAyuda({ ...estadoPanel(), googleAnalytics: true, googleAds: true, drive: true });
    for (const texto of ['Google Analytics', 'Google Ads', 'Travelpayouts']) assert.ok(las3.includes(texto), texto);
    assert.equal(veces(las3, 'data-abrir-cookies'), 1);
    assert.match(las3, /Cambiar tu elección o elegir cuáles/);
  });
});
