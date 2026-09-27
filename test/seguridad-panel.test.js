import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { leerFiltrosEscapadas, leerRuta } from '../site/js/filtros.js';
import { CHART, LEAFLET } from '../site/js/cdn.js';

const SITE = new URL('../site/', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, SITE), 'utf8');
const INDEX = leer('index.html');
const JS = Object.fromEntries(readdirSync(new URL('js/', SITE)).filter((a) => a.endsWith('.js')).map((a) => [a, leer(`js/${a}`)]));

/** Directivas de la CSP del index.html: {'script-src': ['self', ...], ...}. */
function csp() {
  const meta = INDEX.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta, 'index.html debe llevar una CSP');
  return Object.fromEntries(meta[1].split(';').map((d) => d.trim().split(/\s+/)).map(([nombre, ...valores]) => [nombre, valores]));
}

describe('panel: el punto de búsqueda que llega en la URL', () => {
  const filtros = (hash) => leerFiltrosEscapadas(leerRuta(hash).params);

  it('no deja pasar marcas HTML en el nombre del lugar', () => {
    const { punto } = filtros('#/mapa?lat=41.39&lon=2.17&lugar=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E');
    assert.equal(punto.nombre, 'img src=x onerror=alert(document.domain)');
    assert.doesNotMatch(punto.nombre, /[<>]/);
  });

  it('recorta los nombres larguísimos y usa uno por defecto si queda vacío', () => {
    assert.equal(filtros(`#/escapadas?lat=41&lon=2&lugar=${'a'.repeat(500)}`).punto.nombre.length, 80);
    assert.equal(filtros('#/escapadas?lat=41&lon=2&lugar=%3C%3E').punto.nombre, 'Punto elegido');
  });

  it('descarta coordenadas imposibles en vez de pintar un punto fuera del mundo', () => {
    assert.equal(filtros('#/escapadas?lat=999&lon=2').punto, null);
    assert.equal(filtros('#/escapadas?lat=41&lon=-181').punto, null);
    assert.deepEqual(filtros('#/escapadas?lat=-90&lon=180&lugar=Polo').punto, { nombre: 'Polo', lat: -90, lon: 180 });
  });

  it('el tooltip del mapa se escapa (Leaflet lo inserta con innerHTML)', () => {
    const llamadas = [...JS['mapa.js'].matchAll(/\.bindTooltip\(([^)]*)/g)].map(([, argumento]) => argumento);
    assert.ok(llamadas.length > 0);
    for (const argumento of llamadas) assert.match(argumento, /^escaparHtml\(/, `bindTooltip(${argumento})`);
  });
});

describe('panel: política de seguridad de contenidos (CSP)', () => {
  it('no permite scripts en línea ni de hosts cualquiera', () => {
    const { 'script-src': scripts, 'object-src': objetos, 'base-uri': base } = csp();
    assert.ok(!scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"));
    assert.ok(!scripts.some((s) => s === 'https:' || s === '*'));
    assert.deepEqual(objetos, ["'none'"]);
    assert.deepEqual(base, ["'self'"]);
  });

  it('el index.html no tiene scripts en línea (la CSP los bloquearía)', () => {
    for (const [, atributos] of INDEX.matchAll(/<script([^>]*)>/g)) assert.match(atributos, /\ssrc="/, `<script${atributos}>`);
    assert.doesNotMatch(INDEX, /\son[a-z]+="/, 'nada de manejadores onclick="…"');
  });

  it('permite exactamente los hosts que usa el panel', () => {
    const directivas = csp();
    const host = (url) => new URL(url).origin;
    for (const url of [LEAFLET.js.url, CHART.url]) assert.ok(directivas['script-src'].includes(host(url)), url);
    assert.ok(directivas['style-src'].includes(host(LEAFLET.css.url)));
    const conexiones = new Set(Object.values(JS).flatMap((codigo) => [...codigo.matchAll(/fetch\(\s*['"`](https:\/\/[^/'"`]+)/g)].map(([, origen]) => origen)));
    const photon = JS['geo.js'].match(/https:\/\/photon\.komoot\.io/)?.[0];
    assert.ok(photon, 'geo.js usa Photon para buscar lugares');
    for (const origen of [...conexiones, photon]) assert.ok(directivas['connect-src'].includes(origen), origen);
  });
});
