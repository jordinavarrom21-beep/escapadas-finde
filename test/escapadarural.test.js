import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { desplegarNuxt, parsear } from '../src/fuentes/escapadarural.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const OFERTAS = leerFixture('escapadarural-ofertas.html');
const OFERTAS_2 = leerFixture('escapadarural-ofertas-p2.html');
const GIRONA = leerFixture('escapadarural-girona.html');
const WEB = 'https://www.escapadarural.com';

/** Respuestas simuladas: las provincias que no son Girona reciben también la página de Girona. */
function respuestas(cambios = {}) {
  return (url) => {
    const respuesta = cambios[url] ?? (url.endsWith('?page=2') ? OFERTAS_2 : url.includes('/ofertas-') ? OFERTAS : GIRONA);
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  };
}

const ofertas = parsear(OFERTAS);
const girona = parsear(GIRONA);
const porId = (lista, id) => lista.find((o) => o.id === `escapadarural:${id}`);

describe('escapadarural: desplegarNuxt', () => {
  it('resuelve índices, envoltorios de Nuxt y referencias repetidas', () => {
    const plano = [['ShallowReactive', 1], { a: 2, b: 3, c: 2, d: -1 }, { x: 4 }, [4, 5], 'hola', ['Date', '2026-09-18T00:00:00.000Z']];
    const valor = desplegarNuxt(plano);
    assert.deepEqual(valor, { a: { x: 'hola' }, b: ['hola', '2026-09-18T00:00:00.000Z'], c: { x: 'hola' }, d: undefined });
    assert.equal(valor.a, valor.c);
  });
});

describe('escapadarural: parsear (páginas reales)', () => {
  for (const [nombre, html] of [['ofertas', OFERTAS], ['ofertas página 2', OFERTAS_2], ['Girona', GIRONA]]) {
    it(`convierte las 20 casas de ${nombre} en ofertas válidas`, () => {
      const { ctx, logs } = crearCtx();
      const lista = parsear(html, ctx);
      assert.equal(lista.length, 20);
      assert.deepEqual(logs, []);
      assert.equal(new Set(lista.map((o) => o.id)).size, lista.length);
      for (const o of lista) {
        assert.deepEqual(validarOferta(o), [], o.id);
        assert.match(o.id, /^escapadarural:[\da-f]{13}$/);
        assert.match(o.url, /^https:\/\/www\.escapadarural\.com\/casa-rural\/[a-z-]+\/[\w-]+$/);
        assert.equal(o.tipo, 'hotel');
        assert.equal(o.unidad, 'pp/noche');
        assert.ok(o.precio >= 10 && o.precio <= 200, `${o.titulo}: ${o.precio}`);
        assert.deepEqual(o.temas, ['rural']);
        assert.ok(o.descripcion.length <= 300);
        assert.ok(Number.isFinite(o.lugar.lat) && Number.isFinite(o.lugar.lon), o.id);
      }
    });
  }

  it('rellena precio, lugar, imagen y etiquetas de una casa en oferta', () => {
    const haza = porId(ofertas, '65d734b152d65');
    assert.equal(haza.titulo, 'Casa Rural Muralla De Haza');
    assert.equal(haza.url, `${WEB}/casa-rural/burgos/casa-rural-muralla-de-haza`);
    assert.equal(haza.precio, 26);
    assert.equal(haza.precioTexto, '26 € por persona y noche (aprox.)');
    assert.equal(haza.regimen, 'solo-alojamiento');
    assert.deepEqual(haza.lugar, { nombre: 'Haza', region: 'Burgos', pais: 'España', codigoPais: 'ES', lat: 41.621095, lon: -3.829717, iata: null });
    assert.equal(haza.imagen, 'https://webp.er2.co/es/burgos/65d734b152d65/375/65d8addcc67bf.webp');
    assert.deepEqual(haza.etiquetas, [
      'Casa rural', 'Alquiler íntegro', 'Hasta 8 personas', 'Con ofertas', 'Cancelación gratuita', 'Reserva online',
      'Valoración 5/5 (4 opiniones)',
    ]);
  });

  it('en las provincias solo marca «Con ofertas» las casas que tienen oferta', () => {
    const conOferta = girona.filter((o) => o.etiquetas.includes('Con ofertas'));
    assert.equal(conOferta.length, 1);
    const orfes = porId(girona, '0000000012298');
    assert.equal(orfes.lugar.region, 'Girona');
    assert.equal(orfes.precio, 33);
    const habitaciones = girona.find((o) => o.etiquetas.includes('Alquiler por habitaciones'));
    assert.equal(habitaciones.regimen, null);
  });

  it('devuelve null si la página no trae el bloque de datos', () => {
    assert.equal(parsear('<html><title>Just a moment...</title></html>'), null);
  });
});

describe('escapadarural: obtener', () => {
  it('pide las 6 páginas con pausas de 2 s, quita repetidas y no reemplaza el catálogo', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: respuestas() });
    const { ofertas: todas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.equal(peticiones.length, 6);
    assert.deepEqual(esperas, [2000, 2000, 2000, 2000, 2000]);
    assert.ok(!reemplazar);
    const distintas = new Set([...ofertas, ...parsear(OFERTAS_2), ...girona].map((o) => o.id));
    assert.equal(todas.length, distintas.size);
    assert.equal(new Set(todas.map((o) => o.id)).size, todas.length);
  });

  it('si la web bloquea (403) deja de pedir y devuelve lo leído', async () => {
    const bloqueo = new ErrorHttp(403, `${WEB}/ofertas-casas-rurales?page=2`);
    const { ctx, peticiones, logs } = crearCtx({ respuestas: respuestas({ [`${WEB}/ofertas-casas-rurales?page=2`]: bloqueo }) });
    const { ofertas: todas } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 2);
    assert.equal(todas.length, 20);
    assert.ok(logs.some((l) => l.includes('bloqueado')));
  });

  it('lanza un error claro si solo recibe un desafío anti-bot', async () => {
    const desafio = '<html><head><title>Human Verification</title><script src="https://x.awswaf.com/challenge.js"></script></head></html>';
    const { ctx, peticiones } = crearCtx({ respuestas: () => desafio });
    await assert.rejects(fuente.obtener(ctx), /ninguna página de Escapada Rural.*desafío anti-bot/);
    assert.equal(peticiones.length, 1);
  });
});

describe('escapadarural: robots.txt', () => {
  it('permite todas las URLs que declara la fuente', () => {
    const robots = leerFixture('escapadarural-robots.txt');
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.ok(rutaPermitida(robots, `${pathname}${search}`), url);
    }
    assert.ok(!rutaPermitida(robots, '/casas-rurales/girona?viz=map'));
  });
});
