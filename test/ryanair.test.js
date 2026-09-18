/**
 * Tests de la fuente de Ryanair, sin red (ctx.http simulado).
 * Las respuestas de tarifas y aeropuertos no se han descargado porque el
 * robots.txt de Ryanair (test/fixtures/ryanair-robots.txt, real del 18-09-2026)
 * prohíbe /api: siguen el formato documentado de roundTripFares v4 y locate/5/airports.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ryanair, {
  esHorarioIdeal,
  generarConsultas,
  indexarAeropuertos,
  parsearTarifas,
  urlConsulta,
} from '../src/fuentes/ryanair.js';
import { Cache } from '../src/cache.js';
import { findesProximos } from '../src/util/fechas.js';
import { ErrorHttp } from '../src/util/http.js';
import { ErrorRobots, comprobarRobots } from '../src/util/robots.js';

const leer = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');
const leerJson = (nombre) => JSON.parse(leer(nombre));

const ROBOTS_REAL = leer('ryanair-robots.txt');
const TARIFAS_NORMAL = leerJson('ryanair-tarifas-bcn-normal.json');
const TARIFAS_IDEAL = leerJson('ryanair-tarifas-bcn-ideal.json');
const LISTA_AEROPUERTOS = leerJson('ryanair-aeropuertos.json');
const AEROPUERTOS = indexarAeropuertos(LISTA_AEROPUERTOS);

const HORARIO_IDEAL = { salidaDesde: '15:00', vueltaDesde: '16:00', aeropuertos: ['BCN'] };
const AJUSTES = {
  vuelos: {
    aeropuertos: ['BCN', 'GRO', 'REU'],
    findes: 10,
    precioMax: 150,
    patrones: [{ id: 'vie-dom', nombre: 'Viernes a domingo', salida: 0, vuelta: 2 }],
    horarioIdeal: HORARIO_IDEAL,
    pausaEntrePeticionesMs: 1500,
  },
  puentes: { buscarVuelos: true },
};
const SIN_PUENTES = { ...AJUSTES, puentes: { buscarVuelos: false } };

// Viernes 18 de septiembre de 2026, 12:00 en Madrid.
const AHORA = new Date('2026-09-18T10:00:00Z');

const festivo = (fecha, nombre) => ({ fecha, nombre, ambito: 'nacional' });
const PUENTE_MERCE = {
  id: '2026-09-24', nombre: 'La Mercè', desde: '2026-09-24', hasta: '2026-09-27', dias: 4,
  festivos: [festivo('2026-09-24', 'La Mercè (Barcelona)')],
  salidas: ['2026-09-23', '2026-09-24'], vuelta: '2026-09-27', etiqueta: '24–27 sep',
};
const PUENTE_PILAR = {
  id: '2026-10-10', nombre: 'Fiesta Nacional de España', desde: '2026-10-10', hasta: '2026-10-12', dias: 3,
  festivos: [festivo('2026-10-12', 'Fiesta Nacional de España')],
  salidas: ['2026-10-09', '2026-10-10'], vuelta: '2026-10-12', etiqueta: '10–12 oct',
};
const PUENTE_NAVIDAD = {
  id: '2026-12-25', nombre: 'Navidad', desde: '2026-12-25', hasta: '2026-12-27', dias: 3,
  festivos: [festivo('2026-12-25', 'Navidad')],
  salidas: ['2026-12-24', '2026-12-25'], vuelta: '2026-12-27', etiqueta: '25–27 dic',
};

const consulta = (origen, salida, vuelta, tipo, { patron = 'vie-dom', exigirHoraIda = true } = {}) => ({
  id: `${origen}:${salida}:${vuelta}:${tipo}`, origen, salida, vuelta, tipo, patron, exigirHoraIda,
});
const CONSULTA_NORMAL = consulta('BCN', '2026-10-16', '2026-10-18', 'normal');
const CONSULTA_IDEAL = consulta('BCN', '2026-10-16', '2026-10-18', 'ideal');

const ids = (lista) => lista.map((elemento) => elemento.id);
const buscar = (ofertas, id) => ofertas.find((oferta) => oferta.id === id);

describe('generarConsultas', () => {
  test('genera las normales y las ideales de los findes desde hoy', () => {
    const consultas = generarConsultas({ ajustes: SIN_PUENTES, findes: findesProximos(2, AHORA), puentes: [], ahora: AHORA });
    assert.deepEqual(ids(consultas), [
      'BCN:2026-09-18:2026-09-20:normal',
      'GRO:2026-09-18:2026-09-20:normal',
      'REU:2026-09-18:2026-09-20:normal',
      'BCN:2026-09-25:2026-09-27:normal',
      'GRO:2026-09-25:2026-09-27:normal',
      'REU:2026-09-25:2026-09-27:normal',
      'BCN:2026-09-18:2026-09-20:ideal',
      'BCN:2026-09-25:2026-09-27:ideal',
    ]);
    assert.deepEqual(consultas[3], consulta('BCN', '2026-09-25', '2026-09-27', 'normal'));
  });

  test('descarta las salidas pasadas según la fecha de Madrid', () => {
    // 22:30 UTC del viernes ya es sábado en Madrid: el finde en curso no se consulta.
    const ahora = new Date('2026-09-18T22:30:00Z');
    const consultas = generarConsultas({ ajustes: SIN_PUENTES, findes: findesProximos(2, ahora), puentes: [], ahora });
    assert.equal(consultas.length, 4);
    assert.ok(consultas.every((c) => c.salida === '2026-09-25'));
  });

  test('añade los puentes del horizonte y solo exige hora de ida si se sale un día laborable', () => {
    const consultas = generarConsultas({
      ajustes: AJUSTES, findes: findesProximos(4, AHORA), puentes: [PUENTE_MERCE, PUENTE_PILAR, PUENTE_NAVIDAD], ahora: AHORA,
    });
    const dePuentes = consultas.filter((c) => c.tipo === 'puente');
    assert.deepEqual(ids(dePuentes), [
      'BCN:2026-09-23:2026-09-27:puente',
      'GRO:2026-09-23:2026-09-27:puente',
      'REU:2026-09-23:2026-09-27:puente',
      'BCN:2026-09-24:2026-09-27:puente',
      'GRO:2026-09-24:2026-09-27:puente',
      'REU:2026-09-24:2026-09-27:puente',
      'BCN:2026-10-09:2026-10-12:puente',
      'GRO:2026-10-09:2026-10-12:puente',
      'REU:2026-10-09:2026-10-12:puente',
      'BCN:2026-10-10:2026-10-12:puente',
      'GRO:2026-10-10:2026-10-12:puente',
      'REU:2026-10-10:2026-10-12:puente',
    ]);
    assert.ok(dePuentes.every((c) => c.patron === 'puente'));
    assert.equal(dePuentes[0].exigirHoraIda, true);
    assert.equal(dePuentes[3].exigirHoraIda, false);
  });

  test('omite las combinaciones de puente que ya cubren los findes', () => {
    // El 15.º finde es el de Navidad: el viernes 25 → domingo 27 ya es una consulta normal.
    const consultas = generarConsultas({ ajustes: AJUSTES, findes: findesProximos(15, AHORA), puentes: [PUENTE_NAVIDAD], ahora: AHORA });
    assert.deepEqual(ids(consultas.filter((c) => c.tipo === 'puente')), [
      'BCN:2026-12-24:2026-12-27:puente',
      'GRO:2026-12-24:2026-12-27:puente',
      'REU:2026-12-24:2026-12-27:puente',
    ]);
    assert.ok(consultas.some((c) => c.id === 'BCN:2026-12-25:2026-12-27:normal'));
  });

  test('omite las salidas de puente pasadas', () => {
    const ahora = new Date('2026-09-24T08:00:00Z');
    const consultas = generarConsultas({ ajustes: AJUSTES, findes: findesProximos(2, ahora), puentes: [PUENTE_MERCE], ahora });
    assert.deepEqual(ids(consultas.filter((c) => c.tipo === 'puente')), [
      'BCN:2026-09-24:2026-09-27:puente',
      'GRO:2026-09-24:2026-09-27:puente',
      'REU:2026-09-24:2026-09-27:puente',
    ]);
  });

  test('sin buscarVuelos no consulta puentes', () => {
    const consultas = generarConsultas({ ajustes: SIN_PUENTES, findes: findesProximos(4, AHORA), puentes: [PUENTE_MERCE], ahora: AHORA });
    assert.ok(consultas.every((c) => c.tipo !== 'puente'));
  });
});

describe('urlConsulta', () => {
  const BASE = 'https://www.ryanair.com/api/farfnd/v4/roundTripFares?departureAirportIataCode=BCN' +
    '&outboundDepartureDateFrom=2026-10-16&outboundDepartureDateTo=2026-10-16' +
    '&inboundDepartureDateFrom=2026-10-18&inboundDepartureDateTo=2026-10-18' +
    '&market=es-es&adultPaxCount=1&currency=EUR&priceValueTo=150';

  test('consulta normal', () => {
    assert.equal(urlConsulta(CONSULTA_NORMAL, AJUSTES), BASE);
  });

  test('consulta ideal con los filtros de hora', () => {
    assert.equal(
      urlConsulta(CONSULTA_IDEAL, AJUSTES),
      `${BASE}&outboundDepartureTimeFrom=15:00&outboundDepartureTimeTo=23:59` +
        '&inboundDepartureTimeFrom=16:00&inboundDepartureTimeTo=23:59',
    );
  });
});

describe('esHorarioIdeal', () => {
  test('compara las horas de salida de ida y vuelta, límites incluidos', () => {
    assert.equal(esHorarioIdeal('2026-10-16T15:00:00', '2026-10-18T16:00:00', HORARIO_IDEAL), true);
    assert.equal(esHorarioIdeal('2026-10-16T14:59:00', '2026-10-18T19:05:00', HORARIO_IDEAL), false);
    assert.equal(esHorarioIdeal('2026-10-16T23:40:00', '2026-10-18T05:55:00', HORARIO_IDEAL), false);
  });

  test('sin exigir la ida solo cuenta la vuelta', () => {
    assert.equal(esHorarioIdeal('2026-10-16T06:30:00', '2026-10-18T21:40:00', HORARIO_IDEAL, false), true);
    assert.equal(esHorarioIdeal('2026-10-16T06:30:00', '2026-10-18T12:00:00', HORARIO_IDEAL, false), false);
  });

  test('sin horario configurado nunca es ideal', () => {
    assert.equal(esHorarioIdeal('2026-10-16T18:00:00', '2026-10-18T18:00:00', undefined), false);
  });
});

describe('indexarAeropuertos', () => {
  test('indexa las coordenadas por código IATA', () => {
    assert.deepEqual(AEROPUERTOS.BCN, { lat: 41.2971, lon: 2.07846 });
    assert.equal(Object.keys(AEROPUERTOS).length, LISTA_AEROPUERTOS.length);
  });

  test('rechaza una respuesta que no es una lista', () => {
    assert.throws(() => indexarAeropuertos({ error: 'x' }), /no es un array/);
  });
});

describe('parsearTarifas', () => {
  const ofertas = parsearTarifas(TARIFAS_NORMAL, CONSULTA_NORMAL, AEROPUERTOS, AJUSTES);

  test('crea una oferta por destino', () => {
    assert.deepEqual(ids(ofertas), [
      'ryanair:BCN-BGY:2026-10-16:2026-10-18',
      'ryanair:BCN-CIA:2026-10-16:2026-10-18',
      'ryanair:BCN-CRL:2026-10-16:2026-10-18',
      'ryanair:BCN-OPO:2026-10-16:2026-10-18',
      'ryanair:BCN-RAK:2026-10-16:2026-10-18',
    ]);
  });

  test('rellena todos los campos del contrato', () => {
    const oporto = buscar(ofertas, 'ryanair:BCN-OPO:2026-10-16:2026-10-18');
    assert.equal(oporto.fuente, 'ryanair');
    assert.equal(oporto.tipo, 'vuelo');
    assert.equal(oporto.transporte, 'avion');
    assert.equal(oporto.unidad, 'i/v');
    assert.equal(oporto.titulo, 'Oporto');
    assert.equal(oporto.descripcion, 'BCN → OPO · vie 16 oct 23:40 → dom 18 oct 05:55');
    assert.equal(oporto.precio, 62.48);
    assert.match(oporto.precioTexto, /^62,48\s€ ida y vuelta$/);
    assert.equal(oporto.precioAnterior, null);
    assert.equal(
      oporto.url,
      'https://www.ryanair.com/es/es/trip/flights/select?adults=1&teens=0&children=0&infants=0' +
        '&dateOut=2026-10-16&dateIn=2026-10-18&isConnectedFlight=false&isReturn=true&discount=0' +
        '&originIata=BCN&destinationIata=OPO',
    );
    assert.deepEqual(oporto.lugar, {
      nombre: 'Oporto', region: null, pais: 'Portugal', codigoPais: 'PT', iata: 'OPO', lat: 41.2481, lon: -8.68139,
    });
    assert.deepEqual(oporto.fechas, { salida: '2026-10-16T23:40:00', vuelta: '2026-10-18T05:55:00', findeId: null, puenteId: null });
    assert.deepEqual(oporto.vuelo, {
      origen: 'BCN',
      destino: 'OPO',
      ida: { salida: '2026-10-16T23:40:00', llegada: '2026-10-17T00:55:00', numero: 'FR8394', precio: 30.99 },
      vuelta: { salida: '2026-10-18T05:55:00', llegada: '2026-10-18T09:05:00', numero: 'FR8395', precio: 31.49 },
      consultaId: 'BCN:2026-10-16:2026-10-18:normal',
      horarioIdeal: false,
      patron: 'vie-dom',
      nuevaRuta: false,
    });
    assert.deepEqual(oporto.etiquetas, ['Portugal', 'vie-dom']);
  });

  test('precio anterior, horario ideal, ruta nueva y aeropuerto sin coordenadas', () => {
    const roma = buscar(ofertas, 'ryanair:BCN-CIA:2026-10-16:2026-10-18');
    assert.equal(roma.precioAnterior, 52.98);
    assert.equal(roma.vuelo.horarioIdeal, true);

    const marrakech = buscar(ofertas, 'ryanair:BCN-RAK:2026-10-16:2026-10-18');
    assert.equal(marrakech.vuelo.nuevaRuta, true);
    assert.equal(marrakech.lugar.codigoPais, 'MA');
    assert.equal(marrakech.lugar.lat, null);
    assert.equal(marrakech.lugar.lon, null);
  });

  test('la variante ideal lleva su propio id', () => {
    const ideales = parsearTarifas(TARIFAS_IDEAL, CONSULTA_IDEAL, AEROPUERTOS, AJUSTES);
    assert.ok(ideales.every((oferta) => oferta.id.endsWith(':2026-10-16:2026-10-18:ideal')));
    assert.ok(ideales.every((oferta) => oferta.vuelo.horarioIdeal && oferta.vuelo.consultaId === CONSULTA_IDEAL.id));
  });

  test('en un puente que sale en festivo solo cuenta la hora de vuelta', () => {
    const puente = consulta('BCN', '2026-10-16', '2026-10-18', 'puente', { patron: 'puente', exigirHoraIda: false });
    const dePuente = parsearTarifas(TARIFAS_NORMAL, puente, AEROPUERTOS, AJUSTES);
    const milan = buscar(dePuente, 'ryanair:BCN-BGY:2026-10-16:2026-10-18');
    assert.equal(milan.vuelo.horarioIdeal, true);
    assert.equal(milan.vuelo.patron, 'puente');
    assert.deepEqual(milan.etiquetas, ['Italia', 'puente']);
    assert.equal(buscar(dePuente, 'ryanair:BCN-OPO:2026-10-16:2026-10-18').vuelo.horarioIdeal, false);
  });

  test('descarta y registra las tarifas incompletas', () => {
    const json = structuredClone(TARIFAS_NORMAL);
    delete json.fares[0].inbound;
    const registros = [];
    const resultado = parsearTarifas(json, CONSULTA_NORMAL, AEROPUERTOS, AJUSTES, (mensaje) => registros.push(mensaje));
    assert.equal(resultado.length, 4);
    assert.equal(registros.length, 1);
    assert.match(registros[0], /^Tarifa descartada en BCN:2026-10-16:2026-10-18:normal/);
  });

  test('rechaza una respuesta sin «fares»', () => {
    assert.throws(() => parsearTarifas({ message: 'error' }, CONSULTA_NORMAL, AEROPUERTOS, AJUSTES), /fares/);
  });
});

describe('robots.txt', () => {
  test('declara las URLs de su API y el robots.txt real las prohíbe', async () => {
    const ctx = { ahora: AHORA, cache: new Cache(), http: { texto: async () => ROBOTS_REAL } };
    assert.deepEqual(ryanair.urls.map((url) => new URL(url).pathname), [
      '/api/farfnd/v4/roundTripFares',
      '/api/views/locate/5/airports/es/active',
    ]);
    await assert.rejects(comprobarRobots(ctx, ryanair.urls), ErrorRobots);
  });
});

describe('obtener', () => {
  const FINDE = { id: '2026-10-16', viernes: '2026-10-16', sabado: '2026-10-17', domingo: '2026-10-18', etiqueta: '16–18 oct' };
  const AJUSTES_OBTENER = {
    ...SIN_PUENTES,
    vuelos: { ...AJUSTES.vuelos, aeropuertos: ['BCN', 'GRO'] },
  };

  // BCN responde con los fixtures; GRO falla con un 500.
  function responderPorDefecto(url) {
    if (url.includes('/airports/')) return LISTA_AEROPUERTOS;
    if (url.includes('departureAirportIataCode=BCN')) {
      return url.includes('outboundDepartureTimeFrom') ? TARIFAS_IDEAL : TARIFAS_NORMAL;
    }
    throw new ErrorHttp(500, url);
  }

  function crearCtx({ responder = responderPorDefecto, cache = new Cache(), findes = [FINDE] } = {}) {
    const peticiones = [];
    const esperas = [];
    const registros = [];
    const pedir = async (url) => {
      peticiones.push(url);
      return responder(url);
    };
    const ctx = {
      ahora: AHORA,
      ajustes: AJUSTES_OBTENER,
      http: { texto: pedir, json: pedir, esperar: async (ms) => { esperas.push(ms); } },
      cache,
      log: (mensaje) => registros.push(mensaje),
      findes,
      puentes: [],
      env: {},
    };
    return { ctx, peticiones, esperas, registros };
  }

  test('pide en secuencia con pausas, fusiona la variante ideal y registra los fallos', async () => {
    const { ctx, peticiones, esperas, registros } = crearCtx();
    const { ofertas } = await ryanair.obtener(ctx);

    assert.deepEqual(peticiones, [
      'https://www.ryanair.com/api/views/locate/5/airports/es/active',
      urlConsulta(CONSULTA_NORMAL, AJUSTES_OBTENER),
      urlConsulta(consulta('GRO', '2026-10-16', '2026-10-18', 'normal'), AJUSTES_OBTENER),
      urlConsulta(CONSULTA_IDEAL, AJUSTES_OBTENER),
    ]);
    assert.deepEqual(esperas, [1500, 1500, 1500]);
    assert.equal(registros.length, 1);
    assert.match(registros[0], /^Consulta GRO:2026-10-16:2026-10-18:normal fallida: HTTP 500/);

    // Roma y Bruselas salen igual en las dos variantes: solo queda la normal, marcada como ideal.
    assert.deepEqual(ids(ofertas), [
      'ryanair:BCN-BGY:2026-10-16:2026-10-18',
      'ryanair:BCN-CIA:2026-10-16:2026-10-18',
      'ryanair:BCN-CRL:2026-10-16:2026-10-18',
      'ryanair:BCN-OPO:2026-10-16:2026-10-18',
      'ryanair:BCN-RAK:2026-10-16:2026-10-18',
      'ryanair:BCN-BGY:2026-10-16:2026-10-18:ideal',
      'ryanair:BCN-OPO:2026-10-16:2026-10-18:ideal',
    ]);
    assert.equal(buscar(ofertas, 'ryanair:BCN-CIA:2026-10-16:2026-10-18').vuelo.horarioIdeal, true);
    assert.equal(buscar(ofertas, 'ryanair:BCN-CRL:2026-10-16:2026-10-18').vuelo.horarioIdeal, true);
    assert.equal(buscar(ofertas, 'ryanair:BCN-BGY:2026-10-16:2026-10-18').vuelo.horarioIdeal, false);
    assert.equal(buscar(ofertas, 'ryanair:BCN-BGY:2026-10-16:2026-10-18:ideal').vuelo.ida.numero, 'FR4836');

    assert.deepEqual(ctx.cache.obtener('ryanair:aeropuertos'), AEROPUERTOS);
  });

  test('reemplazar solo afecta a las consultas que han ido bien', async () => {
    const { ctx } = crearCtx();
    const { reemplazar } = await ryanair.obtener(ctx);
    const conConsulta = (consultaId) => ({ vuelo: { consultaId } });

    assert.equal(reemplazar(conConsulta('BCN:2026-10-16:2026-10-18:normal')), true);
    // Una ideal guardada de otra ejecución desaparece aunque ahora se haya fusionado con la normal.
    assert.equal(reemplazar(conConsulta('BCN:2026-10-16:2026-10-18:ideal')), true);
    assert.equal(reemplazar(conConsulta('GRO:2026-10-16:2026-10-18:normal')), false);
    assert.equal(reemplazar(conConsulta('BCN:2026-10-23:2026-10-25:normal')), false);
    assert.equal(reemplazar({ vuelo: null }), false);
  });

  test('reutiliza los aeropuertos de la caché', async () => {
    const cache = new Cache();
    cache.guardar('ryanair:aeropuertos', AEROPUERTOS, AHORA.getTime());
    const { ctx, peticiones, esperas } = crearCtx({ cache });
    const { ofertas } = await ryanair.obtener(ctx);

    assert.equal(peticiones.length, 3);
    assert.ok(peticiones.every((url) => url.includes('/roundTripFares?')));
    assert.deepEqual(esperas, [1500, 1500]);
    assert.equal(buscar(ofertas, 'ryanair:BCN-OPO:2026-10-16:2026-10-18').lugar.lat, 41.2481);
  });

  test('sin lista de aeropuertos sigue adelante sin coordenadas', async () => {
    const { ctx, registros } = crearCtx({
      responder: (url) => {
        if (url.includes('/airports/')) throw new ErrorHttp(500, url);
        return responderPorDefecto(url);
      },
    });
    const { ofertas } = await ryanair.obtener(ctx);
    assert.match(registros[0], /^No se ha podido actualizar la lista de aeropuertos/);
    assert.ok(ofertas.every((oferta) => oferta.lugar.lat === null));
  });

  test('si Ryanair bloquea no insiste y, sin ninguna consulta correcta, lanza un error', async () => {
    const { ctx, peticiones, registros } = crearCtx({
      responder: (url) => {
        if (url.includes('/roundTripFares?')) throw new ErrorHttp(403, url);
        return responderPorDefecto(url);
      },
    });
    await assert.rejects(ryanair.obtener(ctx), /Ninguna consulta a Ryanair ha funcionado \(último error: HTTP 403/);
    assert.equal(peticiones.filter((url) => url.includes('/roundTripFares?')).length, 1);
    assert.match(registros.at(-1), /bloqueado o limitado/);
  });

  test('si fallan todas las consultas lanza un error', async () => {
    const { ctx, peticiones } = crearCtx({
      responder: (url) => {
        if (url.includes('/roundTripFares?')) throw new ErrorHttp(500, url);
        return responderPorDefecto(url);
      },
    });
    await assert.rejects(ryanair.obtener(ctx), /Ninguna consulta a Ryanair ha funcionado/);
    assert.equal(peticiones.filter((url) => url.includes('/roundTripFares?')).length, 3);
  });

  test('sin consultas pendientes no pide nada', async () => {
    const { ctx, peticiones } = crearCtx({ findes: [] });
    assert.deepEqual(await ryanair.obtener(ctx), { ofertas: [], reemplazar: false });
    assert.deepEqual(peticiones, []);
  });
});
