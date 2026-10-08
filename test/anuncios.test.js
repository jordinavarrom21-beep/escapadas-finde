/**
 * Google Ads con aviso de cookies: sin «googleAds» en config/ajustes.json la web queda como
 * siempre (sin cookies ni nada de Google); con él, la etiqueta que lee anuncios.js, la CSP
 * abierta solo a lo que necesita Google y la privacidad que lo explica.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { googleAdsDeAjustes, ponerGoogleAds, prepararWeb } from '../scripts/preparar-web.js';
import { normalizarGoogleAds } from '../src/google-ads.js';
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

  it('los espacios sobran; sin conversión vale (sin medir) y con la de otra cuenta, no', () => {
    assert.deepEqual(normalizarGoogleAds({ id: ' AW-1 ', conversion: ' AW-1/x ' }), { id: 'AW-1', conversion: 'AW-1/x' });
    assert.deepEqual(normalizarGoogleAds({ id: 'AW-1', conversion: '' }), { id: 'AW-1', conversion: null });
    assert.equal(normalizarGoogleAds({ id: 'AW-1', conversion: 'AW-2/x' }), null);
    assert.equal(normalizarGoogleAds({ id: 'AW-1', conversion: 123 }), null);
  });

  it('prepararWeb la pone en index.html y, sin ID, la quita de un despliegue anterior en la misma carpeta', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ads-'));
    try {
      cpSync(new URL('../site/index.html', import.meta.url), path.join(dir, 'index.html'));
      cpSync(new URL('../site/sw.js', import.meta.url), path.join(dir, 'sw.js'));
      assert.ok(prepararWeb({ dir, googleAds: ADS }).includes('Google Ads AW-123456789 con conversión'));
      assert.match(readFileSync(path.join(dir, 'index.html'), 'utf8'), /escapadas-google-ads/);
      assert.ok(prepararWeb({ dir, googleAds: { id: 'AW-123456789' } }).some((h) => /SIN conversión/.test(h)));
      prepararWeb({ dir, googleAds: null });
      assert.equal(readFileSync(path.join(dir, 'index.html'), 'utf8'), INDICE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('googleAdsDeAjustes: vacío o sin el campo, null; bien, el objeto; mal escrito, error claro', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ajustes-'));
    const ruta = path.join(dir, 'ajustes.json');
    try {
      for (const [googleAds, esperado] of [[undefined, null], [{ id: '', conversion: '' }, null], [ADS, ADS]]) {
        writeFileSync(ruta, JSON.stringify({ googleAds }));
        assert.deepEqual(googleAdsDeAjustes(ruta), esperado);
      }
      writeFileSync(ruta, JSON.stringify({ googleAds: { id: 'AW-1', conversion: 'AW-2/x' } }));
      assert.throws(() => googleAdsDeAjustes(ruta), /googleAds\.conversion/);
      writeFileSync(ruta, '{ roto');
      assert.throws(() => googleAdsDeAjustes(ruta));
      assert.equal(googleAdsDeAjustes(path.join(dir, 'no-existe.json')), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('la configuración valida el ID y que la conversión sea de esa cuenta', () => {
    const ajustes = JSON.parse(readFileSync(new URL('../config/ajustes.json', import.meta.url), 'utf8'));
    assert.deepEqual(validarAjustes({ ...ajustes, googleAds: ADS }), []);
    assert.equal(validarAjustes({ ...ajustes, googleAds: { id: 'G-1', conversion: '' } }).length, 1);
    assert.equal(validarAjustes({ ...ajustes, googleAds: { id: 'AW-1', conversion: 'AW-2/x' } }).length, 1);
    assert.equal(validarAjustes({ ...ajustes, googleAds: { id: 'AW-1', conversion: 123 } }).length, 1);
    assert.deepEqual(validarAjustes({ ...ajustes, googleAds: { id: ' AW-1 ', conversion: '' } }), []);
  });
});

describe('aviso de cookies (anuncios.js)', () => {
  const entre = (desde, hasta) => ANUNCIOS.slice(ANUNCIOS.indexOf(desde), ANUNCIOS.indexOf(hasta));
  it('nada de Google hasta aceptar: consentimiento denegado de serie y gtag.js solo dentro de activar()', () => {
    assert.match(ANUNCIOS, /gtag\('consent', 'default', \{ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' \}\)/);
    assert.match(entre('function cargarGtag(', 'function activar('), /googletagmanager\.com\/gtag\/js/);
    assert.equal(ANUNCIOS.match(/googletagmanager\.com\/gtag\/js/g).length, 1);
    // Se carga desde activar() y solo con el permiso de cada uno (Ads o la medición).
    const activar = entre('function activar(', 'function retirar(');
    assert.equal(ANUNCIOS.match(/cargarGtag\(/g).length, 3);
    assert.equal(activar.match(/cargarGtag\(/g).length, 2);
    assert.match(activar, /const anuncios = Boolean\(id && acepta\.includes\('google-ads'\)\);/);
  });
  it('«Rechazar» y «Aceptar» en el mismo aviso, y la conversión solo con permiso', () => {
    assert.match(ANUNCIOS, /data-cookies="no">Rechazar</);
    assert.match(ANUNCIOS, /data-cookies="si">Aceptar</);
    assert.match(ANUNCIOS, /conversion && activo\.has\('google-ads'\) && permitido\('google-ads'\)/);
    // Sin localStorage, la elección vale durante la visita.
    assert.match(ANUNCIOS, /eleccionVisita = acepta/);
  });
  it('con más de una finalidad, «Configurar»: una casilla por cada una, sin marcar de entrada', () => {
    assert.match(ANUNCIOS, /const variasFinalidades = FINALIDADES\.length > 1;/);
    assert.match(ANUNCIOS, /data-cookies="\$\{configurando \? 'guardar' : 'elegir'\}"/);
    assert.match(ANUNCIOS, /opciones\(anterior \?\? \[\]\)/);
    assert.match(ANUNCIOS, /acepta\.includes\(f\.clave\) \? ' checked' : ''/);
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

describe('aviso legal (LSSI) y responsable de la privacidad', () => {
  it('con los datos del dueño: titular, NIF, domicilio y contacto; sin ellos, no se enseña la identidad de nadie', async () => {
    const { legalParaPanel, problemasLegal } = await import('../src/legal.js');
    const legal = legalParaPanel({ titular: ' Ana Pérez ', nif: '12345678Z', domicilio: '', email: 'hola@escapadasfinde.com' });
    assert.deepEqual(legal, { titular: 'Ana Pérez', nif: '12345678Z', email: 'hola@escapadasfinde.com' });
    assert.equal(legalParaPanel({ titular: 'Ana', email: '' }), null);
    assert.equal(legalParaPanel(undefined), null);
    assert.equal(problemasLegal({ email: 'no-es-un-email' }).length, 1);
    const conDatos = vistaAyuda({ ...estadoPanel(), datos: { ...estadoPanel().datos, legal } });
    assert.match(conDatos, /id="aviso-legal"[^]*Ana Pérez<\/strong> · NIF 12345678Z[^]*mailto:hola@escapadasfinde\.com/);
    assert.match(conDatos, /Responsable: Ana Pérez/);
    const sinDatos = vistaAyuda(estadoPanel());
    assert.match(sinDatos, /id="aviso-legal"[^]*No vende viajes/);
    assert.doesNotMatch(sinDatos, /Titular:|Faltan tus datos/);
    assert.match(vistaAyuda({ ...estadoPanel(), propietario: true }), /Faltan tus datos/);
  });
  it('el pie enlaza al aviso legal', () => {
    assert.match(INDICE, /href="#\/ayuda\?seccion=aviso-legal">Aviso legal</);
  });
});

describe('lo que se publica no lleva datos privados ni dice qué webs se leen', () => {
  it('vigilados.json sale vacío y el .htaccess no sirve las instrucciones del zip', async () => {
    const { htaccess } = await import('../scripts/preparar-web.js');
    const dir = mkdtempSync(path.join(tmpdir(), 'privado-'));
    try {
      cpSync(new URL('../site/index.html', import.meta.url), path.join(dir, 'index.html'));
      cpSync(new URL('../site/sw.js', import.meta.url), path.join(dir, 'sw.js'));
      cpSync(new URL('./fixtures/panel/vigilados.json', import.meta.url), path.join(dir, 'data', 'vigilados.json'), { recursive: true });
      assert.ok(prepararWeb({ dir }).includes('avisos por email sin publicar'));
      assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'data', 'vigilados.json'), 'utf8')), { vigilados: [], privados: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.match(htaccess('https://escapadasfinde.com/'), /RewriteRule \^LEEME-HOSTINGER\\\.txt\$ - \[F,L\]/);
  });
  it('el pie no enlaza al estado de las webs salvo en modo propietario', () => {
    assert.match(INDICE, /id="estado-fuentes"[^>]*hidden/);
  });
});
