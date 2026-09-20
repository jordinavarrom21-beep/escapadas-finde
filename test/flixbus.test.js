import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { DESTINOS, ofertaDestino, parsearTrayectos, urlBusqueda } from '../src/fuentes/flixbus.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { comprobarRobots, rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture, leerFixtureJson } from './ayudas.js';

const VIERNES = '2026-09-18';
const FIXTURES = { perpignan: 'per', montpellier: 'mpl', toulouse: 'tls', 'andorra-la-vella': 'and', zaragoza: 'zar' };
const RESPUESTAS = Object.fromEntries(DESTINOS.map((d) => [urlBusqueda(d, VIERNES), leerFixtureJson(`flixbus-bcn-${FIXTURES[d.slug]}.json`)]));
const SIN_RESULTADOS = leerFixtureJson('flixbus-sin-resultados.json');
const destino = (slug) => DESTINOS.find((d) => d.slug === slug);

const responder = (cambios = {}) => (url) => {
  const respuesta = cambios[url] ?? RESPUESTAS[url];
  if (respuesta instanceof Error) throw respuesta;
  return respuesta;
};

describe('parsearTrayectos', () => {
  it('ordena por precio los trayectos con plazas y descarta los completos', () => {
    const perpinan = parsearTrayectos(RESPUESTAS[urlBusqueda(destino('perpignan'), VIERNES)]);
    assert.equal(perpinan.length, 9);
    assert.deepEqual(perpinan.map((t) => t.precio), [...perpinan.map((t) => t.precio)].sort((a, b) => a - b));
    assert.deepEqual(
      { ...perpinan[0], duracion: undefined },
      { salida: '2026-09-18T22:20:00', llegada: '2026-09-19T01:40:00', salidaIso: '2026-09-18T20:20:00.000Z', duracion: undefined, precio: 10.99, gestion: 0.99, plazas: 23, directo: true, tren: false, socios: [] },
    );
    const andorra = parsearTrayectos(RESPUESTAS[urlBusqueda(destino('andorra-la-vella'), VIERNES)]);
    assert.equal(andorra.length, 2, 'el de las 18:15 está completo');
    assert.deepEqual(parsearTrayectos(SIN_RESULTADOS), []);
  });
});

describe('ofertaDestino', () => {
  it('crea una oferta con el trayecto más barato', () => {
    const o = ofertaDestino(RESPUESTAS[urlBusqueda(destino('perpignan'), VIERNES)], destino('perpignan'), VIERNES);
    assert.deepEqual(validarOferta(o), []);
    assert.equal(o.id, 'flixbus:barcelona-perpignan:2026-09-18');
    assert.equal(o.tipo, 'escapada');
    assert.equal(o.titulo, 'Bus Barcelona – Perpiñán el vie 18 sep desde 10,99 €');
    assert.equal(o.precio, 10.99);
    assert.equal(o.unidad, null);
    assert.equal(o.precioTexto, '10,99 € por persona, solo ida (+0,99 € de gestión)');
    assert.equal(o.transporte, 'bus');
    assert.deepEqual(o.fechas, { salida: '2026-09-18T22:20:00', vuelta: null, findeId: null, puenteId: null });
    assert.equal(o.caduca, '2026-09-18T20:20:00.000Z');
    assert.deepEqual([o.lugar.nombre, o.lugar.codigoPais, o.lugar.lat], ['Perpiñán', 'FR', 42.6971]);
    assert.match(o.descripcion, /llega el sáb 19 sep a las 01:40/);
    assert.match(o.url, /^https:\/\/shop\.flixbus\.es\/search\?departureCity=[\da-f-]+&arrivalCity=[\da-f-]+&rideDate=18\.09\.2026&adult=1$/);
  });

  it('marca los trenes de socios que vende FlixBus', () => {
    const o = ofertaDestino(RESPUESTAS[urlBusqueda(destino('zaragoza'), VIERNES)], destino('zaragoza'), VIERNES);
    assert.equal(o.transporte, 'tren');
    assert.ok(o.titulo.startsWith('Tren Barcelona – Zaragoza'));
    assert.ok(o.etiquetas.includes('Iryo'));
  });

  it('devuelve null si no hay plazas', () => {
    assert.equal(ofertaDestino(SIN_RESULTADOS, destino('perpignan'), VIERNES), null);
  });
});

describe('obtener', () => {
  it('consulta los 5 destinos del viernes del próximo finde con pausas de 2 s', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: responder() });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, DESTINOS.map((d) => urlBusqueda(d, VIERNES)));
    assert.ok(peticiones.every((url) => url.includes('departure_date=18.09.2026')));
    assert.deepEqual(esperas, [2000, 2000, 2000, 2000]);
    assert.equal(ofertas.length, 5);
    assert.equal(reemplazar({ id: 'flixbus:barcelona-toulouse:2026-09-11' }), true);
  });

  it('usa ctx.findes[0] cuando lo hay', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => SIN_RESULTADOS });
    ctx.findes = [{ id: '2026-09-25', viernes: '2026-09-25' }];
    const { ofertas } = await fuente.obtener(ctx);
    assert.ok(peticiones.every((url) => url.includes('departure_date=25.09.2026')));
    assert.deepEqual(ofertas, []);
  });

  it('si FlixBus limita (429) deja de consultar y solo reemplaza los destinos consultados', async () => {
    const segundo = urlBusqueda(DESTINOS[1], VIERNES);
    const { ctx, peticiones, logs } = crearCtx({ respuestas: responder({ [segundo]: new ErrorHttp(429, segundo) }) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 2);
    assert.equal(ofertas.length, 1);
    assert.equal(reemplazar({ id: `flixbus:barcelona-${DESTINOS[0].slug}:2026-09-11` }), true);
    assert.equal(reemplazar({ id: `flixbus:barcelona-${DESTINOS[1].slug}:2026-09-11` }), false);
    assert.ok(logs.some((l) => l.includes('bloqueado')));
  });

  it('lanza un error claro si no puede consultar ningún destino', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: (url) => { throw new ErrorHttp(403, url); } });
    await assert.rejects(fuente.obtener(ctx), /No se ha podido consultar FlixBus.*HTTP 403/);
    assert.equal(peticiones.length, 1);
  });
});

describe('robots.txt', () => {
  it('la API no tiene robots.txt (404) y el de flixbus.es no prohíbe la búsqueda', async () => {
    const { ctx } = crearCtx({ respuestas: (url) => { throw new ErrorHttp(404, url); } });
    await comprobarRobots(ctx, fuente.urls);
    assert.ok(rutaPermitida(leerFixture('flixbus-robots.txt'), '/search'));
  });
});
