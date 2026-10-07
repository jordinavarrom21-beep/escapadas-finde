import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { datosDePagina, lugarDe, parsear } from '../src/fuentes/weekendesk.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const FLASH = leerFixture('weekendesk-cataluna-venta-flash.html');
const BARATAS = leerFixture('weekendesk-cataluna-baratas.html');
const [URL_FLASH, URL_BARATAS] = fuente.urls;
const PAGINAS = { [URL_FLASH]: FLASH, [URL_BARATAS]: BARATAS };
/** Página de desafío de AWS WAF (lo que devuelve CloudFront en vez de la página). */
const DESAFIO = '<html><head><script>window.gokuProps = {"key":"x"};</script><script src="https://abc.token.awswaf.com/abc/challenge.js"></script></head><body></body></html>';

const responder = (paginas) => (url) => {
  const respuesta = paginas[url];
  if (respuesta instanceof Error) throw respuesta;
  if (respuesta === undefined) throw new Error(`URL inesperada: ${url}`);
  return respuesta;
};

const flash = parsear(FLASH);
const baratas = parsear(BARATAS);

describe('parsear (páginas reales de Cataluña)', () => {
  it('lee los resultados de __NEXT_DATA__ y el total de la búsqueda', () => {
    assert.equal(datosDePagina(FLASH).resultados.length, 10);
    assert.equal(datosDePagina(FLASH).total, 10);
    assert.equal(datosDePagina(BARATAS).resultados.length, 24);
    assert.equal(datosDePagina(BARATAS).total, 198);
    assert.equal(datosDePagina('<html><body>sin datos</body></html>'), null);
  });

  it('extrae ofertas válidas y completas', () => {
    const logs = [];
    const ofertas = [...parsear(FLASH, { log: (m) => logs.push(m) }), ...parsear(BARATAS, { log: (m) => logs.push(m) })];
    assert.equal(flash.length, 10);
    assert.equal(baratas.length, 24);
    assert.deepEqual(logs, []);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.match(o.id, /^weekendesk:\d+$/);
      assert.match(o.url, /^https:\/\/www\.weekendesk\.es\/fin-de-semana\/\d+\//);
      assert.match(o.imagen, /^https:\/\/static\.booking\.weekendesk\.fr\//);
      assert.equal(o.tipo, 'escapada');
      assert.ok(o.precio > 20 && o.precio < 1000, `${o.titulo}: ${o.precio}`);
      assert.equal(o.unidad, 'total');
      assert.ok(o.noches >= 1);
      assert.equal(o.lugar.region, 'Cataluña');
    }
  });

  it('interpreta precio total, descuento, régimen, temas, lugar y etiquetas', () => {
    const lloret = flash.find((o) => o.id === 'weekendesk:21843318');
    assert.equal(lloret.titulo, 'Disfruta de Lloret de Mar en media pensión y acceso al Spa');
    assert.equal(lloret.establecimiento, 'Augusta Club & Spa +16', 'el hotel, no el nombre del plan');
    assert.equal(lloret.precio, 117);
    assert.equal(lloret.precioTexto, '117 € en total (1 noche para 2)');
    assert.equal(lloret.precioAnterior, 162);
    assert.equal(lloret.descuento, 28);
    assert.equal(lloret.regimen, 'media-pension');
    assert.deepEqual(lloret.temas, ['romantico', 'spa', 'playa']);
    assert.deepEqual(lloret.lugar, { nombre: 'Lloret de Mar', region: 'Cataluña', pais: 'España', codigoPais: 'ES', lat: null, lon: null, iata: null });
    assert.match(lloret.descripcion, /^Augusta Club & Spa \+16 \(4\*, 8,2\/10 en 17 opiniones\) · 1 noche/);
    for (const etiqueta of ['Venta flash', 'Hotel 4*', 'Acceso al spa']) assert.ok(lloret.etiquetas.includes(etiqueta), etiqueta);

    const dosNoches = baratas.find((o) => o.id === 'weekendesk:12558693');
    assert.equal(dosNoches.noches, 2);
    assert.equal(dosNoches.precio, 240);
    assert.equal(dosNoches.precioTexto, '240 € en total (2 noches para 2)');
    assert.equal(dosNoches.regimen, 'pension-completa');

    const sinRebaja = flash.find((o) => o.id === 'weekendesk:21338700');
    assert.equal(sinRebaja.precioAnterior, null);
    assert.equal(sinRebaja.descuento, null);
    assert.ok(flash.find((o) => o.id === 'weekendesk:6452331').etiquetas.includes('Último minuto'));
  });

  it('saca el lugar de la etiqueta de localización', () => {
    assert.deepEqual(lugarDe("Castelló d'Empuries, Cataluña, España"), {
      nombre: "Castelló d'Empuries", region: 'Cataluña', pais: 'España', codigoPais: 'ES', lat: null, lon: null, iata: null,
    });
    assert.equal(lugarDe('Andorra la Vella, Andorra').codigoPais, 'AD');
    assert.equal(lugarDe(''), null);
  });
});

describe('el formato nuevo de Weekendesk (Next.js App Router, desde el 7/10/2026)', () => {
  const html = leerFixture('weekendesk-app-router.html');
  it('lee los planes de cada hotel con el precio pasado de céntimos a euros', () => {
    const datos = datosDePagina(html);
    assert.equal(datos.resultados.length, 14);
    assert.deepEqual([datos.total, datos.mostrados], [14, 14], 'el total de Weekendesk cuenta hoteles, no planes');
    const ofertas = parsear(html, {}, ['Venta flash']);
    assert.equal(ofertas.length, 14);
    for (const o of ofertas) assert.deepEqual(validarOferta(o), [], o.id);
    const augusta = ofertas.find((o) => o.id === 'weekendesk:21843318');
    assert.deepEqual([augusta.precio, augusta.precioAnterior, augusta.unidad, augusta.noches, augusta.regimen], [125.48, 157, 'total', 1, 'media-pension']);
    assert.equal(augusta.establecimiento, 'Augusta Club & Spa +16');
    assert.deepEqual([augusta.lugar.nombre, augusta.valoracion], ['Lloret de Mar', { nota: 8.3, n: 15 }]);
    assert.match(augusta.url, /^https:\/\/www\.weekendesk\.es\/fin-de-semana\/21843318\//);
    assert.ok(augusta.etiquetas.includes('Venta flash') && augusta.etiquetas.includes('Hotel 4*'));
  });
  it('una página con trozos de Next.js pero sin hoteles falla claro', () => {
    const vacia = '<script>self.__next_f.push([1,"{\\"value\\":{\\"breadcrumb\\":[]}}"])</script>';
    assert.throws(() => datosDePagina(vacia), /no traen hoteles/);
    assert.equal(datosDePagina('<html>nada</html>'), null);
    // El objeto con los hoteles no tiene por qué ser el primero ni empezar por «breadcrumb».
    const otro = JSON.stringify(JSON.stringify({ value: { alternates: { a: 1 }, hotels: [{ label: 'H', weekend: [{ id: 1, uri: '/x', label: 'Plan', price: { sellPrice: 5000, nights: 1 } }] }] } }));
    const antes = JSON.stringify(JSON.stringify({ value: { breadcrumb: [], nada: true } }));
    const pagina = `<script>self.__next_f.push([1,${antes}])</script><script>self.__next_f.push([1,${otro}])</script>`;
    const d = datosDePagina(pagina);
    assert.deepEqual([d.resultados[0].sellPrice, d.total, d.mostrados], [50, Infinity, 1], 'sin total, la página no cuenta como entera');
    assert.throws(() => datosDePagina('<script>self.__next_f.push([1,"\\x"])</script>'), /no se puede leer/);
  });
});

describe('obtener', () => {
  it('pide solo las 2 páginas fijas con 2 s de pausa, une las repetidas y solo reemplaza las ventas flash', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: responder(PAGINAS) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.deepEqual(esperas, [2000]);
    assert.equal(ofertas.length, 33, 'la oferta de Lloret está en las dos páginas');
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    const lloret = ofertas.find((o) => o.id === 'weekendesk:21843318');
    assert.ok(lloret.etiquetas.includes('Venta flash') && lloret.etiquetas.includes('Escapada barata'));

    assert.equal(typeof reemplazar, 'function');
    assert.equal(reemplazar({ etiquetas: ['Venta flash'] }), true, 'la página de ventas flash está entera');
    assert.equal(reemplazar({ etiquetas: ['Escapada barata'] }), false, 'de las baratas solo se leen 24 de 198');
  });

  it('una página vacía (0 de 0) no cuenta como leída entera: no se borran sus ofertas guardadas', async () => {
    const vacia = '<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"initialState":{"search":{"exactMatches":[],"searchDetails":{"totalCount":0}}}}}}</script></html>';
    const { ctx } = crearCtx({ respuestas: responder({ ...PAGINAS, [URL_FLASH]: vacia }) });
    const { reemplazar } = await fuente.obtener(ctx);
    assert.equal(reemplazar, false, 'ninguna página entera con resultados: no se borra nada');
  });

  it('ante un desafío de AWS WAF deja de pedir y lanza un error claro', async () => {
    const { ctx, peticiones, logs } = crearCtx({ respuestas: responder({ ...PAGINAS, [URL_FLASH]: DESAFIO }) });
    await assert.rejects(fuente.obtener(ctx), /ninguna página de Weekendesk.*desafío anti-bot/);
    assert.deepEqual(peticiones, [URL_FLASH]);
    assert.ok(logs.some((l) => l.includes('no se piden más páginas')));
  });

  it('si bloquea (403) en la segunda página se queda con la primera', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: responder({ ...PAGINAS, [URL_BARATAS]: new ErrorHttp(403, URL_BARATAS) }) });
    const { ofertas } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 2);
    assert.equal(ofertas.length, flash.length);
  });

  it('si la web cambia y no trae __NEXT_DATA__ falla sin inventar ofertas', async () => {
    const { ctx } = crearCtx({ respuestas: () => '<html><body><h1>Escapadas</h1></body></html>' });
    await assert.rejects(fuente.obtener(ctx), /no trae datos de ofertas, ni __NEXT_DATA__/);
  });
});

describe('robots.txt', () => {
  it('permite las páginas que pide la fuente', () => {
    const robots = leerFixture('weekendesk-robots.txt');
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.ok(rutaPermitida(robots, `${pathname}${search}`), url);
    }
    assert.equal(rutaPermitida(robots, '/mvc/search/results.jsp?x=1'), false, 'la búsqueda (API) sí está prohibida');
  });
});
