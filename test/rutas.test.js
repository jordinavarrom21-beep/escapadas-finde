/**
 * Desde una salida que no es el origen del escaneo, km y minutos reales por carretera (OSRM),
 * pedidos por lotes, guardados en el navegador y usados en distancias y coste.
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LOTE_RUTAS, URL_OSRM, clavePunto, destinosSinRuta, pedirRutas } from '../site/js/rutas.js';
import { medirDistancias } from '../site/js/filtros.js';

const ORIGEN = { nombre: 'Barcelona', lat: 41.3874, lon: 2.1686 };
const GIRONA = { nombre: 'Girona', lat: 41.9794, lon: 2.8214 };
const oferta = (id, lat, lon, extra = {}) => ({ id, tipo: 'hotel', lugar: { nombre: id, lat, lon }, ...extra });
const OFERTAS = [
  oferta('tarragona', 41.1189, 1.2445),
  oferta('tarragona-2', 41.1189, 1.2445),
  oferta('soller', 39.766, 2.715),
  oferta('vuelo', 40.4, -3.7, { tipo: 'vuelo' }),
];

describe('rutas desde tu salida', () => {
  it('pide solo los destinos distintos a los que se va en coche (ni islas ni vuelos ni lo ya sabido)', () => {
    const distancias = medirDistancias(OFERTAS, GIRONA, ORIGEN);
    const faltan = destinosSinRuta(OFERTAS, distancias, GIRONA);
    assert.deepEqual([...faltan.keys()], ['41.119,1.244']);
    assert.equal(destinosSinRuta(OFERTAS, distancias, GIRONA, new Map([['41.119,1.244', { min: 1, km: 1 }]])).size, 0);
  });

  it('pregunta a OSRM por lotes con pausa y lee minutos y km', async () => {
    const destinos = new Map(Array.from({ length: LOTE_RUTAS + 2 }, (_, i) => [`d${i}`, { lat: 41 + i / 1000, lon: 1 }]));
    const pedidas = [];
    const esperas = [];
    const rutas = await pedirRutas(GIRONA, destinos, {
      pedir: async (url) => {
        pedidas.push(url);
        const n = url.split('?')[0].split(';').length - 1;
        return { code: 'Ok', durations: [[0, ...Array(n).fill(9000)]], distances: [[0, ...Array(n).fill(163400)]] };
      },
      esperar: async (ms) => { esperas.push(ms); },
    });
    assert.equal(pedidas.length, 2);
    assert.ok(pedidas[0].startsWith(`${URL_OSRM}2.82140,41.97940;`));
    assert.match(pedidas[0], /\?sources=0&annotations=duration,distance$/);
    assert.deepEqual(esperas, [1100]);
    assert.equal(rutas.size, LOTE_RUTAS + 2);
    assert.deepEqual(rutas.get('d0'), { min: 150, km: 163 });
  });

  it('un lote que falla se salta: esas siguen estimadas', async () => {
    const rutas = await pedirRutas(GIRONA, new Map([['a', { lat: 41, lon: 1 }]]), { pedir: async () => { throw new Error('sin red'); } });
    assert.equal(rutas.size, 0);
  });

  it('con rutas, la distancia desde tu salida es la de carretera y deja de ser estimada', () => {
    const rutas = new Map([[clavePunto(OFERTAS[0].lugar), { min: 150, km: 163 }]]);
    const d = medirDistancias(OFERTAS, GIRONA, ORIGEN, rutas).get('tarragona');
    assert.deepEqual([d.kmCoche, d.minutos, d.estimado], [163, 150, false]);
    const sin = medirDistancias(OFERTAS, GIRONA, ORIGEN).get('tarragona');
    assert.equal(sin.kmCoche, null);
    assert.equal(sin.estimado, true);
    assert.equal(medirDistancias(OFERTAS, GIRONA, ORIGEN, rutas).get('soller').minutos, null, 'a la isla, ni con rutas');
  });
});

describe('rutas guardadas en el navegador', () => {
  beforeEach(() => {
    const almacen = new Map();
    globalThis.localStorage = { getItem: (k) => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v)) };
  });

  it('se recuperan para la misma salida, no para otra ni pasado un mes', async () => {
    const { cargarRutas, guardarRutas } = await import('../site/js/local.js');
    const hoy = new Date('2026-10-01T10:00:00Z');
    guardarRutas('41.979,2.821', new Map([['41.119,1.244', { min: 150, km: 163 }]]), hoy);
    assert.deepEqual([...cargarRutas('41.979,2.821', hoy)], [['41.119,1.244', { min: 150, km: 163 }]]);
    assert.equal(cargarRutas('40.000,1.000', hoy).size, 0);
    assert.equal(cargarRutas('41.979,2.821', new Date('2026-11-05T10:00:00Z')).size, 0);
  });
});
