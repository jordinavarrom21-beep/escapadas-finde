import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { anadirEventos, nombreDeSlug } from '../src/enriquecer/eventos.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, crearCtx, leerFixtureJson, oferta } from './ayudas.js';

/** Extracto real de la «Agenda cultural de Catalunya» para el 18/09–18/10 de 2026. */
const AGENDA = leerFixtureJson('eventos-agenda.json');
const FINDES = findesProximos(10, AHORA);
const SITGES = { nombre: 'Sitges', lat: 41.2345, lon: 1.8062 };
const VILANOVA = { nombre: 'Vilanova i la Geltrú', lat: 41.2241, lon: 1.7252 };

function contexto(opciones = {}) {
  const creado = crearCtx({ respuestas: () => AGENDA, ...opciones });
  creado.ctx.findes = FINDES;
  return creado;
}

describe('eventos', () => {
  test('asigna hasta 6 eventos del finde, del más cercano al más lejano', async () => {
    const { ctx, peticiones } = contexto();
    const o = oferta({ titulo: 'Hotel en Sitges', lugar: SITGES, fechas: { findeId: '2026-09-25' } });
    await anadirEventos([o], ctx);

    assert.ok(o.eventos.length >= 3 && o.eventos.length <= 6, `${o.eventos.length} eventos`);
    assert.ok(o.eventos.every((e) => typeof e.km === 'number' && e.km <= 25 && e.tipo), 'con distancia y tipo');
    assert.equal(o.eventos[0].municipio, 'Sitges', 'lo más cercano, primero');
    assert.ok(o.eventos.every((e) => e.fecha >= '2026-09-25' && e.fecha <= '2026-09-27'), 'dentro del finde');
    assert.ok(o.eventos.filter((e) => e.municipio === 'Sitges').every((e) => e.fecha === '2026-09-25'), 'lo que ya había empezado, se recorta al inicio del finde');
    assert.ok(o.eventos.some((e) => e.nombre === "36è Festival L'Hora del Jazz"));
    assert.ok(o.eventos.every((e) => e.url === null || /^https?:\/\//.test(e.url)), 'enlaces web o ninguno');
    assert.equal(o.eventos[0].tipo, 'festivales', 'el festival de jazz de Sitges, el primero');

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

  test('los topónimos con apóstrofo lo recuperan', () => {
    assert.equal(nombreDeSlug('l-escala'), "L'Escala");
    assert.equal(nombreDeSlug('castell-platja-d-aro'), "Castell Platja d'Aro");
    assert.equal(nombreDeSlug('l-hospitalet-de-llobregat'), "L'Hospitalet de Llobregat");
    assert.equal(nombreDeSlug('la-bisbal-d-emporda'), "La Bisbal d'Emporda");
    assert.equal(nombreDeSlug('sant-carles-de-la-rapita'), 'Sant Carles de la Rapita');
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

  test('no consulta nada en zonas sin agenda, sin coordenadas ni para findes lejanos', async () => {
    const { ctx, peticiones } = contexto();
    const fuera = oferta({ titulo: 'Hotel en Valencia', lugar: { nombre: 'Valencia', lat: 39.47, lon: -0.38 } });
    const sinLugar = oferta({ titulo: 'Descuento general de la web' });
    const lejana = oferta({ lugar: SITGES, fechas: { findeId: FINDES[5].id } });
    await anadirEventos([fuera, sinLugar, lejana], ctx);
    assert.deepEqual(peticiones, []);
    for (const o of [fuera, sinLugar, lejana]) assert.deepEqual(o.eventos, []);
  });

  test('si el portal no responde y no hay agenda guardada, quita los eventos viejos (podrían ser de un finde pasado)', async () => {
    const { ctx, logs } = contexto({ respuestas: () => { throw new Error('HTTP 404 en analisi.transparenciacatalunya.cat'); } });
    const o = oferta({ lugar: SITGES, eventos: [{ nombre: 'Del finde pasado', fecha: '2026-09-12', url: null, municipio: 'Sitges' }] });
    await anadirEventos([o], ctx);
    assert.deepEqual(o.eventos, []);
    assert.match(logs[0], /Agenda cultural no disponible \(HTTP 404.*esta vez sin eventos/);
  });

  test('si el portal no responde, usa la última agenda guardada aunque tenga días', async () => {
    const primero = contexto();
    await anadirEventos([oferta({ lugar: SITGES, fechas: { findeId: '2026-09-25' } })], primero.ctx);
    // Dos días después, con la misma caché y el portal caído.
    const { ctx, logs } = contexto({ respuestas: () => { throw new Error('HTTP 503'); }, cache: primero.ctx.cache, ahora: new Date('2026-09-20T08:00:00Z') });
    const o = oferta({ lugar: SITGES, fechas: { findeId: '2026-09-25' } });
    await anadirEventos([o], ctx);
    assert.ok(o.eventos.length >= 3);
    assert.match(logs[0], /se usa la última guardada/);
    assert.deepEqual(Object.keys(ctx.cache.exportar()).filter((k) => k.startsWith('eventos:')), ['eventos:agenda'], 'una sola clave, no una por día');
  });

  test('si la respuesta no es la esperada, tampoco rompe el escaneo', async () => {
    const { ctx, logs } = contexto({ respuestas: () => ({ error: true, message: 'Dataset not found' }) });
    const o = oferta({ lugar: SITGES });
    await anadirEventos([o], ctx);
    assert.deepEqual(o.eventos, []);
    assert.match(logs[0], /respuesta inesperada/);
  });
});
