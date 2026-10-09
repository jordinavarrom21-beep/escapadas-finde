/**
 * Travelpayouts Drive, solo con permiso: sin «travelpayoutsDrive» en config/ajustes.json la web
 * queda como siempre; con él, la etiqueta que lee consentimiento.js (lo carga al aceptar las
 * cookies), la CSP abierta solo a Drive, las guías para buscadores con el mismo aviso y la
 * privacidad que lo explica.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AVISO_DRIVE } from '../site/js/formato.js';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { driveDeAjustes, ponerDrive, ponerDriveGuia, ponerGoogleAds, prepararWeb } from '../scripts/preparar-web.js';
import { normalizarDrive, problemasDrive } from '../src/drive.js';
import { validarAjustes } from '../src/ajustes.js';
import { generarPaginas } from '../src/paginas.js';
import { vistaAyuda } from '../site/js/vistas.js';
import { estadoPanel } from './ayudas-panel.js';

const INDICE = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const CONSENTIMIENTO = readFileSync(new URL('../site/js/consentimiento.js', import.meta.url), 'utf8');
const DRIVE = 'https://emrldco.com/NTgyMTQz.js?t=582143';
const ADS = { id: 'AW-123456789', conversion: 'AW-123456789/AbC-d_1' };
const csp = (html) => Object.fromEntries(html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1].split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
const datos = JSON.parse(readFileSync(new URL('./fixtures/panel-real/ofertas.json', import.meta.url), 'utf8'));
const unaGuia = () => generarPaginas(datos, { base: 'https://escapadasfinde.com/' }).archivos.find((a) => /^escapadas\/[^/]+\/index\.html$/.test(a.ruta));

describe('Travelpayouts Drive: la dirección del script', () => {
  it('vale la del código de Travelpayouts; vacío o sin poner, nada; otra cosa, error claro', () => {
    assert.equal(normalizarDrive(DRIVE), DRIVE);
    assert.equal(normalizarDrive(` ${DRIVE} `), DRIVE);
    for (const nada of [undefined, null, '']) {
      assert.deepEqual(problemasDrive(nada), []);
      assert.equal(normalizarDrive(nada), null);
    }
    for (const mal of ['http://emrldco.com/x.js', 'javascript:alert(1)', 'https://emrldco.com/x.php', 'https://emrldco.com/x.js?a="b"', 123]) {
      assert.equal(problemasDrive(mal).length, 1, String(mal));
      assert.equal(normalizarDrive(mal), null);
    }
  });

  it('la configuración la valida y la de config/ajustes.json es buena', () => {
    const ajustes = JSON.parse(readFileSync(new URL('../config/ajustes.json', import.meta.url), 'utf8'));
    assert.deepEqual(validarAjustes(ajustes), []);
    assert.deepEqual(validarAjustes({ ...ajustes, travelpayoutsDrive: '' }), []);
    assert.equal(validarAjustes({ ...ajustes, travelpayoutsDrive: 'emrldco.com/x.js' }).length, 1);
  });

  it('driveDeAjustes: vacío o sin el campo, null; bien, la dirección; mal escrita, error', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'drive-ajustes-'));
    const ruta = path.join(dir, 'ajustes.json');
    try {
      for (const [travelpayoutsDrive, esperado] of [[undefined, null], ['', null], [DRIVE, DRIVE]]) {
        writeFileSync(ruta, JSON.stringify({ travelpayoutsDrive }));
        assert.equal(driveDeAjustes(ruta), esperado);
      }
      writeFileSync(ruta, JSON.stringify({ travelpayoutsDrive: 'http://x.com/a.js' }));
      assert.throws(() => driveDeAjustes(ruta), /travelpayoutsDrive/);
      assert.equal(driveDeAjustes(path.join(dir, 'no-existe.json')), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Travelpayouts Drive en la portada (index.html)', () => {
  it('sin dirección válida no cambia nada', () => {
    for (const nada of [null, '', 'http://emrldco.com/x.js']) assert.equal(ponerDrive(INDICE, nada), INDICE);
  });

  it('con ella: la etiqueta y la CSP abierta a Drive (su script y sus llamadas), lo demás igual', () => {
    const html = ponerDrive(INDICE, DRIVE);
    assert.match(html, /<meta name="escapadas-drive" content="https:\/\/emrldco\.com\/NTgyMTQz\.js\?t=582143">/);
    // La dirección va en la etiqueta, no como <script>: lo carga consentimiento.js al aceptar.
    assert.doesNotMatch(html, /<script[^>]*emrldco/);
    const directivas = csp(html);
    assert.ok(directivas['script-src'].includes('https://emrldco.com'));
    // Sin esto, la consola decía «Unable to preload CSS for https://emrldco.com/assets/tooltip-….css».
    assert.ok(directivas['style-src'].includes('https://emrldco.com'), 'sus estilos');
    for (const origen of ['https://emrldco.com', 'https://mn-tz.com', 'https://emrld.cc', 'https://www.travelpayouts.com']) assert.ok(directivas['connect-src'].includes(origen), origen);
    assert.ok(directivas['script-src'].includes('https://cdnjs.cloudflare.com'));
    assert.ok(directivas['connect-src'].includes('https://photon.komoot.io'));
    assert.ok(!directivas['script-src'].includes("'unsafe-inline'"), 'sigue sin scripts en línea');
    assert.deepEqual(directivas['object-src'], ["'none'"]);
  });

  it('se puede repetir sin duplicar; cambiar de dirección cambia el origen; sin ella, la de antes', () => {
    const una = ponerDrive(INDICE, DRIVE);
    assert.equal(ponerDrive(una, DRIVE), una);
    const otra = ponerDrive(una, 'https://otro-cdn.com/a.js?t=1');
    assert.ok(csp(otra)['script-src'].includes('https://otro-cdn.com'));
    assert.ok(!csp(otra)['script-src'].includes('https://emrldco.com'));
    assert.ok(csp(otra)['style-src'].includes('https://otro-cdn.com') && !csp(otra)['style-src'].includes('https://emrldco.com'));
    assert.equal(ponerDrive(una, null), INDICE);
  });

  it('con Google Ads a la vez: cada uno se pone y se quita sin tocar al otro', () => {
    const las2 = ponerDrive(ponerGoogleAds(INDICE, ADS), DRIVE);
    assert.match(las2, /escapadas-google-ads/);
    assert.match(las2, /escapadas-drive/);
    const soloAds = ponerDrive(las2, null);
    assert.equal(soloAds, ponerGoogleAds(INDICE, ADS));
    assert.equal(ponerGoogleAds(soloAds, null), INDICE);
  });
});

describe('Travelpayouts Drive en las guías para buscadores', () => {
  it('la guía carga el aviso de cookies (consentimiento.js) con la ruta buena y la CSP lo deja', () => {
    const { ruta, contenido } = unaGuia();
    const html = ponerDriveGuia(contenido, DRIVE);
    const raiz = '../'.repeat(ruta.split('/').length - 1);
    assert.ok(html.includes(`<script src="${raiz}js/consentimiento.js" defer></script>\n</head>`));
    assert.match(html, /<meta name="escapadas-drive" content="https:\/\/emrldco\.com\//);
    const directivas = csp(html);
    assert.deepEqual(directivas['script-src'], ["'self'", 'https://emrldco.com']);
    assert.ok(directivas['connect-src'].includes('https://emrldco.com'));
    assert.ok(directivas['connect-src'].includes('https://www.travelpayouts.com'), 'su comprobación de dueño (editor visual)');
    // Las vistas previas de Drive traen sus estilos en línea; scripts en línea, ninguno.
    assert.deepEqual(directivas['style-src'], ["'self'", 'https://emrldco.com', "'unsafe-inline'"], 'sus estilos y los de sus previsualizaciones');
    assert.ok(!directivas['script-src'].includes("'unsafe-inline'"));
    // El mismo aviso que el pie del panel (un solo texto, AVISO_DRIVE).
    assert.ok(html.includes(`<a href="#" data-abrir-cookies>Cookies</a>. ${AVISO_DRIVE} No cambia tu precio ni el orden de las ofertas.</p>`));
    // Se puede repetir.
    assert.equal(ponerDriveGuia(html, DRIVE), html);
  });

  it('sin Drive la guía sigue sin JavaScript', () => {
    const { contenido } = unaGuia();
    assert.equal(ponerDriveGuia(contenido, null), contenido);
    assert.match(contenido, /script-src 'none'/);
  });

  it('prepararWeb lo pone en la portada y en todas las guías; sin Drive, en ninguna', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'drive-web-'));
    try {
      cpSync(new URL('../site/index.html', import.meta.url), path.join(dir, 'index.html'));
      const { ruta, contenido } = unaGuia();
      mkdirSync(path.dirname(path.join(dir, ruta)), { recursive: true });
      writeFileSync(path.join(dir, ruta), contenido);
      assert.deepEqual(prepararWeb({ dir }), []);
      assert.equal(readFileSync(path.join(dir, ruta), 'utf8'), contenido);
      assert.ok(prepararWeb({ dir, drive: DRIVE }).includes('Travelpayouts Drive con permiso (portada y 1 guías)'));
      assert.match(readFileSync(path.join(dir, 'index.html'), 'utf8'), /escapadas-drive/);
      assert.match(readFileSync(path.join(dir, ruta), 'utf8'), /js\/consentimiento\.js/);
      prepararWeb({ dir });
      assert.equal(readFileSync(path.join(dir, 'index.html'), 'utf8'), INDICE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('aviso de cookies con Drive (consentimiento.js)', () => {
  it('Drive solo se carga dentro de activar(), con la dirección de la etiqueta', () => {
    const activar = CONSENTIMIENTO.slice(CONSENTIMIENTO.indexOf('function activar('), CONSENTIMIENTO.indexOf('function retirar('));
    assert.match(activar, /if \(drive && acepta\.includes\('drive'\) && !activo\.has\('drive'\)\) \{/);
    assert.match(activar, /script\.src = drive;/);
    assert.equal(CONSENTIMIENTO.match(/script\.src = drive;/g).length, 1);
    assert.doesNotMatch(CONSENTIMIENTO, /emrldco/, 'la dirección sale de la etiqueta, no del código');
    assert.match(CONSENTIMIENTO, /if \(!id && !drive && !analitica\) return;/);
  });

  it('rechazar borra lo de Drive, y quien solo aceptó Google Ads vuelve a ver el aviso', () => {
    const retirar = CONSENTIMIENTO.slice(CONSENTIMIENTO.indexOf('function retirar('), CONSENTIMIENTO.indexOf('function colocar('));
    assert.match(retirar, /fuera\.includes\('drive'\) && 'am_user_session\$'/);
    assert.match(retirar, /emerald_\|mn:/);
    assert.match(retirar, /if \(fuera\.some\(\(clave\) => activo\.has\(clave\)\)\) location\.reload\(\);/);
    assert.match(CONSENTIMIENTO, /const preguntado = guardada\.para \?\? \['google-ads'\];/);
    assert.match(CONSENTIMIENTO, /if \(acepta\.length && !ALCANCE\.every\(\(a\) => preguntado\.includes\(a\)\)\) return eleccionVisita;/);
    assert.match(CONSENTIMIENTO, /JSON\.stringify\(\{ decision, para: ALCANCE, acepta,/);
  });

  it('el aviso pregunta por lo que hay: medición, Google Ads, afiliación o varias', () => {
    assert.match(CONSENTIMIENTO, /¿Aceptas cookies de \$\{enumerar\(FINALIDADES\.map\(\(f\) => f\.corto\)\)\}\?/);
    for (const corto of ['medición', 'Google Ads', 'afiliación']) assert.ok(CONSENTIMIENTO.includes(`corto: '${corto}'`), corto);
    // «Más información» lleva a la privacidad también desde las guías.
    assert.match(CONSENTIMIENTO, /href="\$\{raiz\}#\/ayuda\?seccion=privacidad"/);
  });

  it('la privacidad lo explica y deja cambiar de opinión', () => {
    const conDrive = vistaAyuda({ ...estadoPanel(), drive: true });
    assert.doesNotMatch(conDrive, /sin cookies/i);
    assert.match(conDrive, /Cookies de afiliación de Travelpayouts, solo si las aceptas/);
    assert.equal(conDrive.match(/data-abrir-cookies/g).length, 1);
    const las2 = vistaAyuda({ ...estadoPanel(), drive: true, googleAds: true });
    assert.match(las2, /Cookies de Google Ads, solo si las aceptas/);
    assert.match(las2, /Travelpayouts/);
    assert.equal(las2.match(/data-abrir-cookies/g).length, 1);
  });
});

describe('Drive y el aviso de enlaces de afiliado del pie', () => {
  it('con Drive, el pie no dice «ningún enlace es de afiliado»: dice qué enlaces pueden serlo', () => {
    const app = readFileSync(new URL('../site/js/app.js', import.meta.url), 'utf8');
    const pie = app.slice(app.indexOf('function pintarAvisoComercial()'), app.indexOf('\n}\n', app.indexOf('function pintarAvisoComercial()')));
    assert.match(pie, /const drive = DRIVE \?/);
    assert.match(pie, /proveedores\.length \|\| patrocinadas \|\| drive/);
    // El texto es AVISO_DRIVE, el mismo que el pie de las guías.
    assert.match(pie, /const drive = DRIVE \? `\$\{AVISO_DRIVE\} `/);
    assert.match(AVISO_DRIVE, /red de Travelpayouts/);
  });
});
