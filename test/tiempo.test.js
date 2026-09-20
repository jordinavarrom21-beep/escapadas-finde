import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CODIGOS_TIEMPO, anadirTiempo, emojiTiempo, periodoViaje } from '../src/enriquecer/tiempo.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, crearCtx, leerFixtureJson, oferta } from './ayudas.js';

/** Respuesta real de Open-Meteo para Vielha y Sitges, del 18 de septiembre al 3 de octubre de 2026. */
const PREVISIONES = leerFixtureJson('tiempo-openmeteo.json');
/** Latitudes con las que se pidió la fixture, en ese orden. */
const COORDENADAS = ['42.7', '41.23'];
const FINDES = findesProximos(10, AHORA);
const VIELHA = { nombre: 'Vielha', lat: 42.6983, lon: 0.7936 };
const SITGES = { nombre: 'Sitges', lat: 41.2345, lon: 1.8062 };

/** Contexto con la fixture: devuelve las previsiones de las coordenadas pedidas, en el mismo orden. */
function contexto(opciones = {}) {
  const respuestas = (url) => new URL(url).searchParams.get('latitude').split(',').map((lat) => {
    const i = COORDENADAS.indexOf(lat);
    assert.ok(i >= 0, `la fixture no tiene la coordenada ${lat}`);
    return PREVISIONES[i];
  });
  const creado = crearCtx({ respuestas, ...opciones });
  creado.ctx.findes = FINDES;
  return creado;
}

describe('tiempo', () => {
  test('usa el sábado del finde asignado', async () => {
    const { ctx } = contexto();
    const o = oferta({ lugar: VIELHA, fechas: { findeId: '2026-09-25' } });
    await anadirTiempo([o], ctx);
    assert.deepEqual(o.tiempo, {
      dia: '2026-09-26', maxC: 29, minC: 12, lluviaPct: 6, codigo: 2, texto: 'parcialmente nublado',
    });
  });

  test('sin fechas usa el próximo fin de semana', async () => {
    const { ctx, peticiones } = contexto();
    const o = oferta({ lugar: SITGES });
    await anadirTiempo([o], ctx);
    assert.deepEqual(o.tiempo, {
      dia: '2026-09-19', maxC: 26, minC: 19, lluviaPct: 0, codigo: 3, texto: 'nublado',
    });
    assert.equal(peticiones.length, 1);
    assert.equal(new URL(peticiones[0]).searchParams.get('forecast_days'), '16');
  });

  test('con puente toma el día central', async () => {
    const puente = { id: '2026-09-24', nombre: 'La Mercè', desde: '2026-09-24', hasta: '2026-09-27' };
    const { ctx } = contexto();
    ctx.puentes = [puente];
    const o = oferta({ lugar: SITGES, fechas: { findeId: '2026-09-25', puenteId: puente.id } });
    assert.deepEqual(periodoViaje(o, ctx), { desde: '2026-09-24', hasta: '2026-09-27' });
    await anadirTiempo([o], ctx);
    assert.equal(o.tiempo.dia, '2026-09-25');
  });

  test('ignora las ofertas sin coordenadas y los findes fuera de la previsión', async () => {
    const { ctx, peticiones } = contexto();
    const sinLugar = oferta({ titulo: 'Descuento general de la web' });
    const lejana = oferta({ lugar: SITGES, fechas: { findeId: FINDES[4].id } });
    await anadirTiempo([sinLugar, lejana], ctx);
    assert.equal(sinLugar.tiempo, null);
    assert.equal(lejana.tiempo, null);
    assert.deepEqual(peticiones, []);
  });

  test('agrupa las coordenadas repetidas y reutiliza la caché', async () => {
    const { ctx, peticiones } = contexto();
    const a = oferta({ lugar: VIELHA });
    const b = oferta({ lugar: { ...VIELHA, lat: 42.7012, lon: 0.7948 } });
    const c = oferta({ lugar: SITGES });
    await anadirTiempo([a, b, c], ctx);
    assert.equal(peticiones.length, 1);
    assert.equal(new URL(peticiones[0]).searchParams.get('latitude'), '42.7,41.23');
    assert.deepEqual(a.tiempo, b.tiempo);
    await anadirTiempo([a, b, c], ctx);
    assert.equal(peticiones.length, 1, 'la segunda vez sale de la caché');
  });

  test('parte en lotes de 50 coordenadas con una pausa entre ellos', async () => {
    const daily = {
      time: ['2026-09-18', '2026-09-19'], weather_code: [0, 0],
      temperature_2m_max: [20, 20], temperature_2m_min: [10, 10], precipitation_probability_max: [0, 0],
    };
    const respuestas = (url) => new URL(url).searchParams.get('latitude').split(',').map(() => ({ daily }));
    const { ctx, peticiones, esperas } = contexto({ respuestas });
    const ofertas = Array.from({ length: 60 }, (_, i) => oferta({ lugar: { nombre: `Pueblo ${i}`, lat: 41 + i / 100, lon: 2 } }));
    await anadirTiempo(ofertas, ctx);
    assert.equal(peticiones.length, 2);
    assert.equal(new URL(peticiones[0]).searchParams.get('latitude').split(',').length, 50);
    assert.equal(new URL(peticiones[1]).searchParams.get('latitude').split(',').length, 10);
    assert.deepEqual(esperas, [1000]);
    assert.equal(ofertas.at(-1).tiempo.texto, 'despejado');
  });

  test('si Open-Meteo falla deja el campo como estaba y lo registra', async () => {
    const { ctx, logs } = contexto({ respuestas: () => { throw new Error('HTTP 503 en api.open-meteo.com'); } });
    const o = oferta({ lugar: SITGES });
    await anadirTiempo([o], ctx);
    assert.equal(o.tiempo, null);
    assert.match(logs[0], /previsión del tiempo/);
  });

  test('la tabla de códigos WMO cubre la fixture y emojiTiempo tiene respaldo', () => {
    for (const codigo of new Set(PREVISIONES.flatMap((p) => p.daily.weather_code))) {
      assert.ok(CODIGOS_TIEMPO[codigo], `falta el código WMO ${codigo}`);
    }
    assert.equal(CODIGOS_TIEMPO[95].texto, 'tormenta');
    assert.equal(CODIGOS_TIEMPO[45].texto, 'niebla');
    assert.equal(emojiTiempo(0), '☀️');
    assert.equal(emojiTiempo(61), '🌦️');
    assert.equal(emojiTiempo(123), '🌡️');
  });
});
