/**
 * Travelpayouts Drive (config/ajustes.json → «travelpayoutsDrive»): sin script no cambia
 * nada; con él, la etiqueta, la CSP abierta solo a sus orígenes, carga solo con permiso y la
 * web dice que hay enlaces de afiliado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ponerDrive, ponerGoogleAds } from '../scripts/preparar-web.js';
import { normalizarDrive, problemasDrive } from '../src/travelpayouts-drive.js';
import { validarAjustes } from '../src/ajustes.js';
import { vistaAyuda } from '../site/js/vistas.js';
import { estadoPanel } from './ayudas-panel.js';

const INDICE = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const ANUNCIOS = readFileSync(new URL('../site/js/anuncios.js', import.meta.url), 'utf8');
const DRIVE = { script: 'https://emrldtp.example.com/NDU5.js?t=459609&x=1', dominiosExtra: ['https://tp.media'] };
const csp = (html) => Object.fromEntries(html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1].split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));

describe('Travelpayouts Drive', () => {
  it('validación: vacío o ausente vale; mal escrito, error claro', () => {
    assert.deepEqual(problemasDrive(undefined), []);
    assert.deepEqual(problemasDrive({ script: '', dominiosExtra: [] }), []);
    assert.equal(normalizarDrive({ script: '' }), null);
    assert.equal(problemasDrive({ script: 'http://inseguro.com/x.js' }).length, 1);
    assert.equal(problemasDrive({ script: 'javascript:alert(1)' }).length, 1);
    assert.equal(problemasDrive({ script: DRIVE.script, dominiosExtra: ['tp.media'] }).length, 1);
    assert.deepEqual(normalizarDrive(DRIVE).origenes, ['https://emrldtp.example.com', 'https://tp.media']);
    const ajustes = JSON.parse(readFileSync(new URL('../config/ajustes.json', import.meta.url), 'utf8'));
    assert.deepEqual(validarAjustes({ ...ajustes, travelpayoutsDrive: DRIVE }), []);
    assert.equal(validarAjustes({ ...ajustes, travelpayoutsDrive: { script: 'x' } }).length, 1);
  });

  it('sin script la página no cambia; con él, la etiqueta (escapada) y la CSP con sus orígenes', () => {
    assert.equal(ponerDrive(INDICE, null), INDICE);
    const html = ponerDrive(INDICE, DRIVE);
    assert.match(html, /<meta name="escapadas-drive" content="https:\/\/emrldtp\.example\.com\/NDU5\.js\?t=459609&amp;x=1" data-csp="script-src=https:\/\/emrldtp\.example\.com script-src=https:\/\/tp\.media connect-src=https:\/\/emrldtp\.example\.com connect-src=https:\/\/tp\.media">/);
    const d = csp(html);
    for (const directiva of ['script-src', 'connect-src']) assert.ok(d[directiva].includes('https://emrldtp.example.com'), directiva);
    assert.ok(d['img-src'].includes('https:') && !d['img-src'].includes('https://emrldtp.example.com'), 'img-src ya admite cualquier https');
    assert.ok(!d['frame-src']?.includes('https://tp.media'));
    assert.deepEqual(d['object-src'], ["'none'"]);
  });

  it('un origen que la CSP ya traía no se apunta como de Drive ni se quita al desactivarlo', () => {
    const conPhoton = ponerDrive(INDICE, { ...DRIVE, dominiosExtra: ['https://photon.komoot.io'] });
    assert.doesNotMatch(conPhoton.match(/data-csp="([^"]*)"/)[1], /connect-src=https:\/\/photon/);
    assert.equal(ponerDrive(conPhoton, null), INDICE);
    assert.ok(csp(ponerDrive(conPhoton, null))['connect-src'].includes('https://photon.komoot.io'));
  });

  it('el permiso dice qué cubre: quien aceptó solo Google Ads vuelve a ver el aviso con Drive', () => {
    assert.match(ANUNCIOS, /const alcance = \[id && 'google-ads', scriptDrive && 'travelpayouts-drive'\]/);
    assert.match(ANUNCIOS, /guardada\.alcance \?\? \['google-ads'\]/);
    assert.match(ANUNCIOS, /JSON\.stringify\(\{ decision, alcance,/);
    // Al rechazar se borran las cookies del dominio (la web no pone ninguna propia).
    const desactivar = ANUNCIOS.slice(ANUNCIOS.indexOf('function desactivar()'), ANUNCIOS.indexOf('function colocar('));
    assert.match(desactivar, /filter\(Boolean\)\)/);
  });

  it('se puede repetir y quitar, también junto a Google Ads', () => {
    const una = ponerDrive(INDICE, DRIVE);
    assert.equal(ponerDrive(una, DRIVE), una);
    assert.equal(ponerDrive(una, null), INDICE);
    const ambos = ponerGoogleAds(ponerDrive(INDICE, DRIVE), { id: 'AW-1', conversion: '' });
    assert.ok(csp(ambos)['script-src'].includes('https://www.googletagmanager.com') && csp(ambos)['script-src'].includes('https://emrldtp.example.com'));
    assert.equal(ponerGoogleAds(ponerDrive(ambos, null), null), INDICE);
  });

  it('el script solo se carga dentro de activar() (tras aceptar) y el aviso dice para qué', () => {
    const activar = ANUNCIOS.slice(ANUNCIOS.indexOf('function activar()'), ANUNCIOS.indexOf('function desactivar()'));
    assert.match(activar, /drive\.src = scriptDrive/);
    assert.equal(ANUNCIOS.match(/\.src = scriptDrive/g).length, 1);
    assert.match(ANUNCIOS, /if \(!id && !scriptDrive\) return;/);
    assert.match(ANUNCIOS, /algunos enlaces a webs de viajes sean de afiliado/);
  });

  it('la privacidad lo cuenta solo si está', () => {
    assert.doesNotMatch(vistaAyuda(estadoPanel()), /Travelpayouts/);
    const conDrive = vistaAyuda({ ...estadoPanel(), drive: true });
    assert.match(conDrive, /Enlaces de afiliado de Travelpayouts, solo si aceptas las cookies/);
    assert.doesNotMatch(conDrive, /sin cookies/i);
  });
});
