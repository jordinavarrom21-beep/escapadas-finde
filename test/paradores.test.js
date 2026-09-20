import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { numeroDePaginas, paradorDe, parsear } from '../src/fuentes/paradores.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const PAGINA_1 = leerFixture('paradores-ofertas.html');
const PAGINA_2 = leerFixture('paradores-ofertas-2.html');
const PAGINAS = {
  'https://www.paradores.es/es/ofertas': PAGINA_1,
  'https://www.paradores.es/es/ofertas?page=1': PAGINA_2,
};

const responder = (paginas) => (url) => {
  const respuesta = paginas[url];
  if (respuesta instanceof Error) throw respuesta;
  if (respuesta === undefined) throw new Error(`URL inesperada: ${url}`);
  return respuesta;
};

const primera = parsear(PAGINA_1);
const segunda = parsear(PAGINA_2);
const porNid = (ofertas, nid) => ofertas.find((o) => o.id === `paradores:${nid}`);

describe('paradores: parsear (listado real)', () => {
  it('extrae las promociones sin repetir las destacadas y sin canjes de puntos', () => {
    assert.equal(primera.length, 12);
    assert.equal(segunda.length, 11, '7 destacadas repetidas + 4 del listado');
    for (const o of [...primera, ...segunda]) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.match(o.id, /^paradores:\d+$/);
      assert.match(o.url, /^https:\/\/www\.paradores\.es\/es\/[\w-]+$/);
      assert.equal(o.tipo, 'hotel');
      assert.equal(o.precio, null);
      assert.equal(o.unidad, null);
      assert.ok(o.temas.includes('singular'));
      assert.ok(o.descripcion.length <= 300);
    }
    assert.ok(PAGINA_2.includes('Tarifa de Puntos'));
    assert.ok(![...primera, ...segunda].some((o) => /puntos/i.test(o.titulo)));
  });

  it('lee el % de descuento, las condiciones propias y si es exclusiva de Amigos', () => {
    const amigo = porNid(primera, 766);
    assert.equal(amigo.titulo, 'Precio de Amigo: Oferta Amigos Especial Web');
    assert.equal(amigo.url, 'https://www.paradores.es/es/precio-de-amigo-oferta-amigos-especial-web');
    assert.equal(amigo.descuento, 5);
    assert.equal(amigo.precioTexto, '5 % de descuento');
    assert.match(amigo.descripcion, /^Ahora, ser Amigo de Paradores.*Condiciones: Tarifa exclusiva para Amigos de Paradores\./);
    assert.doesNotMatch(amigo.descripcion, /no es acumulable/);
    assert.deepEqual(amigo.etiquetas, ['Exclusiva Amigos de Paradores', 'Destacada', 'top-chollo']);
    assert.match(amigo.imagen, /^https:\/\/www\.paradores\.es\/sites\/default\/files\//);
    assert.equal(amigo.lugar, null);

    const mediaPension = porNid(primera, 788);
    assert.equal(mediaPension.descuento, 15);
    assert.equal(mediaPension.descripcion, 'Una noche más en un Parador puede ser una gran diferencia.');

    const golf = porNid(primera, 11574);
    assert.equal(golf.descuento, null);
    assert.equal(golf.precioTexto, '');
    assert.deepEqual(golf.etiquetas, []);
  });

  it('solo pone lugar cuando la promoción es de un parador concreto', () => {
    assert.deepEqual(porNid(segunda, 20955).lugar, { nombre: 'La Palma', region: null, pais: 'España', lat: null, lon: null });
    assert.equal(porNid(segunda, 20973).lugar.nombre, 'Ibiza');
    assert.equal(porNid(segunda, 804).lugar.nombre, 'Sos del Rey Católico', 'sacado del nombre de la imagen');
    assert.equal(porNid(segunda, 803).lugar, null, 'Islas Canarias no es un parador concreto');
  });

  it('paradorDe busca en título, descripción e imagen', () => {
    assert.equal(paradorDe({ titulo: 'Especial Indianos 2027 Parador de La Palma' }), 'La Palma');
    assert.equal(paradorDe({ titulo: 'X', descripcion: 'Descuento del 20% para ti en el Parador de Ibiza' }), 'Ibiza');
    assert.equal(paradorDe({ titulo: 'Sos Medieval', imagen: '/img/Parador%20de%20Sos%20del%20Rey%20Cato%CC%81lico%20120.jpg' }), 'Sos del Rey Católico');
    assert.equal(paradorDe({ titulo: 'Oferta no reembolsable', descripcion: 'Consigue un 15% en Paradores.' }), null);
  });

  it('cuenta las páginas del paginador', () => {
    assert.equal(numeroDePaginas(PAGINA_1), 2);
    assert.equal(numeroDePaginas(PAGINA_2), 1);
  });
});

describe('paradores: obtener', () => {
  it('lee las 2 páginas con una pausa de 2 s y devuelve el catálogo completo', async () => {
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: responder(PAGINAS) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, ['https://www.paradores.es/es/ofertas', 'https://www.paradores.es/es/ofertas?page=1']);
    assert.deepEqual(esperas, [2000]);
    assert.deepEqual(logs, []);
    assert.equal(ofertas.length, 16);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, 16);
    assert.equal(reemplazar, true);
  });

  it('si falla la segunda página devuelve la primera sin reemplazar', async () => {
    const { ctx, logs } = crearCtx({ respuestas: responder({ ...PAGINAS, 'https://www.paradores.es/es/ofertas?page=1': new ErrorHttp(429, 'https://www.paradores.es/') }) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.equal(ofertas.length, 12);
    assert.equal(reemplazar, false);
    assert.match(logs[0], /HTTP 429/);
  });

  it('lanza un error claro ante un desafío anti-bot o un 403', async () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>';
    const conDesafio = crearCtx({ respuestas: () => desafio });
    await assert.rejects(fuente.obtener(conDesafio.ctx), /desafío anti-bot/);
    assert.equal(conDesafio.peticiones.length, 1);

    const prohibido = crearCtx({ respuestas: () => { throw new ErrorHttp(403, 'https://www.paradores.es/'); } });
    await assert.rejects(fuente.obtener(prohibido.ctx), /listado de ofertas de Paradores: HTTP 403/);
  });
});

describe('paradores: robots.txt', () => {
  it('permite todas las URLs que declara la fuente', () => {
    const robots = leerFixture('paradores-robots.txt');
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.ok(rutaPermitida(robots, `${pathname}${search}`), url);
    }
  });
});
