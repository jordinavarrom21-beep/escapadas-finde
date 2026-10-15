import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ErrorHttp, ErrorParseo, ErrorPeticion, ErrorRed, MAX_CUERPO, USER_AGENT,
  esDireccionInterna, metricasHttp, obtenerJson, obtenerRedireccion, obtenerTexto, reiniciarMetricas,
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
    assert.equal(logs[1], 'viajerospiratas: reintento 2/3 tras HTTP 429 (demasiadas peticiones seguidas), esperando 12 s');
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
    assert.match(logs[0], /^reintento 1\/2 tras HTTP 503 \(web caída o en mantenimiento\), esperando [\d,]+ s$/);
  });

  test('un error guarda el principio de lo que contesta la web (las APIs dicen ahí el motivo)', async () => {
    const motivo = '{"error":{"type":"invalid-input","message":"Input is not valid"}}';
    simularRed([respuesta(400, motivo)]);
    const error = await obtenerTexto('https://api.apify.com/v2/acts/x/run-sync-get-dataset-items', { reintentos: 0 }).catch((e) => e);
    assert.ok(error instanceof ErrorHttp);
    assert.equal(error.cuerpo, motivo);
    // Sin cuerpo legible, vacío (no rompe el error).
    simularRed([{ ok: false, status: 400, headers: new Headers() }]);
    assert.equal((await obtenerTexto(URL_FEED, { reintentos: 0 }).catch((e) => e)).cuerpo, '');
  });

  test('un 500 agota los reintentos y lanza ErrorHttp con contexto', async () => {
    simularRed([respuesta(500)]);
    const { esperas, dormir } = cronometro();

    const error = await obtenerTexto(URL_FEED, { reintentos: 1, dormir }).then(
      () => null,
      (fallo) => fallo,
    );

    assert.ok(error instanceof ErrorHttp);
    assert.equal(error.message, 'HTTP 500 (error de la web) en www.viajerospiratas.es');
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

  test('un 405 (captcha de AWS WAF) no se reintenta, dice qué es y va marcado como bloqueo', async () => {
    const peticiones = simularRed([respuesta(405, '<html>captcha</html>')]);
    await assert.rejects(obtenerTexto(URL_FEED), (error) => error.bloqueo === true
      && error.message === 'HTTP 405 (bloqueo anti-bot o captcha) en www.viajerospiratas.es');
    assert.equal(peticiones.length, 1);
    assert.equal(new ErrorHttp(403, URL_FEED).bloqueo, true);
    assert.equal(new ErrorHttp(429, URL_FEED).bloqueo, true);
    assert.equal(new ErrorHttp(503, URL_FEED).bloqueo, false, 'una caída no es un bloqueo: se reintenta');
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

describe('direcciones internas y respuestas enormes', () => {
  test('reconoce las direcciones que no son de Internet (solo por la URL)', () => {
    for (const url of ['http://localhost/', 'http://127.0.0.1:8080/', 'http://169.254.169.254/latest/meta-data/', 'http://10.1.2.3/',
      'http://172.20.0.1/', 'http://192.168.1.1/', 'http://100.64.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/',
      'http://2130706433/', 'http://intranet.local/', 'http://metadata.google.internal/', 'no es una url']) {
      assert.equal(esDireccionInterna(url), true, url);
    }
    for (const url of ['https://www.atrapalo.com/', 'https://8.8.8.8/', 'https://172.32.0.1/', 'https://[2001:4860::8888]/']) {
      assert.equal(esDireccionInterna(url), false, url);
    }
  });

  test('no pide una dirección interna ni sigue un enlace que lleva a ella', async () => {
    const peticiones = simularRed([respuesta(200, 'secreto')]);
    await assert.rejects(obtenerTexto('http://169.254.169.254/latest/meta-data/'), ErrorPeticion);
    await assert.rejects(obtenerRedireccion('http://127.0.0.1/admin'), /dirección interna/);
    assert.equal(peticiones.length, 0);
  });

  test('si una redirección acaba en una dirección interna, no se lee ni se reintenta', async () => {
    const peticiones = simularRed([{ ...respuesta(200, 'secreto'), url: 'http://10.0.0.5/' }]);
    await assert.rejects(obtenerTexto(URL_FEED, cronometro()), /dirección interna/);
    assert.equal(peticiones.length, 1);
  });

  test('una respuesta de más de 20 MB no se lee entera ni se reintenta', async () => {
    const enorme = respuesta(200, 'x', { 'content-length': String(MAX_CUERPO + 1) });
    const peticiones = simularRed([enorme]);
    await assert.rejects(obtenerTexto(URL_FEED, cronometro()), /más de 20 MB/);
    assert.equal(peticiones.length, 1);
    // Sin content-length: se corta al pasar del límite mientras llega.
    const trozo = new Uint8Array(1_000_000);
    let enviados = 0;
    const cuerpo = new ReadableStream({ pull(control) { enviados += 1; control.enqueue(trozo); } });
    simularRed([{ ok: true, status: 200, headers: new Headers(), body: cuerpo, text: async () => { throw new Error('no se usa'); } }]);
    await assert.rejects(obtenerTexto(URL_FEED, cronometro()), /más de 20 MB/);
    assert.ok(enviados <= 22, `${enviados} MB leídos`);
    // Y una normal por trozos se lee igual que con text().
    simularRed([{ ok: true, status: 200, headers: new Headers(), body: new Response('¡hola, señor!').body }]);
    assert.equal(await obtenerTexto(URL_FEED), '¡hola, señor!');
  });

  test('de una respuesta de error sin fin solo se lee el principio, para la muestra', async () => {
    let enviados = 0;
    const trozo = new TextEncoder().encode(`{"error":{"type":"run-failed"}} ${'x'.repeat(999)} `);
    const cuerpo = new ReadableStream({ pull(control) { enviados += 1; control.enqueue(trozo); } });
    simularRed([{ ok: false, status: 500, headers: new Headers(), body: cuerpo, text: async () => { throw new Error('no se usa'); } }]);
    const error = await obtenerTexto(URL_FEED, { reintentos: 0 }).catch((e) => e);
    assert.ok(error instanceof ErrorHttp);
    assert.ok(enviados <= 6, `${enviados} KB leídos`);
    assert.ok(error.cuerpo.startsWith('{"error":{"type":"run-failed"}} xxx'), error.cuerpo);
    // Un texto enorme sin espacios no se queda buscando correos (antes, segundos).
    const inicio = performance.now();
    const parseo = await (simularRed([respuesta(200, 'x'.repeat(200_000))]), obtenerJson(URL_FEED).catch((e) => e));
    assert.ok(parseo instanceof ErrorParseo);
    assert.equal(parseo.cuerpo, 'x'.repeat(200));
    assert.ok(performance.now() - inicio < 1000, `${Math.round(performance.now() - inicio)} ms`);
    const muestra = async (cuerpoJson) => (simularRed([respuesta(200, cuerpoJson)]), (await obtenerJson(URL_FEED).catch((e) => e)).cuerpo);
    // Un JSON minificado cortado a mitad de un correo: no queda ni el trozo, y la muestra no se vacía.
    for (let n = 3950; n < 4100; n += 7) {
      const cuerpo = `{"a":"ana@uno.es","b":"${'y'.repeat(n)}","web":"https://uno.es/p","c":"juanperez@gmail.com"}]}FIN`;
      const texto = await muestra(cuerpo);
      assert.doesNotMatch(texto, /juanperez|ana@/, `n=${n}`);
      assert.ok(texto.startsWith('{"a":"(correo)","b":"yyy') && texto.length === 200, `n=${n}: «${texto}»`);
    }
    // Dos correos seguidos: de ninguno queda nada, ni el dominio.
    assert.equal(
      await muestra('{"reservas":[{"titular":"ana@uno.es","acompanante":"juan.perez@empresa-cliente.es","noches":2}]}x'),
      '{"reservas":[{"titular":"(correo)","acompanante":"(correo)","noches":2}]}x',
    );
    assert.equal(await muestra('<a href="mailto:info@hotel.es,juan.perez@gmail.com">escribenos</a>'), '<a href="mailto:(correo),(correo)">escribenos</a>');
    assert.equal(await muestra('<a href="mailto:reservas@hotel.es?cc=juan.perez@empresa-cliente.es">x</a>'), '<a href="mailto:(correo)(correo)">x</a>');
    assert.equal(await muestra('<a href="mailto:reservas@hotel.es%2Cjuan.perez@empresa-cliente.es">x</a>'), '<a href="mailto:(correo)(correo)">x</a>');
    assert.equal(await muestra('https://uno.es/p?from=ana@uno.es&to=juan.perez@gmail.com&x=1'), 'https:(correo)(correo)&x=1');
    // Con la arroba codificada, como lo monta encodeURIComponent.
    assert.equal(await muestra(`<a href="mailto:reservas@hotel.es?cc=${encodeURIComponent('juan.perez@empresa-cliente.es')}">x</a>`), '<a href="mailto:(correo)(correo)">x</a>');
    assert.equal(await muestra('https://uno.es/p?from=ana@uno.es&to=juan.perez%40gmail.com&x=1'), 'https:(correo)(correo)&x=1');
    // Si el corte de la ventana cae en un correo y la muestra se queda corta (casi todo eran
    // espacios), su trozo no sale.
    assert.equal(await muestra(`<p>Hola${'\n'.repeat(4070)}escribe a juan.perez@gmail.com</p>${'x'.repeat(100)}`), '<p>Hola escribe a');
    // Con el único espacio al principio, o con muchos espacios delante, la muestra no se queda vacía.
    assert.equal((await muestra(`)]}'\n{"vuelos":[${'{"id":0,"precio":0.5},'.repeat(300)}]}`)).length, 200);
    assert.equal(await muestra(`${' '.repeat(5000)}Access denied`), 'Access denied');
    // Un cuerpo enorme con muchos espacios tampoco se recorre entero (antes, unos 3 s con 18 MB).
    const desde = performance.now();
    assert.ok((await muestra(`<html><p>Hola</p>${'a '.repeat(9_000_000)}`)).startsWith('<html><p>Hola</p>a a a'));
    assert.ok(performance.now() - desde < 1000, `${Math.round(performance.now() - desde)} ms`);
  });

  test('de un error con muchos espacios delante, la muestra empieza en el texto y no sale ningún correo', async () => {
    const deError = async (trozos, estado = 503) => {
      const cola = trozos.map((t) => new TextEncoder().encode(t));
      const cuerpo = new ReadableStream({ pull(control) { const t = cola.shift(); if (t) control.enqueue(t); else control.close(); } });
      simularRed([{ ok: false, status: estado, headers: new Headers(), body: cuerpo, text: async () => { throw new Error('no se usa'); } }]);
      const error = await obtenerTexto(URL_FEED, { reintentos: 0 }).catch((e) => e);
      assert.ok(error instanceof ErrorHttp);
      return error.cuerpo;
    };
    // El correo partido entre dos trozos: se sigue leyendo y se tapa entero.
    assert.equal(
      await deError([`${'\n    '.repeat(820)}<html><p>Servicio no disponible. Escribe a juan.perez@empr`, 'esa-cliente.es</p></html>']),
      '<html><p>Servicio no disponible. Escribe a (correo)</p></html>',
    );
    // Leído entero en un trozo, no se toma por cortado (antes se perdía la última palabra).
    assert.equal(await deError([`${' '.repeat(5000)}Access denied`], 403), 'Access denied');
    assert.equal(await deError([`${' '.repeat(5000)}{"error":"Forbidden"}`], 403), '{"error":"Forbidden"}');
    // Cortado al leerlo justo en un correo, con casi todo espacios: sin ese final.
    assert.equal(await deError([`${' '.repeat(3000)}<p>Servicio${'\n'.repeat(4055)}no disponible. Escribe a juan.perez@em`, 'presa-cliente.es</p>', 'x'.repeat(70_000)]), '<p>Servicio no disponible. Escribe a');
    // Solo espacios y sin fin: se deja de leer (con un tope) y la muestra queda vacía.
    assert.equal(await deError(Array.from({ length: 40 }, () => ' '.repeat(4096))), '');
  });
});
