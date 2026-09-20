import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { datosDePagina, parsear } from '../src/fuentes/atrapalo.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const GENERAL = leerFixture('atrapalo-escapadas.html');
const URL_GENERAL = 'https://www.atrapalo.com/escapadas/?page=5';
const PAGINAS = {
  [URL_GENERAL]: GENERAL,
  'https://www.atrapalo.com/escapadas/?region_id=6&page=5': leerFixture('atrapalo-barcelona.html'),
  'https://www.atrapalo.com/escapadas/?region_id=54&page=5': leerFixture('atrapalo-girona.html'),
  'https://www.atrapalo.com/escapadas/?region_id=52&page=5': leerFixture('atrapalo-tarragona.html'),
  'https://www.atrapalo.com/escapadas/?region_id=53&page=5': leerFixture('atrapalo-lleida.html'),
};

const responder = (paginas) => (url) => {
  const respuesta = paginas[url];
  if (respuesta instanceof Error) throw respuesta;
  if (respuesta === undefined) throw new Error(`URL inesperada: ${url}`);
  return respuesta;
};

const general = parsear(GENERAL);
const porId = (ofertas, id) => ofertas.find((o) => o.id === `atrapalo:${id}`);

describe('atrapalo: parsear (__NEXT_DATA__ real)', () => {
  it('convierte las 100 escapadas del listado general en ofertas válidas', () => {
    const { escapadas, total } = datosDePagina(GENERAL);
    assert.equal(escapadas.length, 100);
    assert.equal(total, 122);
    assert.equal(general.length, 100);
    assert.equal(new Set(general.map((o) => o.id)).size, 100);
    for (const o of general) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.match(o.id, /^atrapalo:\d+$/);
      assert.match(o.url, /^https:\/\/www\.atrapalo\.com\/escapadas\/[^?#]+_v\d+$/);
      assert.equal(o.tipo, 'escapada');
      assert.equal(o.unidad, 'pp');
      assert.ok(o.precio >= 20 && o.precio <= 300, `${o.titulo}: ${o.precio}`);
    }
  });

  it('rellena precio por persona, precio anterior, descuento, destino y tema', () => {
    const jaen = porId(general, 68749);
    assert.equal(jaen.titulo, 'Escapada rural con cava en la Sierra Mágina de Jaén');
    assert.equal(jaen.precio, 30);
    assert.equal(jaen.precioTexto, 'desde 30 € por persona');
    assert.equal(jaen.precioAnterior, 34);
    assert.equal(jaen.descuento, 13);
    assert.equal(jaen.imagen, 'https://cdn.atrapalo.com/o/travels/68749/HomePage_horiginal.jpg');
    assert.deepEqual(jaen.lugar, { nombre: 'Jaén', region: null, pais: null, lat: null, lon: null });
    assert.deepEqual(jaen.temas, ['spa']);
    assert.deepEqual(jaen.etiquetas, ['Relax']);
    assert.equal(jaen.descripcion, 'Jaén · Relax');
  });

  it('marca como top-chollo las destacadas por la web', () => {
    const cangas = porId(general, 68795);
    assert.deepEqual(cangas.etiquetas, ['Destacada', 'top-chollo']);
    assert.equal(general.filter((o) => o.etiquetas.includes('top-chollo')).length, 6);
  });

  it('las páginas de provincia añaden región y país', () => {
    const girona = parsear(leerFixture('atrapalo-girona.html'), {}, { region: 'Girona', pais: 'España' });
    assert.equal(girona.length, 16);
    const olot = porId(girona, 68857);
    assert.deepEqual(olot.lugar, { nombre: 'Olot', region: 'Girona', pais: 'España', lat: null, lon: null });
    assert.deepEqual(olot.temas, ['aventura']);
  });

  it('descarta la escapada que no cumple el contrato y sigue con las demás', () => {
    const logs = [];
    const html = GENERAL.replace('"title":"Escapada rural con cava en la Sierra Mágina de Jaén"', '"title":""');
    const ofertas = parsear(html, { log: (m) => logs.push(m) });
    assert.equal(ofertas.length, 99);
    assert.match(logs[0], /Escapada 68749 descartada/);
  });

  it('distingue un desafío anti-bot de un cambio de la página', () => {
    assert.throws(() => datosDePagina('<html><title>Just a moment...</title><body>cf-chl</body></html>'), (error) => error.bloqueo === true);
    assert.throws(() => datosDePagina('<html><body>Hola</body></html>'), /__NEXT_DATA__/);
  });
});

describe('atrapalo: obtener', () => {
  it('pide el listado general y las 4 provincias catalanas con pausas de 4 s', async () => {
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: responder(PAGINAS) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.equal(peticiones.length, 5);
    assert.deepEqual(esperas, [4000, 4000, 4000, 4000]);
    assert.deepEqual(logs, []);

    assert.equal(ofertas.length, 106, '100 del general + 6 cercanas más caras');
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    assert.equal(porId(ofertas, 69292).lugar.region, 'Barcelona', 'la versión de la provincia sustituye a la del general');
    assert.equal(porId(ofertas, 68817).lugar.region, 'Lleida');
    assert.equal(porId(ofertas, 68749).lugar.region, null);

    // El general no trae las 122 escapadas: solo se reemplazan las de las provincias leídas enteras.
    assert.equal(typeof reemplazar, 'function');
    assert.equal(reemplazar({ lugar: { region: 'Girona' } }), true);
    assert.equal(reemplazar({ lugar: { region: null } }), false);
    assert.equal(reemplazar({ lugar: null }), false);
  });

  it('reemplaza todo el catálogo si el listado general viene completo', async () => {
    const completo = GENERAL.replace('"filteredTotal":122', '"filteredTotal":100');
    const { ctx } = crearCtx({ respuestas: responder({ ...PAGINAS, [URL_GENERAL]: completo }) });
    const { reemplazar } = await fuente.obtener(ctx);
    assert.equal(reemplazar, true);
  });

  it('si la web limita (429) deja de pedir y conserva lo leído', async () => {
    const limitada = { ...PAGINAS, 'https://www.atrapalo.com/escapadas/?region_id=54&page=5': new ErrorHttp(429, 'https://www.atrapalo.com/') };
    const { ctx, peticiones, logs } = crearCtx({ respuestas: responder(limitada) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 3);
    assert.equal(ofertas.length, 102);
    assert.ok(logs.some((l) => l.includes('bloqueado o limitado')));
    assert.equal(reemplazar({ lugar: { region: 'Barcelona' } }), true);
    assert.equal(reemplazar({ lugar: { region: 'Girona' } }), false);
  });

  it('lanza un error claro si solo recibe un desafío anti-bot', async () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>';
    const { ctx, peticiones } = crearCtx({ respuestas: () => desafio });
    await assert.rejects(fuente.obtener(ctx), /ninguna página de escapadas de Atrápalo.*desafío anti-bot/);
    assert.equal(peticiones.length, 1);
  });
});

describe('atrapalo: robots.txt', () => {
  it('permite todas las URLs que declara la fuente', () => {
    const robots = leerFixture('atrapalo-robots.txt');
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.ok(rutaPermitida(robots, `${pathname}${search}`), url);
    }
    assert.equal(rutaPermitida(robots, '/hoteles/feed-rss/'), false);
    assert.equal(rutaPermitida(robots, '/casasrurales/'), false);
  });
});
