import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { aplicarClasificacion, clasificar } from '../src/enriquecer/temas.js';
import { enlacesPara } from '../src/enriquecer/enlaces.js';
import { asignarFechas, calcularPuentes, obtenerFestivos } from '../src/enriquecer/festivos.js';
import { calcularCoche, distanciaKm, geolocalizar } from '../src/enriquecer/geo.js';
import { esChollazo, precioPorPersonaNoche, puntuar } from '../src/enriquecer/puntuacion.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, AJUSTES, crearCtx, leerFixtureJson, oferta } from './ayudas.js';

const ORIGEN = AJUSTES.origen;
const NAGER_2026 = leerFixtureJson('festivos-nager-2026-ES.json');

describe('temas', () => {
  test('detecta temas, régimen, noches y transporte en una escapada', () => {
    const o = oferta({ titulo: 'Hotel spa romántico en el Pirineo con media pensión', descripcion: '2 noches con circuito de aguas', lugar: { nombre: 'Vielha', pais: 'España' } });
    assert.deepEqual(clasificar(o), { temas: ['spa', 'romantico', 'rural'], regimen: 'media-pension', noches: 2, transporte: 'coche' });
  });

  test('no confunde palabras parecidas', () => {
    const o = oferta({ titulo: 'Maletas Samsonite y marcos de fotos', descripcion: 'España a buen precio' });
    assert.deepEqual(clasificar(o).temas, []);
  });

  test('vuelos: temas por destino y transporte avión', () => {
    const o = oferta({ tipo: 'vuelo', titulo: 'Palma', lugar: { nombre: 'Palma', pais: 'España' } });
    const { temas, transporte, noches } = clasificar(o);
    assert.ok(temas.includes('playa'));
    assert.equal(transporte, 'avion');
    assert.equal(noches, null);
  });

  test('islas: sin transporte en coche', () => {
    assert.equal(clasificar(oferta({ titulo: 'Hotel en Mallorca', lugar: { nombre: 'Cala Millor', pais: 'España' } })).transporte, null);
  });

  test('aplicarClasificacion respeta lo que dio la fuente y une temas', () => {
    const o = oferta({ titulo: 'Escapada con niños y todo incluido', temas: ['playa'], regimen: 'desayuno', noches: 3 });
    aplicarClasificacion(o);
    assert.deepEqual(o.temas, ['playa', 'familia']);
    assert.equal(o.regimen, 'desayuno');
    assert.equal(o.noches, 3);
  });
});

describe('enlaces', () => {
  test('vuelo con fechas: comparadores y alojamiento en esas fechas', () => {
    const o = oferta({
      tipo: 'vuelo', titulo: 'Roma', lugar: { nombre: 'Roma', iata: 'CIA' },
      fechas: { salida: '2026-10-16T18:00:00', vuelta: '2026-10-18T20:00:00' },
      vuelo: { origen: 'BCN', destino: 'CIA' },
    });
    const enlaces = enlacesPara(o, { origen: ORIGEN, ahora: AHORA });
    const porEtiqueta = Object.fromEntries(enlaces.map((e) => [e.etiqueta, e.url]));
    assert.equal(porEtiqueta['Comparar en Skyscanner'], 'https://www.skyscanner.es/transporte/vuelos/bcn/cia/261016/261018/?adultsv2=1');
    assert.equal(porEtiqueta['Comparar en KAYAK'], 'https://www.kayak.es/flights/BCN-CIA/2026-10-16/2026-10-18?sort=price_a');
    assert.match(porEtiqueta['Hoteles en Booking'], /ss=Roma&checkin=2026-10-16&checkout=2026-10-18/);
    assert.equal(porEtiqueta['Comparar en Trivago'], 'https://www.trivago.es/es/srl?search=200-25084;dr-20261016-20261018;rc-1-2');
    assert.ok(enlaces.length <= 6);
  });

  test('escapada sin fechas: próximo finde y ruta en coche', () => {
    const o = oferta({ titulo: 'Casa rural', lugar: { nombre: 'Taüll', lat: 42.52, lon: 0.85 }, transporte: 'coche' });
    const enlaces = enlacesPara(o, { origen: ORIGEN, ahora: AHORA });
    assert.match(enlaces.find((e) => e.etiqueta === 'Hoteles en Booking').url, /ss=Ta%C3%BCll&checkin=2026-09-18&checkout=2026-09-20/);
    assert.equal(enlaces.at(-1).url, 'https://www.google.com/maps/dir/?api=1&origin=41.3874,2.1686&destination=42.52,0.85&travelmode=driving');
  });

  test('oferta sin lugar: sin enlaces', () => {
    assert.deepEqual(enlacesPara(oferta({ titulo: 'Descuento general' }), { origen: ORIGEN, ahora: AHORA }), []);
  });
});

describe('festivos y puentes', () => {
  const ajustes = { ...AJUSTES, puentes: { comunidad: 'ES-CT', festivosLocales: [{ fecha: '2026-09-24', nombre: 'La Mercè (Barcelona)' }] } };

  test('obtenerFestivos filtra por comunidad, añade locales y usa la caché', async () => {
    const { ctx, peticiones } = crearCtx({ ajustes, respuestas: () => NAGER_2026 });
    const festivos = await obtenerFestivos(ctx, [2026]);
    const fechas = festivos.map((f) => f.fecha);
    assert.ok(fechas.includes('2026-09-11'), 'Diada (CT)');
    assert.ok(fechas.includes('2026-09-24'), 'La Mercè (local)');
    assert.ok(!fechas.includes('2026-03-19'), 'San José no es festivo en Cataluña');
    assert.equal(festivos.find((f) => f.fecha === '2026-10-12').ambito, 'nacional');
    await obtenerFestivos(ctx, [2026]);
    assert.equal(peticiones.length, 1);
  });

  test('si Nager.at falla usa los festivos locales', async () => {
    const { ctx, logs } = crearCtx({ ajustes, respuestas: () => { throw new Error('HTTP 503'); } });
    assert.deepEqual((await obtenerFestivos(ctx, [2026])).map((f) => f.fecha), ['2026-09-24']);
    assert.match(logs[0], /No se han podido actualizar los festivos de 2026/);
  });

  test('calcularPuentes con los casos reales de 2026', async () => {
    const { ctx } = crearCtx({ ajustes, respuestas: () => NAGER_2026 });
    const puentes = calcularPuentes(await obtenerFestivos(ctx, [2026]), { desde: '2026-09-18', hasta: '2026-12-31' });
    assert.deepEqual(puentes.map((p) => `${p.desde}/${p.hasta}`), [
      '2026-09-24/2026-09-27', '2026-10-10/2026-10-12', '2026-12-05/2026-12-08', '2026-12-25/2026-12-27',
    ]);
    const diciembre = puentes[2];
    assert.deepEqual(diciembre.diasPuente, ['2026-12-07']);
    assert.deepEqual(diciembre.salidas, ['2026-12-04', '2026-12-05']);
    assert.equal(diciembre.etiqueta, '5–8 dic');
    assert.deepEqual(puentes[0].diasPuente, ['2026-09-25']);
  });

  test('asignarFechas: finde, puente y etiquetas', () => {
    const findes = findesProximos(4, AHORA);
    const puentes = [{ id: '2026-10-10', desde: '2026-10-10', hasta: '2026-10-12', salidas: ['2026-10-09', '2026-10-10'] }];
    const vuelo = oferta({ tipo: 'vuelo', fechas: { salida: '2026-10-09T19:00:00', vuelta: '2026-10-12T21:00:00' } });
    assert.deepEqual(asignarFechas(vuelo, findes, puentes), { findeId: '2026-10-09', puenteId: '2026-10-10' });
    const escapada = oferta({ etiquetas: ['Puente de Octubre'] });
    assert.deepEqual(asignarFechas(escapada, findes, puentes), { findeId: null, puenteId: '2026-10-10' });
  });
});

describe('geo', () => {
  test('distanciaKm Barcelona–Girona ≈ 86 km', () => {
    assert.ok(Math.abs(distanciaKm(ORIGEN, { lat: 41.9794, lon: 2.8214 }) - 86) < 3);
  });

  test('geolocalizar usa Nominatim con pausas, caché y límite', async () => {
    const albarracin = leerFixtureJson('geo-nominatim-albarracin.json');
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: (url) => (url.includes('Albarrac') ? albarracin : []) });
    const ofertas = [
      oferta({ lugar: { nombre: 'Albarracín', pais: 'España' } }),
      oferta({ lugar: { nombre: 'Albarracín', pais: 'España' } }),
      oferta({ lugar: { nombre: 'Lugar inventado' } }),
      oferta({ lugar: { nombre: 'Otro lugar' } }),
    ];
    await geolocalizar(ofertas, ctx, { maxNuevas: 2 });
    assert.equal(peticiones.length, 2);
    assert.deepEqual(esperas, [1100]);
    assert.ok(Math.abs(ofertas[0].lugar.lat - 40.407) < 0.01);
    assert.equal(ofertas[1].lugar.lat, ofertas[0].lugar.lat);
    assert.equal(ofertas[2].lugar.lat ?? null, null);
    assert.equal(ctx.cache.obtener('geo:lugar inventado'), null);
    assert.match(logs[0], /1 lugares se geolocalizarán/);
  });

  test('calcularCoche con OSRM y estimación si falla', async () => {
    const osrm = { code: 'Ok', durations: [[0, 5400]], distances: [[0, 101000]] };
    const girona = oferta({ lugar: { nombre: 'Girona', lat: 41.98, lon: 2.82 }, transporte: 'coche' });
    const lejos = oferta({ lugar: { nombre: 'Moscú', lat: 55.75, lon: 37.62 } });
    const vuelo = oferta({ tipo: 'vuelo', lugar: { nombre: 'Girona', lat: 41.98, lon: 2.82 } });
    const { ctx, peticiones } = crearCtx({ respuestas: () => osrm });
    await calcularCoche([girona, lejos, vuelo], ctx);
    assert.equal(peticiones.length, 1);
    assert.match(peticiones[0], /table\/v1\/driving\/2\.1686,41\.3874;2\.82,41\.98\?sources=0/);
    assert.deepEqual([girona.cocheMin, girona.cocheKm, girona.cocheEstimado], [90, 101, false]);
    assert.equal(lejos.cocheMin, null);
    assert.equal(vuelo.cocheMin, null);

    const sinRed = oferta({ lugar: { nombre: 'Reus', lat: 41.15, lon: 1.11 } });
    const fallo = crearCtx({ respuestas: () => { throw new Error('HTTP 502'); } });
    await calcularCoche([sinRed], fallo.ctx);
    assert.equal(sinRed.cocheEstimado, true);
    assert.ok(sinRed.cocheMin > 60 && sinRed.cocheMin < 120);
  });
});

describe('puntuación', () => {
  test('precio por persona y noche', () => {
    assert.equal(precioPorPersonaNoche(oferta({ precio: 100, unidad: 'pp', noches: 2 })), 50);
    assert.equal(precioPorPersonaNoche(oferta({ precio: 80, unidad: 'noche' })), 40);
    assert.equal(precioPorPersonaNoche(oferta({ precio: 80, unidad: 'pp' })), null);
  });

  test('más barato y con más señales, más puntos; siempre entre 0 y 100', () => {
    const barato = oferta({ tipo: 'vuelo', precio: 30, unidad: 'i/v', minimoHistorico: true, vistaPrimera: AHORA.toISOString() });
    const caro = oferta({ tipo: 'vuelo', precio: 140, unidad: 'i/v', vistaPrimera: '2026-09-01T00:00:00Z' });
    const sinPrecio = oferta({ etiquetas: ['top-chollo'], vistaPrimera: AHORA.toISOString() });
    puntuar([barato, caro, sinPrecio], AJUSTES, { ahora: AHORA });
    assert.ok(barato.puntuacion > caro.puntuacion);
    assert.equal(barato.puntuacion, 70);
    assert.equal(caro.puntuacion, 0);
    assert.ok(sinPrecio.puntuacion <= 50);
  });

  test('esChollazo', () => {
    assert.equal(esChollazo(oferta({ tipo: 'vuelo', precio: 25, unidad: 'i/v' }), AJUSTES), true);
    assert.equal(esChollazo(oferta({ tipo: 'vuelo', precio: 25 }), AJUSTES), false);
    assert.equal(esChollazo(oferta({ etiquetas: ['error-tarifa'] }), AJUSTES), true);
    assert.equal(esChollazo(oferta({ precio: 40, unidad: 'pp', noches: 2 }), AJUSTES), true);
    assert.equal(esChollazo(oferta({ precio: 60, unidad: 'pp', noches: 2 }), AJUSTES), false);
  });
});
