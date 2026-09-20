import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { finDelDia, parsear, porcentaje } from '../src/fuentes/campings.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

const HTML = leerFixture('campings-ofertas.html');
const ofertas = parsear(HTML);
const porId = (id) => ofertas.find((o) => o.id === `campings:${id}`);

describe('campings: parsear (página real)', () => {
  it('convierte las ofertas en ofertas válidas y quita la repetida', () => {
    const { ctx, logs } = crearCtx();
    const lista = parsear(HTML, ctx);
    assert.equal(lista.length, 3, 'la lista de la web trae 4 entradas, una repetida');
    assert.deepEqual(logs, []);
    for (const o of lista) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.equal(o.tipo, 'hotel');
      assert.equal(o.precio, null);
      assert.equal(o.unidad, null);
      assert.ok(o.temas.includes('rural'));
      assert.match(o.url, /^https:\/\/www\.campings\.net\/ofertas-camping-[\w-]+\.htm$/);
      assert.ok(Number.isFinite(o.lugar.lat) && Number.isFinite(o.lugar.lon));
      assert.ok(o.descripcion.length <= 300);
    }
  });

  it('rellena título, descuento, lugar, caducidad y etiquetas', () => {
    const pena = porId('14504');
    assert.equal(pena.titulo, 'Camping Peña Montañesa: Reserva anticipada');
    assert.equal(pena.descuento, 5);
    assert.equal(pena.precioTexto, '5 % de descuento');
    assert.deepEqual(pena.lugar, { nombre: 'Huesca', region: 'Aragón', pais: 'España', codigoPais: 'ES', lat: 42.434299, lon: 0.131402, iata: null });
    assert.equal(pena.caduca, '2026-12-31T22:59:59.000Z');
    assert.deepEqual(pena.etiquetas, ['Camping', 'Oferta destacada']);
    assert.match(pena.imagen, /^https:\/\/www\.campings\.net\/imagenes\//);

    const cambrils = porId('15244');
    assert.equal(cambrils.titulo, 'Camping Platja Cambrils: Oferta Halloween 2026 – Reserva anticipada');
    assert.deepEqual(cambrils.temas, ['rural', 'familia']);
    assert.equal(cambrils.lugar.region, 'Cataluña');
    assert.match(cambrils.descripcion, /^¡Celebra Halloween en Camping Platja Cambrils/);

    const isla = porId('14434');
    assert.equal(isla.descuento, 10);
    assert.ok(isla.etiquetas.includes('Ofertas en alojamientos y bungalow'));
  });

  it('funciones auxiliares', () => {
    assert.equal(porcentaje('Descuento del 5 % o 10 %'), 5);
    assert.equal(porcentaje('Sin descuento'), null);
    assert.equal(finDelDia('20-09-2026'), '2026-09-20T22:59:59.000Z');
    assert.equal(finDelDia(''), null);
    assert.equal(parsear('<html><body>Sin datos</body></html>'), null);
  });
});

describe('campings: obtener', () => {
  it('hace una sola petición y devuelve el catálogo completo', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => HTML });
    const { ofertas: todas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.equal(reemplazar, true);
    assert.equal(todas.length, 3);
  });

  it('lanza errores claros ante un bloqueo o un desafío anti-bot', async () => {
    const bloqueo = crearCtx({ respuestas: () => { throw new ErrorHttp(403, fuente.urls[0]); } });
    await assert.rejects(fuente.obtener(bloqueo.ctx), /bloqueado o limitado.*403/);
    const desafio = crearCtx({ respuestas: () => '<html><title>Just a moment...</title></html>' });
    await assert.rejects(fuente.obtener(desafio.ctx), /desafío anti-bot/);
  });
});

describe('campings: robots.txt', () => {
  it('permite la página que pide', () => {
    const robots = leerFixture('campings-robots.txt');
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
  });
});
