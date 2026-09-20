import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { anadirEventos } from '../src/enriquecer/eventos.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, crearCtx, leerFixtureJson, oferta } from './ayudas.js';

/** Extracto real de la «Agenda cultural de Catalunya» para el 18/09–18/10 de 2026. */
const AGENDA = leerFixtureJson('eventos-agenda.json');
const FINDES = findesProximos(10, AHORA);
const SITGES = { nombre: 'Sitges', lat: 41.2345, lon: 1.8062 };
const VILANOVA = { nombre: 'Vilanova i la Geltrú', lat: 41.2241, lon: 1.7252 };
const MADRID = { nombre: 'Madrid', lat: 40.4168, lon: -3.7038 };

function contexto(opciones = {}) {
  const creado = crearCtx({ respuestas: () => AGENDA, ...opciones });
  creado.ctx.findes = FINDES;
  return creado;
}

describe('eventos', () => {
  test('asigna hasta 3 eventos del finde, del más cercano al más lejano', async () => {
    const { ctx, peticiones } = contexto();
    const o = oferta({ titulo: 'Hotel en Sitges', lugar: SITGES, fechas: { findeId: '2026-09-25' } });
    await anadirEventos([o], ctx);

    assert.equal(o.eventos.length, 3);
    assert.ok(o.eventos.every((e) => e.municipio === 'Sitges'));
    assert.ok(o.eventos.every((e) => e.fecha === '2026-09-25'), 'la fecha se recorta al inicio del finde');
    assert.ok(o.eventos.some((e) => e.nombre === "36è Festival L'Hora del Jazz"));
    assert.equal(o.eventos.find((e) => e.nombre.startsWith('Exposició "Absències')).url, 'https://museusdesitges.cat/ca');

    const consulta = new URL(peticiones[0]);
    assert.equal(`${consulta.origin}${consulta.pathname}`, 'https://analisi.transparenciacatalunya.cat/resource/rhpv-yr4f.json');
    assert.equal(consulta.searchParams.get('$where'),
      "data_inici <= '2026-10-18T23:59:59' AND data_fi >= '2026-09-18T00:00:00' AND latitud IS NOT NULL");
    assert.equal(consulta.searchParams.get('$limit'), '2000');
  });

  test('el municipio sale del identificador cuando falta la localidad', async () => {
    const { ctx } = contexto();
    const o = oferta({ titulo: 'Apartamento junto al mar', lugar: VILANOVA });
    await anadirEventos([o], ctx);
    assert.equal(o.eventos[0].municipio, 'Vilanova i la Geltru');
  });

  test('una sola descarga por ejecución y caché entre ejecuciones', async () => {
    const { ctx, peticiones } = contexto();
    const ofertas = [oferta({ lugar: SITGES }), oferta({ lugar: VILANOVA })];
    await anadirEventos(ofertas, ctx);
    assert.equal(peticiones.length, 1);
    assert.ok(ofertas.every((o) => o.eventos.length > 0));
    await anadirEventos(ofertas, ctx);
    assert.equal(peticiones.length, 1, 'la segunda vez sale de la caché');
  });

  test('no consulta nada fuera de Cataluña, sin coordenadas ni para findes lejanos', async () => {
    const { ctx, peticiones } = contexto();
    const fuera = oferta({ titulo: 'Hotel en Madrid', lugar: MADRID });
    const sinLugar = oferta({ titulo: 'Descuento general de la web' });
    const lejana = oferta({ lugar: SITGES, fechas: { findeId: FINDES[5].id } });
    await anadirEventos([fuera, sinLugar, lejana], ctx);
    assert.deepEqual(peticiones, []);
    for (const o of [fuera, sinLugar, lejana]) assert.deepEqual(o.eventos, []);
  });

  test('si el conjunto de datos ya no responde, avisa y deja los eventos como estaban', async () => {
    const { ctx, logs } = contexto({ respuestas: () => { throw new Error('HTTP 404 en analisi.transparenciacatalunya.cat'); } });
    const o = oferta({ lugar: SITGES, eventos: [{ nombre: 'De la ejecución anterior', fecha: '2026-09-19', url: null, municipio: 'Sitges' }] });
    await anadirEventos([o], ctx);
    assert.equal(o.eventos.length, 1);
    assert.match(logs[0], /Agenda cultural no disponible.*404/);
  });

  test('si la respuesta no es la esperada, tampoco rompe el escaneo', async () => {
    const { ctx, logs } = contexto({ respuestas: () => ({ error: true, message: 'Dataset not found' }) });
    const o = oferta({ lugar: SITGES });
    await anadirEventos([o], ctx);
    assert.deepEqual(o.eventos, []);
    assert.match(logs[0], /respuesta inesperada/);
  });
});
