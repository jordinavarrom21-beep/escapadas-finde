import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { parsear, parsearTarjetas, rutasVigiladas } from '../src/fuentes/volotea.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const GENERAL = leerFixture('volotea-ofertas.html');
const BARCELONA = leerFixture('volotea-barcelona.html');
const [URL_GENERAL, URL_BARCELONA] = fuente.urls;
const PAGINAS = { [URL_GENERAL]: GENERAL, [URL_BARCELONA]: BARCELONA };

const responder = (paginas) => (url) => {
  const respuesta = paginas[url];
  if (respuesta instanceof Error) throw respuesta;
  return respuesta;
};
const ofertas = parsear(GENERAL, BARCELONA);
const destino = (nombre) => ofertas.find((o) => o.lugar.nombre === nombre);

describe('parsearTarjetas', () => {
  it('lee origen, destino, país y los dos precios de cada tarjeta', () => {
    const tarjetas = parsearTarjetas(GENERAL);
    assert.ok(tarjetas.length > 150, `${tarjetas.length} tarjetas`);
    assert.ok(tarjetas.every((t) => t.origen && t.destino && t.precio > 0), 'tarjetas completas');
    assert.deepEqual(
      tarjetas.find((t) => t.origen === 'Barcelona' && t.destino === 'Olbia'),
      { origen: 'Barcelona', destino: 'Olbia', pais: 'Italia', precio: 19, precioVuelta: 19, href: '/es/ofertas-vuelos/barcelona/olbia/', destacada: false },
    );
  });
});

describe('parsear (páginas reales)', () => {
  it('solo devuelve vuelos que salen de Barcelona, válidos y sin repetir', () => {
    assert.equal(ofertas.length, 12);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.match(o.id, /^volotea:barcelona-[a-z-]+$/);
      assert.equal(o.tipo, 'vuelo');
      assert.equal(o.vuelo, null);
      assert.equal(o.transporte, 'avion');
      assert.equal(o.unidad, null);
      assert.match(o.precioTexto, /por trayecto \(solo ida, tasas incluidas\)/);
      assert.notEqual(o.lugar.nombre, 'Barcelona');
      assert.match(o.url, /^https:\/\/www\.volotea\.com\/es\/ofertas-vuelos\/barcelona\/[a-z-]+\/$/);
    }
  });

  it('las rutas de la página general conservan su precio, país y enlace', () => {
    const olbia = destino('Olbia');
    assert.equal(olbia.id, 'volotea:barcelona-olbia');
    assert.equal(olbia.precio, 19);
    assert.equal(olbia.precioTexto, 'desde 19 € por trayecto (solo ida, tasas incluidas); vuelta desde 19 €');
    assert.deepEqual([olbia.lugar.pais, olbia.lugar.codigoPais], ['Italia', 'IT']);
    assert.equal(olbia.url, 'https://www.volotea.com/es/ofertas-vuelos/barcelona/olbia/');
  });

  it('de la página de vuelos a Barcelona usa el precio de vuelta como ida desde Barcelona', () => {
    const brest = destino('Brest');
    assert.equal(brest.id, 'volotea:barcelona-brest');
    assert.equal(brest.precio, 39);
    assert.deepEqual([brest.lugar.pais, brest.lugar.codigoPais], ['Francia', 'FR']);
    assert.equal(brest.url, 'https://www.volotea.com/es/ofertas-vuelos/barcelona/brest/');
    assert.equal(destino('Asturias').lugar.pais, 'España');
  });

  it('también acepta salidas desde Girona o Reus', () => {
    const tarjeta = (origen, destinoTarjeta, precio) => ({ origen, destino: destinoTarjeta, pais: 'Italia', precio, precioVuelta: null, href: '', destacada: false });
    const rutas = rutasVigiladas([tarjeta('Girona', 'Nápoles', 25), tarjeta('Reus', 'Olbia', 30), tarjeta('Madrid', 'Olbia', 20)]);
    assert.deepEqual(rutas.map((r) => r.clave), ['girona-napoles', 'reus-olbia']);
  });
});

describe('obtener', () => {
  it('lee las dos páginas con una pausa de 2 s y reemplaza el catálogo', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: responder(PAGINAS) });
    const resultado = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.deepEqual(esperas, [2000]);
    assert.equal(resultado.reemplazar, true);
    assert.equal(resultado.ofertas.length, 12);
  });

  it('si la segunda página devuelve 403 se queda con la general y no reemplaza', async () => {
    const { ctx, logs } = crearCtx({ respuestas: responder({ ...PAGINAS, [URL_BARCELONA]: new ErrorHttp(403, URL_BARCELONA) }) });
    const resultado = await fuente.obtener(ctx);
    assert.equal(resultado.reemplazar, false);
    assert.equal(resultado.ofertas.length, 4);
    assert.ok(logs.some((l) => l.includes('bloqueado')));
  });

  it('ante un desafío anti-bot lanza un error claro y no pide más páginas', async () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>';
    const { ctx, peticiones } = crearCtx({ respuestas: () => desafio });
    await assert.rejects(fuente.obtener(ctx), /ninguna página de Volotea.*desafío anti-bot/);
    assert.equal(peticiones.length, 1);
  });
});

describe('robots.txt', () => {
  it('permite todas las URLs que declara la fuente', () => {
    const robots = leerFixture('volotea-robots.txt');
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
    assert.equal(rutaPermitida(robots, '/es/ofertas-de-vuelo/'), false);
  });
});
