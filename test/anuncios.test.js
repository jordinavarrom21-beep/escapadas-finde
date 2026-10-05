/**
 * Google Ads con aviso de cookies: sin «googleAds» en config/ajustes.json la web queda como
 * siempre (sin cookies ni nada de Google); con él, la etiqueta que lee anuncios.js, la CSP
 * abierta solo a lo que necesita Google y la privacidad que lo explica.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { googleAdsDeAjustes, normalizarGoogleAds, ponerGoogleAds, prepararWeb } from '../scripts/preparar-web.js';
import { validarAjustes } from '../src/ajustes.js';
import { vistaAyuda } from '../site/js/vistas.js';
import { estadoPanel } from './ayudas-panel.js';

const INDICE = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const ANUNCIOS = readFileSync(new URL('../site/js/anuncios.js', import.meta.url), 'utf8');
const ADS = { id: 'AW-123456789', conversion: 'AW-123456789/AbC-d_1' };
const csp = (html) => Object.fromEntries(html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1].split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));

describe('Google Ads en la web publicada', () => {
  it('sin ID válido no cambia nada: ni etiqueta ni CSP abierta a Google', () => {
    for (const nada of [null, {}, { id: '' }, { id: 'G-123' }, { id: 'AW-12ab' }]) {
      assert.equal(normalizarGoogleAds(nada), null);
      assert.equal(ponerGoogleAds(INDICE, nada), INDICE);
    }
  });

  it('con ID: la etiqueta con la conversión y la CSP abierta a Google Ads (script, llamadas y su iframe)', () => {
    const html = ponerGoogleAds(INDICE, ADS);
    assert.match(html, /<meta name="escapadas-google-ads" content="AW-123456789" data-conversion="AW-123456789\/AbC-d_1">/);
    const directivas = csp(html);
    assert.ok(directivas['script-src'].includes('https://www.googletagmanager.com'));
    assert.ok(directivas['connect-src'].includes('https://googleads.g.doubleclick.net'));
    assert.deepEqual(directivas['frame-src'].slice(0, 2), ["'self'", 'https://td.doubleclick.net']);
    // Lo que ya había sigue igual.
    assert.ok(directivas['script-src'].includes('https://cdnjs.cloudflare.com'));
    assert.ok(directivas['connect-src'].includes('https://router.project-osrm.org'));
    assert.deepEqual(directivas['object-src'], ["'none'"]);
  });

  it('se puede repetir sin duplicar y, al quitar el ID, la web vuelve a ser la de antes', () => {
    const una = ponerGoogleAds(INDICE, ADS);
    assert.equal(ponerGoogleAds(una, ADS), una);
    assert.equal(ponerGoogleAds(una, null), INDICE);
  });

  it('una conversión de otra cuenta no se usa (solo el ID)', () => {
    assert.deepEqual(normalizarGoogleAds({ id: 'AW-1', conversion: 'AW-2/x' }), { id: 'AW-1', conversion: null });
    assert.doesNotMatch(ponerGoogleAds(INDICE, { id: 'AW-1', conversion: 'AW-2/x' }), /data-conversion/);
  });

  it('prepararWeb la pone en index.html; config/ajustes.json trae «googleAds» vacío (sin Google Ads)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ads-'));
    try {
      cpSync(new URL('../site/index.html', import.meta.url), path.join(dir, 'index.html'));
      cpSync(new URL('../site/sw.js', import.meta.url), path.join(dir, 'sw.js'));
      const hecho = prepararWeb({ dir, googleAds: ADS });
      assert.ok(hecho.includes('Google Ads AW-123456789 con conversión'));
      assert.match(readFileSync(path.join(dir, 'index.html'), 'utf8'), /escapadas-google-ads/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(googleAdsDeAjustes(), null);
  });

  it('la configuración valida el ID y que la conversión sea de esa cuenta', () => {
    const ajustes = JSON.parse(readFileSync(new URL('../config/ajustes.json', import.meta.url), 'utf8'));
    assert.deepEqual(validarAjustes({ ...ajustes, googleAds: ADS }), []);
    assert.equal(validarAjustes({ ...ajustes, googleAds: { id: 'G-1', conversion: '' } }).length, 1);
    assert.equal(validarAjustes({ ...ajustes, googleAds: { id: 'AW-1', conversion: 'AW-2/x' } }).length, 1);
  });
});

describe('aviso de cookies (anuncios.js)', () => {
  it('nada de Google hasta aceptar: consentimiento denegado de serie y gtag.js solo dentro de activar()', () => {
    assert.match(ANUNCIOS, /gtag\('consent', 'default', \{ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'/);
    const activar = ANUNCIOS.slice(ANUNCIOS.indexOf('function activar()'), ANUNCIOS.indexOf('function desactivar()'));
    assert.match(activar, /googletagmanager\.com\/gtag\/js/);
    assert.equal(ANUNCIOS.match(/googletagmanager\.com\/gtag\/js/g).length, 1);
  });
  it('«Rechazar» y «Aceptar» en el mismo aviso, y la conversión solo con permiso', () => {
    assert.match(ANUNCIOS, /data-cookies="no">Rechazar</);
    assert.match(ANUNCIOS, /data-cookies="si">Aceptar</);
    assert.match(ANUNCIOS, /conversion && cargado && leer\(\) === 'si'/);
  });
  it('la página lo carga y el pie tiene dónde poner «Cookies»', () => {
    assert.match(INDICE, /<script src="js\/anuncios\.js" defer><\/script>/);
    assert.match(INDICE, /<span data-sin-cookies>Sin cookies ni seguimiento<\/span>/);
  });
  it('la privacidad dice la verdad en los dos casos', () => {
    assert.match(vistaAyuda(estadoPanel()), /Sin cuentas, sin cookies, sin publicidad y sin seguimiento/);
    const conAds = vistaAyuda({ ...estadoPanel(), googleAds: true });
    assert.doesNotMatch(conAds, /sin cookies/i);
    assert.match(conAds, /Cookies de Google Ads, solo si las aceptas/);
    assert.match(conAds, /data-abrir-cookies/);
  });
});
