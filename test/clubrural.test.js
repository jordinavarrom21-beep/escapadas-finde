import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { caracteristicas, parsear, rutaDestino } from '../src/fuentes/clubrural.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const FINDE = leerFixture('clubrural-fin-de-semana.html');
const ESCAPADA = leerFixture('clubrural-escapada-fin-de-semana.html');
const [URL_FINDE, URL_ESCAPADA] = fuente.urls;

function respuestas(cambios = {}) {
  const paginas = { [URL_FINDE]: FINDE, [URL_ESCAPADA]: ESCAPADA, ...cambios };
  return (url) => {
    if (paginas[url] instanceof Error) throw paginas[url];
    return paginas[url];
  };
}

const finde = parsear(FINDE);
const escapada = parsear(ESCAPADA);
const porId = (lista, id) => lista.find((o) => o.id === `clubrural:${id}`);

describe('clubrural: parsear (páginas reales)', () => {
  for (const [nombre, html] of [['fin de semana', FINDE], ['escapada fin de semana', ESCAPADA]]) {
    it(`convierte las 16 casas de «${nombre}» en ofertas válidas e ignora los formularios que no son casas`, () => {
      const { ctx, logs } = crearCtx();
      const lista = parsear(html, ctx);
      assert.equal(lista.length, 16);
      assert.deepEqual(logs, []);
      for (const o of lista) {
        assert.deepEqual(validarOferta(o), [], o.id);
        assert.match(o.id, /^clubrural:\d+$/);
        assert.match(o.url, /^https:\/\/www\.clubrural\.com\/s\/[^?]+\?propertyType=AGRITOURISM&includeOfferIds=\d+$/);
        assert.ok(!o.url.includes('redirect'), o.url);
        assert.equal(o.tipo, 'hotel');
        assert.equal(o.unidad, 'noche');
        assert.ok(o.precio > 10 && o.precio < 2000, `${o.titulo}: ${o.precio}`);
        assert.match(o.precioTexto, /^desde \d+ € \/ noche \(alojamiento para \d+ personas\)$/);
        assert.ok(o.temas.includes('rural'));
        assert.match(o.imagen, /^https:\/\/img\.holidu\.com\//);
        assert.equal(o.lugar.pais, 'España');
      }
    });
  }

  it('rellena título, lugar, precio, régimen y etiquetas', () => {
    const cadalso = porId(finde, '56956009');
    assert.equal(cadalso.titulo, 'Chalet para 10 personas en Cadalso de los Vidrios');
    assert.equal(cadalso.url, 'https://www.clubrural.com/s/Provincia-de-Madrid--Espa%C3%B1a?propertyType=AGRITOURISM&includeOfferIds=56956009');
    assert.equal(cadalso.precio, 375);
    assert.equal(cadalso.precioTexto, 'desde 375 € / noche (alojamiento para 10 personas)');
    assert.deepEqual([cadalso.lugar.nombre, cadalso.lugar.region], ['Cadalso de los Vidrios', 'Madrid']);
    assert.deepEqual(cadalso.etiquetas, ['Chalet', 'Hasta 10 personas', 'Balcón', 'Jacuzzi', 'Jardín', 'Valoración 9.8/10 (32 opiniones)']);
    assert.match(cadalso.descripcion, /^Situada en Cadalso de los Vidrios/);

    const avinyo = porId(finde, '65462765');
    assert.equal(avinyo.lugar.region, 'Barcelona');
    assert.ok(avinyo.etiquetas.includes('Pla de Bages DO'));

    assert.equal(porId(finde, '57014215').regimen, 'desayuno');
    const caserras = porId(finde, '61266756');
    assert.deepEqual(caserras.temas, ['rural', 'familia']);
    assert.ok(caserras.etiquetas.includes('Ideal para familias'));
    assert.equal(porId(escapada, '60892681').lugar.region, 'Castellón');
  });

  it('decodifica la ruta del formulario y las características del texto alternativo', () => {
    assert.equal(rutaDestino(Buffer.from('/s/Provincia-de-Lleida--España?includeOfferIds=1').toString('base64')).searchParams.get('includeOfferIds'), '1');
    assert.equal(rutaDestino(Buffer.from('https://www.holidu.es/careers').toString('base64')), null);
    assert.deepEqual(caracteristicas('Casa rural para 5 personas, con Balcón y Terraza además de Jardín y Piscina en '), ['Balcón', 'Terraza', 'Jardín', 'Piscina']);
    assert.deepEqual(caracteristicas('Chalet para 12 personas en '), []);
  });
});

describe('clubrural: obtener', () => {
  it('lee las 2 páginas con una pausa de 2 s, quita las repetidas y reemplaza el catálogo', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: respuestas() });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.deepEqual(esperas, [2000]);
    assert.equal(reemplazar, true);
    assert.equal(ofertas.length, 29);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
  });

  it('si la web bloquea (429) no reemplaza el catálogo', async () => {
    const { ctx, logs } = crearCtx({ respuestas: respuestas({ [URL_ESCAPADA]: new ErrorHttp(429, URL_ESCAPADA) }) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.equal(reemplazar, false);
    assert.equal(ofertas.length, 16);
    assert.ok(logs.some((l) => l.includes('bloqueado')));
  });

  it('lanza un error claro si solo recibe un desafío anti-bot', async () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body class="cf-chl"></body></html>';
    const { ctx, peticiones } = crearCtx({ respuestas: () => desafio });
    await assert.rejects(fuente.obtener(ctx), /ninguna página de Clubrural.*desafío anti-bot/);
    assert.equal(peticiones.length, 1);
  });
});

describe('clubrural: robots.txt', () => {
  it('permite las páginas que pide y prohíbe la redirección que no se usa', () => {
    const robots = leerFixture('clubrural-robots.txt');
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
    assert.ok(!rutaPermitida(robots, '/redirect/prg'));
  });
});
