import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { actividadesDe, extrasDeTarjetas, parsear } from '../src/fuentes/civitatis.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const SLUGS = ['barcelona', 'gerona', 'tarragona', 'sitges', 'costa-brava'];
const PAGINAS = Object.fromEntries(SLUGS.map((slug) => [slug, leerFixture(`civitatis-${slug}.html`)]));
const urlDe = (slug) => `https://www.civitatis.com/es/${slug}/`;
const BARCELONA = { slug: 'barcelona', nombre: 'Barcelona', region: 'Barcelona', lat: 41.3851, lon: 2.1734 };
const COSTA_BRAVA = { slug: 'costa-brava', nombre: 'Costa Brava', region: 'Girona', lat: 41.95, lon: 3.1667 };

function respuestas(cambios = {}) {
  return (url) => {
    const slug = url.split('/').at(-2);
    const respuesta = slug in cambios ? cambios[slug] : PAGINAS[slug];
    if (respuesta instanceof Error) throw respuesta;
    if (respuesta === undefined) throw new Error(`url inesperada: ${url}`);
    return respuesta;
  };
}

/** Página con un único bloque ItemList con las actividades dadas. */
const pagina = (actividades) => `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'ItemList', itemListElement: actividades.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })),
})}</script></head><body></body></html>`;
const actividad = (campos = {}) => ({
  '@type': 'Event', name: 'Tour por el Born', description: 'Paseo guiado', url: 'https://www.civitatis.com/es/barcelona/tour-born/',
  image: '/f/espana/barcelona/tour-born.jpg', offers: { price: 25, priceCurrency: 'EUR' },
  aggregateRating: { ratingValue: 4.5, reviewCount: '10', bestRating: '5' },
  location: { address: { addressLocality: 'Barcelona' } }, ...campos,
});

describe('civitatis: parsear (páginas reales)', () => {
  const { ctx, logs } = crearCtx();
  const barcelona = parsear(PAGINAS.barcelona, ctx, BARCELONA);

  it('convierte el catálogo JSON-LD en actividades válidas', () => {
    assert.equal(barcelona.length, 39);
    assert.deepEqual(logs, []);
    assert.equal(new Set(barcelona.map((o) => o.id)).size, 39);
    for (const o of barcelona) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.equal(o.tipo, 'actividad');
      assert.match(o.id, /^civitatis:barcelona:[a-z0-9-]+$/);
      assert.equal(o.unidad, 'pp', 'el «desde» de Civitatis es por plaza');
      assert.match(o.url, /^https:\/\/www\.civitatis\.com\/es\/[a-z-]+\/[a-z0-9-]+\/$/);
      assert.match(o.imagen, /^https:\/\/www\.civitatis\.com\//);
      assert.ok(!o.url.includes('/es/general/'), 'nada de eSIM ni seguros');
    }
  });

  it('Montserrat: precio, tachado, descuento, duración y nota, como en la tarjeta', () => {
    // Tarjeta: «desde 59 € 50,15 € (-15%)», duración «5h 30m - 7h»; JSON-LD: 9,0018 sobre 10 con 1628 opiniones.
    const o = barcelona.find((x) => x.id === 'civitatis:barcelona:excursion-montserrat');
    assert.equal(o.precio, 50.15);
    assert.equal(o.precioTexto, 'desde 50,15 € por persona');
    assert.equal(o.precioAnterior, 59);
    assert.equal(o.descuento, 15);
    assert.deepEqual(o.valoracion, { nota: 9, n: 1628 });
    assert.deepEqual(o.etiquetas, ['Duración: 5h 30m - 7h']);
    assert.deepEqual(o.lugar, { nombre: 'Barcelona', region: 'Barcelona', pais: 'España', codigoPais: 'ES', lat: 41.3851, lon: 2.1734, iata: null });
  });

  it('los free tours valen 0 € y llevan la etiqueta «gratis»', () => {
    const o = barcelona.find((x) => x.id === 'civitatis:barcelona:free-tour-barcelona');
    assert.equal(o.precio, 0);
    assert.equal(o.precioTexto, 'Gratis (propina voluntaria)');
    assert.ok(o.etiquetas.includes('gratis'));
    assert.deepEqual(o.temas, ['ciudad']);
    assert.equal(barcelona.filter((x) => x.precio === 0).length, 8);
  });

  it('las tarjetas del HTML solo dan extras de las primeras actividades', () => {
    const extras = extrasDeTarjetas(PAGINAS.barcelona);
    assert.ok(extras.size > 0 && extras.size < actividadesDe(PAGINAS.barcelona).length);
    assert.deepEqual(extras.get('/es/barcelona/excursion-montserrat/'), { duracion: '5h 30m - 7h', precioAnterior: 59, descuento: 15 });
  });

  it('en la Costa Brava (un hub) no inventa coordenadas y usa el nombre oficial del pueblo', () => {
    const costa = parsear(PAGINAS['costa-brava'], {}, COSTA_BRAVA);
    assert.equal(costa.length, 25);
    assert.ok(costa.every((o) => o.lugar.lat === null && o.lugar.lon === null), 'las completa geo.js');
    const nombres = new Set(costa.map((o) => o.lugar.nombre));
    for (const exonimo of ['Gerona', 'Rosas', 'Estartit']) assert.ok(!nombres.has(exonimo), exonimo);
    assert.ok(nombres.has('Girona') && nombres.has('Roses') && nombres.has("L'Estartit"));
  });
});

describe('civitatis: casos límite', () => {
  it('sin ItemList distingue el desafío anti-bot de un cambio de la web', () => {
    assert.throws(() => actividadesDe('<html><title>Just a moment...</title><div id="cf-chl-widget"></div></html>'), (e) => e.bloqueo === true);
    assert.throws(() => actividadesDe('<html><body>Hola</body></html>'), /no trae el bloque ItemList/);
  });

  it('un bloque JSON-LD roto no impide leer el ItemList', () => {
    const html = pagina([actividad()]).replace('<head>', '<head><script type="application/ld+json">{"@type":</script>');
    assert.equal(parsear(html, {}, BARCELONA).length, 1);
  });

  it('otra moneda o un precio negativo no se toman como euros', () => {
    const [dolares] = parsear(pagina([actividad({ offers: { price: 30, priceCurrency: 'USD' } })]), {}, BARCELONA);
    assert.equal(dolares.precio, null);
    assert.equal(dolares.unidad, null);
    assert.equal(dolares.precioTexto, '');
    const [negativo] = parsear(pagina([actividad({ offers: { price: -3, priceCurrency: 'EUR' } })]), {}, BARCELONA);
    assert.equal(negativo.precio, null);
  });

  it('normaliza la nota a 10 y no la inventa sin opiniones', () => {
    const [cinco] = parsear(pagina([actividad()]), {}, BARCELONA);
    assert.deepEqual(cinco.valoracion, { nota: 9, n: 10 });
    const [sinOpiniones] = parsear(pagina([actividad({ aggregateRating: { ratingValue: 4.5, reviewCount: '0' } })]), {}, BARCELONA);
    assert.equal(sinOpiniones.valoracion, null);
  });

  it('descarta y registra la actividad sin URL; la de productos globales se ignora sin más', () => {
    const { ctx, logs } = crearCtx();
    const ofertas = parsear(pagina([actividad({ url: undefined }), actividad({ url: 'https://www.civitatis.com/es/general/esim-europa/' }), actividad()]), ctx, BARCELONA);
    assert.equal(ofertas.length, 1);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /Actividad descartada.*sin URL/);
  });
});

describe('civitatis: obtener', () => {
  it('pide los cinco destinos con 2 s de pausa, sin reintentos, y no repite actividades', async () => {
    const pedidas = [];
    const { ctx, esperas } = crearCtx({ respuestas: respuestas() });
    const texto = ctx.http.texto;
    ctx.http.texto = (url, opciones) => { pedidas.push(opciones); return texto(url, opciones); };
    const { ofertas } = await fuente.obtener(ctx);
    assert.deepEqual(esperas, [2000, 2000, 2000, 2000]);
    assert.ok(pedidas.every((o) => o.reintentos === 0));
    assert.equal(ofertas.length, 87);
    const rutas = ofertas.map((o) => new URL(o.url).pathname);
    assert.equal(new Set(rutas).size, rutas.length, 'la actividad del hub se queda con su destino concreto');
    const gerona = ofertas.find((o) => o.url.endsWith('/es/gerona/free-tour-gerona/'));
    assert.equal(gerona.id, 'civitatis:gerona:free-tour-gerona');
    assert.equal(gerona.lugar.lat, 41.9794);
  });

  it('reemplazar solo afecta a los destinos leídos bien', async () => {
    const { ctx } = crearCtx({ respuestas: respuestas({ tarragona: new ErrorHttp(500, urlDe('tarragona')) }) });
    const { reemplazar } = await fuente.obtener(ctx);
    assert.ok(reemplazar({ id: 'civitatis:barcelona:x' }));
    assert.ok(!reemplazar({ id: 'civitatis:tarragona:x' }));
  });

  it('ante un 429 deja de pedir y devuelve lo leído', async () => {
    const { ctx, peticiones, logs } = crearCtx({ respuestas: respuestas({ gerona: new ErrorHttp(429, urlDe('gerona')) }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, [urlDe('barcelona'), urlDe('gerona')]);
    assert.equal(ofertas.length, 39);
    assert.ok(logs.some((l) => l.includes('bloqueado o limitado')));
  });

  it('si no lee ningún destino lanza un error con el último motivo', async () => {
    const { ctx } = crearCtx({ respuestas: () => '<html><body>Hola</body></html>' });
    await assert.rejects(fuente.obtener(ctx), /ningún destino de Civitatis.*ItemList/);
  });
});

describe('civitatis: robots.txt', () => {
  const robots = leerFixture('civitatis-robots.txt');

  it('permite las páginas de destino y prohíbe la API del scroll', () => {
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
    assert.ok(!rutaPermitida(robots, '/es/barcelona/api/'));
  });
});
