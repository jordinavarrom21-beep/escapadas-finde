/**
 * Auditoría de octubre de 2026: un test por cada fallo de la web que se ha corregido y se puede
 * probar sin navegador (lo demás está en pruebas-navegador/funcional.mjs). Todos fallan sin su
 * arreglo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import * as local from '../site/js/local.js';
import { contenidoFicha } from '../site/js/plantillas-ficha.js';
import { enlaceOferta, tarjeta } from '../site/js/plantillas.js';
import { vistaComparar } from '../site/js/vistas.js';
import { estadoPanel } from './ayudas-panel.js';
import { oferta } from './ayudas.js';

const ctx = { temas: new Map(), fuentes: new Map(), favoritos: new Set() };

/** localStorage/sessionStorage en memoria, con removeItem como el de verdad. */
function almacen() {
  const datos = new Map();
  return { datos, getItem: (k) => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k) };
}

describe('auditoría de octubre: web', () => {
  test('cargar una copia sustituye lo de este navegador: lo que la copia no trae se borra', () => {
    globalThis.localStorage = almacen();
    globalThis.sessionStorage = almacen();
    local.guardarFavoritos(new Set(['de-aqui']));
    local.guardarFiltros('escapadas', { temas: 'spa' });
    const copia = { formato: 'escapadas-finde/guardados', datos: { 'escapadas:filtros': JSON.stringify({ escapadas: { temas: 'playa' } }) } };
    local.importarGuardados(copia);
    assert.deepEqual([...local.cargarFavoritos()], [], 'la copia no tenía favoritos');
    assert.deepEqual(local.cargarFiltros('escapadas'), { temas: 'playa' });
  });

  test('la ficha dice el día de publicación de Madrid (publicada a las 00:30 es de ese día, no del anterior)', () => {
    const html = contenidoFicha(oferta({ publicada: '2026-10-13T22:30:00Z' }), ctx);
    assert.match(html, /Publicada<\/dt>\s*<dd>mié 14 oct/);
  });

  test('«Ver oferta» admite la clase del botón (la de siempre si no se dice)', () => {
    const o = oferta({ url: 'https://www.weekendesk.es/x' });
    assert.match(enlaceOferta(o, 'Ver oferta', ctx, 'boton boton--primario boton--mini'), /^<a class="boton boton--primario boton--mini" /);
    assert.match(enlaceOferta(o, 'Ver oferta', ctx), /^<a class="boton boton--primario" /);
  });

  test('el enlace a la misma oferta en otra web se mide como los demás (data-clic)', () => {
    const otra = oferta({ fuente: 'nomolesten', url: 'https://nomolesten.com/a', precio: 120, unidad: 'noche' });
    const o = oferta({ fuente: 'weekendesk', tipo: 'hotel', url: 'https://www.weekendesk.es/b', precio: 100, unidad: 'noche', equivalentes: [{ id: otra.id, fuente: 'nomolesten', precio: 120, unidad: 'noche', url: otra.url }] });
    const html = tarjeta(o, { ...ctx, porId: new Map([[otra.id, otra]]) });
    assert.match(html, /<a href="https:\/\/nomolesten\.com\/a"[^>]* data-clic="nomolesten" data-clic-tipo="normal" data-clic-oferta="hotel">/);
  });

  test('«Comparar»: el botón de cada oferta es el de la tarjeta (enlace de reserva, rel y data-clic)', () => {
    const e = estadoPanel();
    const [o] = e.datos.ofertas.filter((x) => x.tipo === 'hotel' && /^https:/.test(x.url));
    const reserva = { ...o, urlReserva: `${o.url}${o.url.includes('?') ? '&' : '?'}aid=123`, afiliado: 'prueba' };
    const html = vistaComparar({ ...e, porId: new Map([[o.id, reserva]]), comparar: new Set([o.id]) }, {});
    const boton = html.match(/<a class="boton boton--primario boton--mini"[^>]*>/)?.[0] ?? '';
    assert.ok(boton.includes(`href="${reserva.urlReserva.replace(/&/g, '&amp;')}"`), boton);
    assert.match(boton, /rel="sponsored noopener"/);
    assert.match(boton, /data-clic="/);
  });
});

// ── Service worker (site/sw.js) en una máquina virtual con su caché y su red falsas ──────────

const ORIGEN = 'https://escapadasfinde.com';
const claveDe = (x) => (typeof x === 'string' ? x : x.url);

class CacheFalsa {
  constructor() { this.datos = new Map(); }
  async match(x, { ignoreSearch = false } = {}) {
    if (!ignoreSearch) return this.datos.get(claveDe(x));
    const sin = (u) => u.split('?')[0];
    return [...this.datos].find(([k]) => sin(k) === sin(claveDe(x)))?.[1];
  }
  async put(x, respuesta) { this.datos.set(claveDe(x), respuesta); }
  async delete(x) { return this.datos.delete(claveDe(x)); }
  async keys() { return [...this.datos.keys()].map((url) => ({ url })); }
  async addAll() {}
}

function cargarSw(red) {
  const oyentes = {};
  const almacenes = new Map();
  const caches = {
    open: async (nombre) => { if (!almacenes.has(nombre)) almacenes.set(nombre, new CacheFalsa()); return almacenes.get(nombre); },
    keys: async () => [...almacenes.keys()],
    delete: async (nombre) => almacenes.delete(nombre),
  };
  const self = { addEventListener: (tipo, fn) => { oyentes[tipo] = fn; }, location: { origin: ORIGEN }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const contexto = {
    self, caches, URL, Request: class { constructor(url) { this.url = url; } }, console: { warn: () => {} },
    fetch: async (peticion) => red(peticion), setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
  };
  vm.runInNewContext(readFileSync(new URL('../site/sw.js', import.meta.url), 'utf8'), contexto);
  const evento = (extra) => { const esperas = []; let respuesta; return { ...extra, waitUntil: (p) => esperas.push(p), respondWith: (p) => { respuesta = p; }, esperas, get respuesta() { return respuesta; } }; };
  return {
    almacenes,
    async pedir(url, mode = 'navigate') {
      const e = evento({ request: { url: `${ORIGEN}${url}`, mode, method: 'GET' } });
      oyentes.fetch(e);
      const respuesta = await e.respuesta;
      await Promise.allSettled(e.esperas);
      return respuesta;
    },
    async activar() { const e = evento({}); oyentes.activate(e); await Promise.all(e.esperas); },
  };
}

const respuesta = (status, cuerpo = '') => new Response(cuerpo, { status });

describe('auditoría de octubre: service worker', () => {
  test('una guía se guarda una sola vez, sin «?utm…», y sin red se enseña aunque se entre con otro «?…»', async () => {
    let conRed = true;
    const sw = cargarSw(() => (conRed ? respuesta(200, 'guía') : Promise.reject(new TypeError('sin red'))));
    await sw.pedir('/escapadas/spa/?utm_source=boletin');
    assert.deepEqual([...sw.almacenes.get('escapadas-datos').datos.keys()], [`${ORIGEN}/escapadas/spa/`]);
    conRed = false;
    assert.equal(await (await sw.pedir('/escapadas/spa/?gclid=abc')).text(), 'guía');
  });

  test('una guía retirada (404 o redirección) deja de enseñarse: se borra su copia', async () => {
    for (const retirada of [respuesta(404, 'no está'), { type: 'opaqueredirect', status: 0, ok: false }]) {
      let viva = true;
      const sw = cargarSw(() => (viva ? respuesta(200, 'guía') : retirada));
      await sw.pedir('/escapadas/spa/');
      viva = false;
      assert.equal(await sw.pedir('/escapadas/spa/'), retirada);
      assert.equal(sw.almacenes.get('escapadas-datos').datos.size, 0);
    }
  });

  test('un 404 de los datos (a medio publicar) no borra la copia: se sigue usando', async () => {
    let bien = true;
    const sw = cargarSw(() => (bien ? respuesta(200, '{"ofertas":[]}') : respuesta(404)));
    await sw.pedir('/data/ofertas.json', 'cors');
    bien = false;
    assert.equal(await (await sw.pedir('/data/ofertas.json', 'cors')).text(), '{"ofertas":[]}');
  });

  test('al activarse, borra las copias de guías guardadas con «?…» de versiones anteriores', async () => {
    const sw = cargarSw(() => respuesta(200));
    const datos = new CacheFalsa();
    sw.almacenes.set('escapadas-datos', datos);
    sw.almacenes.set('escapadas-interfaz-vieja', new CacheFalsa());
    await datos.put(`${ORIGEN}/escapadas/spa/?utm_source=x`, respuesta(200));
    await datos.put(`${ORIGEN}/escapadas/spa/`, respuesta(200));
    await sw.activar();
    assert.deepEqual([...datos.datos.keys()], [`${ORIGEN}/escapadas/spa/`]);
    assert.ok(!sw.almacenes.has('escapadas-interfaz-vieja'));
  });
});
