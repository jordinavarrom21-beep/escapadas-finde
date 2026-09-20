import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ErrorHttp, ErrorParseo, ErrorRed, USER_AGENT,
  metricasHttp, obtenerJson, obtenerTexto, reiniciarMetricas,
} from '../src/util/http.js';

const URL_FEED = 'https://www.viajerospiratas.es/feed/';
const FETCH_REAL = globalThis.fetch;

/** Respuesta mínima con lo que usa el cliente: ok, status, headers y text(). */
function respuesta(estado, cuerpo = '', cabeceras = {}) {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    headers: new Headers(cabeceras),
    text: async () => cuerpo,
  };
}

/**
 * Sustituye `fetch` por una cola: cada elemento es una respuesta o un error que
 * se lanza. Cuando la cola se acaba se repite el último elemento.
 */
function simularRed(cola) {
  const peticiones = [];
  globalThis.fetch = async (url, opciones) => {
    peticiones.push({ url, opciones });
    const siguiente = cola[Math.min(peticiones.length - 1, cola.length - 1)];
    if (siguiente instanceof Error) throw siguiente;
    return siguiente;
  };
  return peticiones;
}

/** Recoge las esperas en vez de dormirlas de verdad. */
function cronometro() {
  const esperas = [];
  return { esperas, dormir: async (ms) => { esperas.push(ms); } };
}

const registro = () => {
  const logs = [];
  return { logs, log: (mensaje) => logs.push(mensaje) };
};

/** Los contadores de un dominio, sin el tiempo medio (que depende del reloj). */
const contadores = (dominio) => {
  const { peticiones, errores, reintentos } = metricasHttp()[dominio] ?? {};
  return { peticiones, errores, reintentos };
};

beforeEach(() => reiniciarMetricas());
afterEach(() => { globalThis.fetch = FETCH_REAL; });

describe('obtenerTexto', () => {
  test('éxito a la primera: una sola petición con el User-Agent de la casa', async () => {
    const peticiones = simularRed([respuesta(200, 'hola')]);
    const { esperas, dormir } = cronometro();

    assert.equal(await obtenerTexto(URL_FEED, { dormir }), 'hola');
    assert.equal(peticiones.length, 1);
    assert.equal(peticiones[0].url, URL_FEED);
    assert.equal(peticiones[0].opciones.headers['User-Agent'], USER_AGENT);
    assert.deepEqual(esperas, []);
    assert.deepEqual(contadores('www.viajerospiratas.es'), { peticiones: 1, errores: 0, reintentos: 0 });
  });

  test('un 429 con Retry-After en segundos espera lo que pide la web y lo cuenta', async () => {
    const limitado = respuesta(429, '', { 'Retry-After': '12' });
    simularRed([limitado, limitado, respuesta(200, 'ofertas')]);
    const { esperas, dormir } = cronometro();
    const { logs, log } = registro();

    const texto = await obtenerTexto(URL_FEED, { reintentos: 3, etiqueta: 'viajerospiratas', log, dormir });

    assert.equal(texto, 'ofertas');
    assert.deepEqual(esperas, [12_000, 12_000]);
    assert.equal(logs[1], 'viajerospiratas: reintento 2/3 tras HTTP 429, esperando 12 s');
    assert.deepEqual(contadores('www.viajerospiratas.es'), { peticiones: 3, errores: 2, reintentos: 2 });
  });

  test('un 429 con Retry-After como fecha HTTP, con tope de 30 s', async () => {
    const dentroDe = (ms) => new Date(Date.now() + ms).toUTCString();
    simularRed([respuesta(429, '', { 'Retry-After': dentroDe(5000) }), respuesta(200, 'ok')]);
    const cerca = cronometro();
    await obtenerTexto(URL_FEED, { dormir: cerca.dormir });
    assert.ok(cerca.esperas[0] > 3500 && cerca.esperas[0] <= 5000, `esperó ${cerca.esperas[0]} ms`);

    simularRed([respuesta(503, '', { 'Retry-After': dentroDe(10 * 60_000) }), respuesta(200, 'ok')]);
    const lejos = cronometro();
    await obtenerTexto(URL_FEED, { dormir: lejos.dormir });
    assert.deepEqual(lejos.esperas, [30_000]);
  });

  test('un 503 sin Retry-After reintenta con espera creciente y aleatoria', async () => {
    simularRed([respuesta(503), respuesta(200, 'ok')]);
    const { esperas, dormir } = cronometro();
    const { logs, log } = registro();

    assert.equal(await obtenerTexto(URL_FEED, { log, dormir }), 'ok');
    assert.equal(esperas.length, 1);
    assert.ok(esperas[0] >= 800 && esperas[0] <= 1200, `esperó ${esperas[0]} ms`);
    assert.match(logs[0], /^reintento 1\/2 tras HTTP 503, esperando [\d,]+ s$/);
  });

  test('un 500 agota los reintentos y lanza ErrorHttp con contexto', async () => {
    simularRed([respuesta(500)]);
    const { esperas, dormir } = cronometro();

    const error = await obtenerTexto(URL_FEED, { reintentos: 1, dormir }).then(
      () => null,
      (fallo) => fallo,
    );

    assert.ok(error instanceof ErrorHttp);
    assert.equal(error.message, 'HTTP 500 en www.viajerospiratas.es');
    assert.equal(error.estado, 500);
    assert.equal(error.url, URL_FEED);
    assert.equal(error.dominio, 'www.viajerospiratas.es');
    assert.equal(error.intento, 1);
    assert.equal(typeof error.duracionMs, 'number');
    assert.equal(esperas.length, 1);
  });

  test('un 404 no se reintenta y con reintentos: 0 tampoco insiste ante un 429', async () => {
    const peticiones = simularRed([respuesta(404)]);
    await assert.rejects(obtenerTexto(URL_FEED), (error) => error.estado === 404);
    assert.equal(peticiones.length, 1);

    const limitadas = simularRed([respuesta(429, '', { 'Retry-After': '12' })]);
    await assert.rejects(obtenerTexto(URL_FEED, { reintentos: 0 }), (error) => error.estado === 429);
    assert.equal(limitadas.length, 1);
  });

  test('un fallo de red (TypeError) se convierte en ErrorRed con la causa original', async () => {
    const caida = new TypeError('fetch failed');
    simularRed([caida]);

    const error = await obtenerTexto(URL_FEED, { reintentos: 0 }).then(() => null, (fallo) => fallo);

    assert.ok(error instanceof ErrorRed);
    assert.equal(error.motivo, 'red');
    assert.equal(error.message, 'Fallo de red en www.viajerospiratas.es');
    assert.equal(error.dominio, 'www.viajerospiratas.es');
    assert.equal(error.url, URL_FEED);
    assert.equal(error.intento, 0);
    assert.equal(error.cause, caida);
    assert.equal(typeof error.duracionMs, 'number');
  });

  test('un tiempo de espera agotado (AbortError) se distingue del fallo de red', async () => {
    simularRed([new DOMException('The operation was aborted', 'AbortError')]);
    const { esperas, dormir } = cronometro();
    const { logs, log } = registro();

    const error = await obtenerTexto(URL_FEED, { reintentos: 1, etiqueta: 'ryanair', log, dormir })
      .then(() => null, (fallo) => fallo);

    assert.ok(error instanceof ErrorRed);
    assert.equal(error.motivo, 'timeout');
    assert.equal(error.message, 'Tiempo de espera agotado en www.viajerospiratas.es');
    assert.equal(error.intento, 1);
    assert.equal(esperas.length, 1);
    assert.match(logs[0], /^ryanair: reintento 1\/1 tras tiempo de espera agotado, esperando [\d,]+ s$/);
  });

  test('sin log no escribe nada por consola', async () => {
    simularRed([respuesta(503), respuesta(200, 'ok')]);
    const { dormir } = cronometro();
    const originales = { log: console.log, warn: console.warn, error: console.error };
    const impresiones = [];
    console.log = console.warn = console.error = (...partes) => impresiones.push(partes);
    try {
      await obtenerTexto(URL_FEED, { dormir });
    } finally {
      Object.assign(console, originales);
    }
    assert.deepEqual(impresiones, []);
  });
});

describe('obtenerJson', () => {
  test('pide Accept: application/json y respeta las cabeceras de la fuente', async () => {
    const peticiones = simularRed([respuesta(200, '{"ofertas":[1]}')]);

    const datos = await obtenerJson(URL_FEED, { cabeceras: { 'X-Origen': 'BCN' } });

    assert.deepEqual(datos, { ofertas: [1] });
    assert.equal(peticiones[0].opciones.headers.Accept, 'application/json');
    assert.equal(peticiones[0].opciones.headers['X-Origen'], 'BCN');
  });

  test('una respuesta que no es JSON lanza ErrorParseo con el principio del cuerpo', async () => {
    const desafio = `<!DOCTYPE html>\n<html>  <body>Comprobando tu navegador… avisos@ejemplo.es ${'x'.repeat(400)}</body></html>`;
    simularRed([respuesta(200, desafio)]);

    const error = await obtenerJson(URL_FEED).then(() => null, (fallo) => fallo);

    assert.ok(error instanceof ErrorParseo);
    // Las fuentes detectan los desafíos anti-bot con `instanceof SyntaxError`.
    assert.ok(error instanceof SyntaxError);
    assert.equal(error.cuerpo.length, 200);
    assert.ok(error.cuerpo.startsWith('<!DOCTYPE html> <html> <body>Comprobando tu navegador… (correo)'));
    assert.equal(error.dominio, 'www.viajerospiratas.es');
    assert.equal(error.url, URL_FEED);
    assert.ok(error.cause instanceof SyntaxError);
  });

  test('un JSON válido no cuenta como error en las métricas', async () => {
    simularRed([respuesta(200, '[]')]);
    await obtenerJson(URL_FEED);
    assert.deepEqual(contadores('www.viajerospiratas.es'), { peticiones: 1, errores: 0, reintentos: 0 });
  });
});

describe('métricas', () => {
  test('separa los dominios y calcula el tiempo medio por intento', async () => {
    simularRed([respuesta(200, 'a')]);
    await obtenerTexto('https://www.rusticae.es/ofertas');
    simularRed([respuesta(500), respuesta(200, 'b')]);
    const { dormir } = cronometro();
    await obtenerTexto('https://www.paradores.es/es/ofertas', { dormir });

    const metricas = metricasHttp();
    assert.deepEqual(Object.keys(metricas).sort(), ['www.paradores.es', 'www.rusticae.es']);
    assert.deepEqual(contadores('www.rusticae.es'), { peticiones: 1, errores: 0, reintentos: 0 });
    assert.deepEqual(contadores('www.paradores.es'), { peticiones: 2, errores: 1, reintentos: 1 });
    for (const dato of Object.values(metricas)) {
      assert.ok(Number.isInteger(dato.tiempoMedioMs) && dato.tiempoMedioMs >= 0);
    }
  });

  test('reiniciarMetricas las deja vacías', async () => {
    simularRed([respuesta(200, 'a')]);
    await obtenerTexto(URL_FEED);
    assert.equal(Object.keys(metricasHttp()).length, 1);
    reiniciarMetricas();
    assert.deepEqual(metricasHttp(), {});
  });
});
