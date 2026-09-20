import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { ciudad, fechaDiaMes, parsear } from '../src/fuentes/ouigo.js';
import { validarOferta } from '../src/modelo.js';
import { rutaPermitida } from '../src/util/robots.js';
import { AHORA, crearCtx, leerFixture } from './ayudas.js';

const PORTADA = leerFixture('ouigo-portada.html');
/** La misma portada sin el banner de campaña: solo quedan las tarjetas «Madrid > …». */
const SIN_BANNER = PORTADA.replace(/<section id="block-blockcountdown"[\s\S]*?<\/section>/, '');

describe('parsear (portada real)', () => {
  const ofertas = parsear(PORTADA, { ahora: AHORA });
  const porId = (id) => ofertas.find((o) => o.id === id);

  it('con una promoción de Barcelona devuelve esa y la general, válidas', () => {
    assert.deepEqual(ofertas.map((o) => o.id), ['ouigo:promo:2026-09-16:barcelona-madrid', 'ouigo:promo:2026-09-16:general']);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.equal(o.tipo, 'escapada');
      assert.equal(o.transporte, 'tren');
      assert.equal(o.unidad, null);
      assert.match(o.precioTexto, /por persona y trayecto \(solo ida\)/);
      assert.equal(o.publicada, '2026-09-16');
      assert.ok(o.etiquetas.includes('venta:2026-09-16'));
    }
  });

  it('interpreta el precio por trayecto y la fecha de apertura de la venta', () => {
    const madrid = porId('ouigo:promo:2026-09-16:barcelona-madrid');
    assert.equal(madrid.precio, 19);
    assert.equal(madrid.titulo, 'Tren OUIGO Barcelona – Madrid: promoción desde 19 €');
    assert.deepEqual(
      [madrid.lugar.nombre, madrid.lugar.region, madrid.lugar.codigoPais, madrid.lugar.lat],
      ['Madrid', 'Comunidad de Madrid', 'ES', 40.4168],
    );
    assert.match(madrid.descripcion, /Venta desde el 15\/09 en la app y el 16\/09 en la web\./);

    const general = porId('ouigo:promo:2026-09-16:general');
    assert.equal(general.precio, 9);
    assert.equal(general.lugar, null);
  });

  it('sin promociones de Barcelona devuelve todas las tarjetas de trayecto', () => {
    const tarjetas = parsear(SIN_BANNER, { ahora: AHORA });
    assert.equal(tarjetas.length, 4);
    for (const o of tarjetas) assert.deepEqual(validarOferta(o), [], o.id);
    const valencia = tarjetas.find((o) => o.lugar.nombre === 'Valencia');
    assert.equal(valencia.id, 'ouigo:tarifa:7117000_7103216');
    assert.equal(valencia.precio, 9);
    assert.equal(valencia.titulo, 'Tren OUIGO Madrid – Valencia desde 9 €');
    assert.match(valencia.url, /^https:\/\/ventas\.ouigo\.com\/.*outboundDate=2026-10-19/);
    assert.match(valencia.imagen, /^https:\/\/.*Valencia\.png/);
    assert.ok(valencia.etiquetas.includes('¡PAELLA DE LA BUENA!'));
  });
});

describe('ciudad y fechaDiaMes', () => {
  it('reconoce ciudades por nombre o abreviatura', () => {
    assert.equal(ciudad('BAR').nombre, 'Barcelona');
    assert.equal(ciudad(' malaga ').nombre, 'Málaga');
    assert.equal(ciudad('Lisboa'), null);
  });

  it('elige el año más cercano', () => {
    assert.equal(fechaDiaMes('16/09', AHORA), '2026-09-16');
    assert.equal(fechaDiaMes('5/1', new Date('2026-12-20T10:00:00Z')), '2027-01-05');
    assert.equal(fechaDiaMes('20/12', new Date('2027-01-03T10:00:00Z')), '2026-12-20');
  });
});

describe('obtener', () => {
  it('pide solo la portada y reemplaza el catálogo', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => PORTADA });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, ['https://www.ouigo.com/es/']);
    assert.equal(ofertas.length, 2);
    assert.equal(reemplazar, true);
  });

  it('ante un desafío anti-bot lanza un error claro', async () => {
    const { ctx } = crearCtx({ respuestas: () => '<title>Just a moment...</title><div id="cf-chl-widget"></div>' });
    await assert.rejects(fuente.obtener(ctx), /OUIGO ha devuelto un desafío anti-bot/);
  });
});

describe('robots.txt', () => {
  it('permite la portada', () => {
    const robots = leerFixture('ouigo-robots.txt');
    for (const url of fuente.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
  });
});
