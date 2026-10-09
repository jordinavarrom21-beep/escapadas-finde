import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import googleflights, { consultasGoogle, entradaExplorar, parsearExplorar } from '../src/fuentes/googleflights.js';
import { Cache } from '../src/cache.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorPresupuesto } from '../src/util/apify.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, AJUSTES, leerFixtureJson } from './ayudas.js';

/** Respuesta real del actor (modo Explorar desde BCN, finde del 16 al 18 de octubre de 2026). */
const EXPLORAR = leerFixtureJson('apify-google-flights.json');
const consulta = { id: 'BCN:2026-10-16:2026-10-18:normal', origen: 'BCN', salida: '2026-10-16', vuelta: '2026-10-18', tipo: 'normal', patron: 'vie-dom', exigirHoraIda: true };

function ctxVuelos({ respuesta = EXPLORAR, presupuesto = 4.5, findes = findesProximos(10, AHORA), puentes = [] } = {}) {
  const peticiones = [];
  const logs = [];
  const http = {
    json: async (url, opciones) => {
      peticiones.push({ url, opciones });
      if (respuesta instanceof Error) throw respuesta;
      // Las filas de la fixture con las fechas que se piden.
      return respuesta.map((f) => (f.type === 'destination' ? { ...f, departureDate: opciones.cuerpo.departureDate, returnDate: opciones.cuerpo.returnDate } : f));
    },
  };
  const ajustes = { ...AJUSTES, apify: { presupuestoMensualUsd: presupuesto, googleFlights: { aeropuertos: ['BCN'], findes: 3, destinosPorConsulta: 25, maxUsdPorConsulta: 0.01 } } };
  return { ctx: { ahora: AHORA, ajustes, cache: new Cache(), env: { APIFY_TOKEN: 'x' }, http, findes, puentes, log: (m) => logs.push(m) }, peticiones, logs };
}

describe('googleflights: destinos más baratos de cada finde, de todas las aerolíneas', () => {
  it('un destino por aeropuerto (Google repite BGY como Milán y Lago de Como) y ofertas válidas', () => {
    const ofertas = parsearExplorar(EXPLORAR, consulta, AJUSTES);
    assert.deepEqual(ofertas.map((o) => o.vuelo.destino), ['PMI', 'BGY', 'LTN', 'AHO', 'MAN', 'FCO', 'VCE', 'MAD']);
    for (const oferta of ofertas) assert.deepEqual(validarOferta(oferta), [], oferta.id);
    const milan = ofertas.find((o) => o.vuelo.destino === 'BGY');
    assert.equal(milan.titulo, 'Milán');
  });

  it('cada oferta es un vuelo de ida y vuelta con día, escalas, duración y aerolínea (sin hora)', () => {
    const [mallorca] = parsearExplorar(EXPLORAR, consulta, AJUSTES);
    assert.equal(mallorca.id, 'googleflights:BCN-PMI:2026-10-16:2026-10-18');
    assert.equal(mallorca.tipo, 'vuelo');
    assert.equal(mallorca.precio, 36);
    assert.equal(mallorca.unidad, 'i/v');
    assert.equal(mallorca.transporte, 'avion');
    assert.match(mallorca.url, /^https:\/\/www\.google\.com\/travel\/flights\/search\?tfs=/);
    assert.equal(mallorca.imagen, null, 'las fotos de Google no se publican');
    assert.deepEqual(mallorca.fechas, { salida: '2026-10-16', vuelta: '2026-10-18', findeId: null, puenteId: null });
    assert.deepEqual({ ...mallorca.lugar }, { nombre: 'Mallorca', region: null, pais: 'España', codigoPais: null, iata: 'PMI', lat: 39.6952629, lon: 3.0175712 });
    assert.deepEqual(mallorca.vuelo.ida, { salida: '2026-10-16', llegada: null, numero: null, precio: null, escalas: 0, duracionMin: 60 });
    assert.equal(mallorca.vuelo.directo, true);
    assert.equal(mallorca.vuelo.horarioIdeal, false, 'sin hora no se puede saber');
    assert.equal(mallorca.vuelo.aerolinea, 'Ryanair');
    assert.match(mallorca.descripcion, /BCN → PMI · Ryanair · directo · 1 hr de vuelo/);
    const venecia = parsearExplorar(EXPLORAR, consulta, AJUSTES).find((o) => o.vuelo.destino === 'VCE');
    assert.equal(venecia.vuelo.directo, false);
    assert.equal(venecia.vuelo.ida.escalas, 1);
  });

  it('sin los vuelos más caros que vuelos.precioMax', () => {
    const baratos = parsearExplorar(EXPLORAR, consulta, { ...AJUSTES, vuelos: { ...AJUSTES.vuelos, precioMax: 60 } });
    assert.deepEqual(baratos.map((o) => o.vuelo.destino), ['PMI', 'BGY', 'LTN']);
  });

  it('los que solo vuela Wizz Air ya llegan con su hora de la fuente de Wizz Air', () => {
    const filas = EXPLORAR.map((f) => (f.destination === 'MAN' ? { ...f, airline: 'Wizz Air', airlineCode: 'W6' } : f));
    assert.ok(!parsearExplorar(filas, consulta, AJUSTES).some((o) => o.vuelo.destino === 'MAN'));
    const sinWizz = { ...AJUSTES, fuentes: { ...AJUSTES.fuentes, wizzair: { activa: false } } };
    assert.ok(parsearExplorar(filas, consulta, sinWizz).some((o) => o.vuelo.destino === 'MAN'), 'si Wizz Air está desactivada, sí');
    // «Ryanair y Wizz Air» es un vuelo combinado: se queda.
    assert.ok(parsearExplorar(EXPLORAR, consulta, AJUSTES).some((o) => o.vuelo.destino === 'LTN'));
  });

  it('descarta filas de otro origen, en otra moneda, sin precio o de otras fechas', () => {
    const raras = [
      { ...EXPLORAR[0], origin: 'MAD' },
      { ...EXPLORAR[3], currency: 'USD' },
      { ...EXPLORAR[4], price: 0 },
      { ...EXPLORAR[5], departureDate: '2026-11-06', returnDate: '2026-11-13' },
    ];
    assert.deepEqual(parsearExplorar(raras, consulta, AJUSTES), []);
    assert.throws(() => parsearExplorar({ error: 'x' }, consulta, AJUSTES), /no es una lista/);
  });

  it('consulta los próximos findes desde los aeropuertos de apify.googleFlights, sin repetir', () => {
    const { ctx } = ctxVuelos();
    const consultas = consultasGoogle(ctx);
    assert.deepEqual(consultas.map((c) => c.id), [
      'BCN:2026-09-18:2026-09-20:normal', 'BCN:2026-09-25:2026-09-27:normal', 'BCN:2026-10-02:2026-10-04:normal',
    ]);
    assert.deepEqual(entradaExplorar(consultas[0], 25), {
      origin: 'BCN', exploreAnywhere: true, departureDate: '2026-09-18', returnDate: '2026-09-20', maxDestinations: 25,
      currency: 'EUR', market: 'ES', language: 'es', includePriceInsights: false,
    });
  });

  it('obtener: una ejecución por consulta y solo borra lo de las consultas que han ido bien', async () => {
    const { ctx, peticiones } = ctxVuelos();
    const { ofertas, reemplazar } = await googleflights.obtener(ctx);
    assert.equal(peticiones.length, 3);
    assert.equal(peticiones[0].opciones.cuerpo.departureDate, '2026-09-18');
    assert.equal(ofertas.length, 3 * 8);
    assert.deepEqual([...new Set(ofertas.map((o) => o.vuelo.consultaId))], ['BCN:2026-09-18:2026-09-20:normal', 'BCN:2026-09-25:2026-09-27:normal', 'BCN:2026-10-02:2026-10-04:normal']);
    assert.equal(reemplazar({ vuelo: { consultaId: 'BCN:2026-09-18:2026-09-20:normal' } }), true);
    assert.equal(reemplazar({ vuelo: { consultaId: 'BCN:2026-12-04:2026-12-06:normal' } }), false);
  });

  it('sin presupuesto, para en la primera consulta y lo dice con ErrorPresupuesto (no es un fallo)', async () => {
    const { ctx, peticiones } = ctxVuelos({ presupuesto: 0.001 });
    await assert.rejects(googleflights.obtener(ctx), ErrorPresupuesto);
    assert.equal(peticiones.length, 0);
  });

  it('si fallan todas las consultas, error claro', async () => {
    const { ctx } = ctxVuelos({ respuesta: new Error('caído') });
    await assert.rejects(googleflights.obtener(ctx), /Ninguna consulta a Google Flights ha funcionado/);
  });

  it('declara el secreto que necesita y una URL de la API de Apify para robots.txt', () => {
    assert.deepEqual(googleflights.requiere, ['APIFY_TOKEN']);
    assert.match(googleflights.urls[0], /^https:\/\/api\.apify\.com\//);
  });
});
