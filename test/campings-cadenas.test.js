import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import sandaya, { MAX_KM, combinar, fechaLimite, parsearIndice, parsearPromocion, ventaja } from '../src/fuentes/sandaya.js';
import huttopia, { fechaLimite as limiteHuttopia, parsearOfertas, parsearPortada } from '../src/fuentes/huttopia.js';
import { distanciaKm } from '../src/enriquecer/geo.js';
import { detectarAlojamiento } from '../src/enriquecer/alojamiento.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { crearCtx, leerFixture } from './ayudas.js';

const BARCELONA = { lat: 41.3874, lon: 2.1686 };
const ctxBcn = { ajustes: { origen: BARCELONA } };

describe('sandaya: página de ofertas', () => {
  const promociones = parsearIndice(leerFixture('sandaya-ofertas.html'));

  it('lista las promociones sin las caducadas, las futuras ni las que no son de precio', () => {
    const slugs = promociones.map((p) => p.slug);
    assert.ok(slugs.includes('oferta-7-noches-hasta-un-20'));
    assert.ok(slugs.includes('do-you-first'));
    assert.ok(!slugs.includes('black-friday-camping-sandaya'), 'caducada');
    assert.ok(!slugs.includes('do-you-days'), 'disponible pronto');
    assert.ok(!slugs.includes('opcion-libertad'), 'cancelación flexible: no es un precio');
    assert.equal(new Set(slugs).size, slugs.length);
    for (const p of promociones) assert.match(p.url, /^https:\/\/www\.sandaya\.es\/ofertas-especiales\//);
    assert.equal(parsearIndice('<html><body>nada</body></html>'), null);
  });

  it('lee el precio o el descuento del titular', () => {
    assert.deepEqual(ventaja('Alojamiento a partir de 45€ la noche'), { precio: 45, unidad: 'noche', noches: null, descuento: null });
    assert.deepEqual(ventaja('Su fin de semana a partir de 119 € para 4 personas'), { precio: 119, unidad: 'total', noches: 2, descuento: null });
    assert.deepEqual(ventaja('Oferta 7 noches hasta un -20%'), { precio: null, unidad: null, noches: null, descuento: 20 });
    assert.equal(ventaja('Opción Libertad'), null);
    assert.equal(ventaja('Modificación y anulación de estancia 100% flexibles'), null);
    assert.equal(fechaLimite('Descuento de hasta el 15% en las reservas realizadas antes del 31/12/2026 para 2027.'), '2026-12-31T22:59:59.000Z');
    assert.equal(fechaLimite('estancias antes del 04/07/2026'), null, 'fechas de estancia, no de reserva');
  });
});

describe('sandaya: promociones y campings', () => {
  const promocion = (slug, fixture) => parsearPromocion(leerFixture(fixture), { url: `https://www.sandaya.es/ofertas-especiales/${slug}`, slug, titulo: '' }, ctxBcn);
  const paginas = [
    promocion('alojamiento-a-partir-de-45-la-noche', 'sandaya-alojamiento-45.html'),
    promocion('do-you-first', 'sandaya-do-you-first.html'),
    promocion('oferta-7-noches-hasta-un-20', 'sandaya-7-noches.html'),
  ];

  it('cada página: la promoción y solo los campings cercanos al origen', () => {
    for (const p of paginas) {
      assert.ok(p.campings.length > 0);
      for (const c of p.campings) assert.ok(distanciaKm(BARCELONA, c) <= MAX_KM, c.nombre);
    }
    const [aloj, first] = paginas;
    assert.equal(aloj.promocion.precio, 45);
    assert.equal(first.promocion.titulo, 'Do You First: Hasta -15% en sus vacaciones 2027', 'sin precio en el titular, el subtítulo');
    assert.equal(first.promocion.descuento, 15);
    assert.equal(first.promocion.caduca, '2026-12-31T22:59:59.000Z');
    assert.equal(promocion('opcion-libertad', 'sandaya-opcion-libertad.html'), null);
    const sinOrigen = parsearPromocion(leerFixture('sandaya-7-noches.html'), { url: 'https://www.sandaya.es/x', slug: 'x', titulo: '' });
    assert.ok(sinOrigen.campings.length > paginas[2].campings.length, 'sin origen no se filtra por distancia');
  });

  it('una oferta por camping con su mejor promoción y las demás en la descripción', () => {
    const { ctx, logs } = crearCtx();
    const ofertas = combinar(paginas, ctx);
    assert.deepEqual(logs, []);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.equal(o.alojamiento, 'camping');
      assert.equal(detectarAlojamiento(o), 'camping');
      assert.match(o.titulo, /^Camping Sandaya /);
    }
    const valencia = ofertas.find((o) => o.lugar.nombre === 'Puçol');
    assert.equal(valencia.titulo, 'Camping Sandaya Valencia: Alojamiento a partir de 45€ la noche');
    assert.equal(valencia.precio, 45);
    assert.equal(valencia.unidad, 'noche');
    assert.equal(valencia.precioTexto, 'desde 45 € la noche');
    assert.deepEqual([valencia.lugar.pais, valencia.lugar.codigoPais, valencia.lugar.region], ['España', 'ES', 'Comunidad Valenciana']);
    assert.match(valencia.descripcion, /También en este camping: Oferta 7 noches hasta un -20% · Do You First/);
    assert.equal(valencia.caduca, null, 'la de 45 € no tiene fecha límite');
    const franqui = ofertas.find((o) => o.lugar.nombre === 'Leucate');
    assert.equal(franqui.lugar.codigoPais, 'FR');
    // Solo con descuentos: el mayor.
    const soloDescuentos = combinar(paginas.slice(1));
    assert.equal(soloDescuentos.find((o) => o.lugar.nombre === 'Puçol').descuento, 20);
  });

  it('obtener: lee el índice, cada promoción con pausa y combina', async () => {
    const paginasPorUrl = {
      'https://www.sandaya.es/ofertas-especiales': 'sandaya-ofertas.html',
      'https://www.sandaya.es/ofertas-especiales/alojamiento-a-partir-de-45-la-noche': 'sandaya-alojamiento-45.html',
      'https://www.sandaya.es/ofertas-especiales/do-you-first': 'sandaya-do-you-first.html',
      'https://www.sandaya.es/ofertas-especiales/oferta-7-noches-hasta-un-20': 'sandaya-7-noches.html',
    };
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: (url) => {
      if (paginasPorUrl[url]) return leerFixture(paginasPorUrl[url]);
      throw new ErrorHttp(404, url);
    } });
    const { ofertas, reemplazar } = await sandaya.obtener(ctx);
    assert.equal(reemplazar, true);
    assert.ok(ofertas.length >= 5);
    assert.equal(peticiones[0], 'https://www.sandaya.es/ofertas-especiales');
    assert.ok(esperas.every((ms) => ms === 2000) && esperas.length === peticiones.length - 1);
  });

  it('obtener: bloqueo y página cambiada son errores claros', async () => {
    const bloqueo = crearCtx({ respuestas: (url) => { throw new ErrorHttp(403, url); } });
    await assert.rejects(sandaya.obtener(bloqueo.ctx), /bloqueado o limitado/);
    const cambiada = crearCtx({ respuestas: () => '<html><body>Hola</body></html>' });
    await assert.rejects(sandaya.obtener(cambiada.ctx), /no trae la lista/);
  });
});

describe('huttopia', () => {
  const pagina = leerFixture('huttopia-chalets-invierno.html');

  it('portada: la promoción de la franja y las páginas de ofertas del menú', () => {
    const { promocion, paginas } = parsearPortada(pagina);
    assert.deepEqual(promocion, {
      texto: 'WINTER26 : 20% de descuento a partir de 7 noches',
      url: 'https://europe.huttopia.com/es/promocion-de-invierno/',
      descuento: 20,
      codigo: 'WINTER26',
      nochesMin: 7,
    });
    assert.deepEqual(paginas, ['https://europe.huttopia.com/es/nuestras-ofertas/alquiler-chalets-en-invierno/']);
    assert.equal(limiteHuttopia(leerFixture('huttopia-promocion-invierno.html')), '2026-10-18T22:59:59.000Z');
  });

  it('ofertas: solo los campings cercanos, con coordenadas, valoración y fechas', () => {
    const ofertas = parsearOfertas(pagina, { ...ctxBcn, caduca: '2026-10-18T22:59:59.000Z' });
    assert.equal(ofertas.length, 1, 'de los 7 destinos de nieve, solo Font-Romeu está a menos de 450 km');
    const [font] = ofertas;
    assert.deepEqual(validarOferta(font), []);
    assert.equal(font.titulo, 'Camping Huttopia Font-Romeu: 20 % de descuento a partir de 7 noches');
    assert.equal(font.descuento, 20);
    assert.equal(font.caduca, '2026-10-18T22:59:59.000Z');
    assert.equal(font.lugar.nombre, 'Font Romeu Odeillo');
    assert.equal(font.lugar.codigoPais, 'FR');
    assert.deepEqual(font.valoracion, { nota: 8.8, n: 710 });
    assert.match(font.descripcion, /con el código WINTER26\. Abierto del 04\/12\/2026 al 03\/04\/2027\./);
    assert.equal(font.alojamiento, 'camping');
    assert.equal(parsearOfertas(pagina).length, 7, 'sin origen, todos');
    assert.equal(parsearOfertas('<html><body></body></html>'), null);
  });

  it('obtener: portada, condiciones y páginas de ofertas', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: (url) => {
      if (url === 'https://europe.huttopia.com/es/promocion-de-invierno/') return leerFixture('huttopia-promocion-invierno.html');
      if (url.startsWith('https://europe.huttopia.com/es/')) return pagina;
      throw new ErrorHttp(404, url);
    } });
    const { ofertas, reemplazar } = await huttopia.obtener(ctx);
    assert.equal(reemplazar, true);
    assert.equal(peticiones.length, 3);
    assert.ok(ofertas.every((o) => o.caduca === '2026-10-18T22:59:59.000Z'));
    const sinOfertas = crearCtx({ respuestas: () => '<html><body><a href="/es/">Inicio</a></body></html>' });
    assert.deepEqual((await huttopia.obtener(sinOfertas.ctx)).ofertas, [], 'sin páginas de ofertas en el menú: no hay promoción');
  });
});
