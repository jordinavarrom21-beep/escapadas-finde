import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import sandaya, { MAX_KM, combinar, fechaLimite, parsearIndice, parsearPromocion, ventaja } from '../src/fuentes/sandaya.js';
import huttopia, { fechaLimite as limiteHuttopia, ofertasDePromocion, parsearCondiciones, parsearOfertas, parsearPortada } from '../src/fuentes/huttopia.js';
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
    const { ofertas } = await huttopia.obtener(ctx);
    assert.equal(peticiones.length, 3);
    assert.ok(ofertas.length >= 1);
    assert.ok(ofertas.every((o) => o.caduca === '2026-10-18T22:59:59.000Z'));
    const sinOfertas = crearCtx({ respuestas: () => '<html><body><a href="/es/">Inicio</a></body></html>' });
    assert.deepEqual((await huttopia.obtener(sinOfertas.ctx)).ofertas, [], 'sin promociones ni páginas de ofertas: no hay promoción');
  });

  // Páginas reales del 15/10/2026 (de data/muestras, la portada sin scripts ni estilos y con 3 de
  // los 308 vivacs de su mapa): la franja ya no está en la página de ofertas sino en la portada.
  const portada = leerFixture('huttopia-portada-nature27.html');
  const condiciones = parsearCondiciones(leerFixture('huttopia-apertura-ventas.html'));

  it('portada de octubre de 2026: la franja, las diapositivas con descuento y el mapa de campings', () => {
    const { promociones, sitios } = parsearPortada(portada);
    assert.deepEqual(promociones.map((p) => [p.url, p.descuento, p.codigo, p.nochesMin]), [
      ['https://europe.huttopia.com/es/apertura-ventas/', 10, 'NATURE27', null],
      ['https://europe.huttopia.com/es/promocion-de-invierno/', 20, null, 7],
    ]);
    const barcelona = sitios.get('https://europe.huttopia.com/es/site/barcelona-pirineos/');
    assert.equal(barcelona.codigoPais, 'ES');
    assert.ok(Number.isFinite(barcelona.lat) && Number.isFinite(barcelona.lon));
    assert.match(barcelona.imagen, /^https:\/\/europe\.huttopia\.com\/uploads\//);
    assert.ok(sitios.get('https://europe.huttopia.com/es/site/camping-font-romeu/hiver/').invierno);
    assert.ok([...sitios.values()].every((s) => !/bivouacs|americas/.test(s.url)), 'ni vivacs ni campings de América');
    assert.equal(sitios.get('https://europe.huttopia.com/es/site/lac-de-luby-gers/').nombre, 'Lac de l’Uby – Gers', 'sin entidades HTML');
  });

  it('condiciones de NATURE27: código, fecha límite de un solo dígito, noches, fechas y excepciones', () => {
    assert.equal(condiciones.codigo, 'NATURE27');
    assert.equal(condiciones.caduca, '2026-11-08T22:59:59.000Z', '«código válido hasta el 8/11/2026»');
    assert.equal(condiciones.limite, '08/11/2026');
    assert.equal(condiciones.nochesMin, 4);
    assert.deepEqual(condiciones.periodos, [['16/03/2027', '02/07/2027'], ['28/08/2027', '27/11/2027']]);
    assert.equal(condiciones.todos, true);
    assert.deepEqual(condiciones.excepto, ['chalets de invierno', 'paris', 'estrasburgo', 'colmar'], 'no «el fin de semana de la Ascensión»');
    // Otra forma de escribirlo: un asterisco y un paréntesis dentro no rompen ni cuelan nada.
    const apertura = leerFixture('huttopia-apertura-ventas.html');
    const raro = apertura.replace('(excepto Chalets de Invierno, Camping de Paris y', '(excepto Chalets de Invierno*, Camping de Paris (Bois de Boulogne) y');
    assert.notEqual(raro, apertura);
    assert.deepEqual(parsearCondiciones(raro).excepto, ['chalets de invierno', 'paris', 'estrasburgo', 'colmar']);
    const conArticulo = apertura.replace('(excepto Chalets de Invierno,', '(excepto los Chalets de Invierno,');
    assert.deepEqual(parsearCondiciones(conArticulo).excepto, ['chalets de invierno', 'paris', 'estrasburgo', 'colmar']);
    // Un paréntesis sin cerrar: mejor no dar la promoción que darla también donde no vale.
    const sinCerrar = apertura.replace('Camping de Paris y', 'Camping de Paris (Bois de Boulogne y');
    assert.throws(() => parsearCondiciones(sinCerrar), /No se entienden las excepciones/);
    const invierno = parsearCondiciones(leerFixture('huttopia-promocion-invierno.html'));
    assert.equal(invierno.codigo, 'WINTER26');
    assert.equal(invierno.todos, false);
    assert.equal(invierno.sitios.length, 7, 'los 7 chalets que enlaza, no los del menú');
  });

  it('NATURE27 en todos los campings cercanos, salvo los chalets de invierno, Paris, Estrasburgo y Colmar', () => {
    const { promociones, sitios } = parsearPortada(portada);
    const ofertas = ofertasDePromocion(promociones[0], condiciones, sitios, ctxBcn);
    assert.ok(ofertas.length >= 15, `${ofertas.length} campings a menos de 450 km`);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), []);
      assert.ok(distanciaKm(BARCELONA, o.lugar) <= 450);
      assert.match(o.id, /:NATURE27$/);
      assert.equal(o.caduca, '2026-11-08T22:59:59.000Z');
      assert.ok(!/\/hiver\//.test(o.url), 'los chalets de invierno no entran');
    }
    // Su camping de verano sí: el mapa de octubre solo trae la cara de invierno, y el menú, las dos.
    const font = ofertas.find((o) => o.id === 'huttopia:camping-font-romeu:NATURE27');
    assert.equal(font?.url, 'https://europe.huttopia.com/es/site/camping-font-romeu/');
    assert.equal(font.establecimiento, 'Camping Huttopia Font-Romeu');
    assert.doesNotMatch(font.descripcion, /invern|nieve|esqu|Abierto/i, 'nada de los chalets de invierno');
    assert.deepEqual(font.etiquetas, ['Camping']);
    assert.equal(font.imagen, null, 'la foto del mapa es de la nieve');
    const barcelona = ofertas.find((o) => o.id === 'huttopia:barcelona-pirineos:NATURE27');
    assert.equal(barcelona.titulo, 'Camping Huttopia Barcelona Pirineos: 10 % de descuento a partir de 4 noches');
    assert.match(barcelona.descripcion, /^10 % de descuento a partir de 4 noches en estancias del 16\/03\/2027 al 02\/07\/2027 y del 28\/08\/2027 al 27\/11\/2027 con el código NATURE27, reservando hasta el 08\/11\/2026\./);
    assert.equal(barcelona.lugar.pais, 'España');
    // Sin origen (todos): las excepciones de lejos tampoco entran.
    const todas = ofertasDePromocion(promociones[0], condiciones, sitios, {});
    const urls = todas.map((o) => o.url).join(' ');
    assert.ok(!/campingparis|camping-strasbourg|campingdelill/.test(urls), urls);
    assert.ok(/campingangers|camping-lyon/.test(urls), 'los demás CityKamp sí');
  });

  it('obtener con la portada de octubre: NATURE27 y WINTER26, cada una con su fecha límite', async () => {
    const paginas = {
      'https://europe.huttopia.com/es/': portada,
      'https://europe.huttopia.com/es/apertura-ventas/': leerFixture('huttopia-apertura-ventas.html'),
      'https://europe.huttopia.com/es/promocion-de-invierno/': leerFixture('huttopia-promocion-invierno.html'),
      'https://europe.huttopia.com/es/nuestras-ofertas/alquiler-chalets-en-invierno/': pagina,
    };
    const { ctx, peticiones } = crearCtx({
      ajustes: { origen: BARCELONA },
      ahora: new Date('2026-10-15T08:00:00Z'),
      respuestas: (url) => paginas[url] ?? (() => { throw new ErrorHttp(404, url); })(),
    });
    const { ofertas, reemplazar } = await huttopia.obtener(ctx);
    assert.equal(peticiones.length, 4);
    const font = ofertas.find((o) => o.id === 'huttopia:camping-font-romeu:WINTER26');
    assert.equal(font.caduca, '2026-10-18T22:59:59.000Z');
    assert.deepEqual(font.valoracion, { nota: 8.8, n: 710 }, 'la valoración, de la página de ofertas');
    assert.equal(font.lugar.nombre, 'Font Romeu Odeillo');
    const deVerano = ofertas.find((o) => o.id === 'huttopia:camping-font-romeu:NATURE27');
    assert.deepEqual(deVerano.valoracion, { nota: 8.8, n: 710 });
    assert.match(deVerano.imagen, /font-romeu-ete/, 'la foto de su ficha');
    assert.ok(ofertas.filter((o) => o.id.endsWith(':NATURE27')).length >= 15);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    // Lo guardado de las promociones miradas que ya no sale se borra; lo de otra promoción que
    // hoy no está en la portada sigue hasta la fecha límite de su código.
    assert.equal(reemplazar({ id: 'huttopia:millau:NATURE27', caduca: '2026-11-08T22:59:59.000Z' }), true);
    assert.equal(reemplazar({ id: 'huttopia:millau:SPRING26', caduca: '2026-11-30T22:59:59.000Z' }), false);
    assert.equal(reemplazar({ id: 'huttopia:millau:SPRING26', caduca: '2026-10-01T22:59:59.000Z' }), true);
  });

  it('si una promoción falla, las otras salen y lo guardado de la que falla no se borra', async () => {
    // Las fechas de los chalets de invierno en otro formato hacen fallar WINTER26 (y solo esa).
    const mapa = /data-map="([^"]*)"/.exec(portada)[1];
    const rara = portada.replace(mapa, mapa.replaceAll('&quot;dateStart&quot;:&quot;04/12/2026&quot;', '&quot;dateStart&quot;:&quot;2026-12-04&quot;'));
    assert.notEqual(rara, portada);
    const paginas = {
      'https://europe.huttopia.com/es/': rara,
      'https://europe.huttopia.com/es/apertura-ventas/': leerFixture('huttopia-apertura-ventas.html'),
      'https://europe.huttopia.com/es/promocion-de-invierno/': leerFixture('huttopia-promocion-invierno.html'),
      'https://europe.huttopia.com/es/nuestras-ofertas/alquiler-chalets-en-invierno/': pagina,
    };
    const { ctx, logs } = crearCtx({
      ajustes: { origen: BARCELONA },
      ahora: new Date('2026-10-15T08:00:00Z'),
      respuestas: (url) => paginas[url] ?? (() => { throw new ErrorHttp(404, url); })(),
    });
    const { ofertas, reemplazar } = await huttopia.obtener(ctx);
    assert.ok(ofertas.filter((o) => o.id.endsWith(':NATURE27')).length >= 15, 'NATURE27 sale igual');
    assert.ok(logs.some((l) => l.startsWith('https://europe.huttopia.com/es/promocion-de-invierno/: ')), logs.join('\n'));
    assert.equal(reemplazar({ id: 'huttopia:camping-font-romeu:WINTER26', caduca: '2026-10-18T22:59:59.000Z' }), false, 'lo de WINTER26 sigue');
    // Sin fecha límite legible (como con «válido hasta el 18 de octubre»), tampoco se borra.
    assert.equal(reemplazar({ id: 'huttopia:camping-font-romeu:WINTER26', caduca: null }), false, 'sin fecha, lo de WINTER26 sigue');
    assert.equal(reemplazar({ id: 'huttopia:camping-font-romeu:WINTER26', caduca: '2026-10-14T22:59:59.000Z' }), true, 'con la fecha pasada, fuera');
    assert.equal(reemplazar({ id: 'huttopia:millau:NATURE27', caduca: '2026-11-08T22:59:59.000Z' }), true);
    assert.equal(reemplazar({ id: 'huttopia:millau:OTRA', caduca: null }), true, 'una que no sale en la portada y sin fecha, fuera');

    // Si lo que falla es leer sus condiciones, igual: la portada ya trae el código NATURE27.
    const sinCondiciones = crearCtx({
      ajustes: { origen: BARCELONA },
      ahora: new Date('2026-10-15T08:00:00Z'),
      respuestas: (url) => (url.endsWith('/apertura-ventas/') ? undefined : paginas[url]) ?? (() => { throw new ErrorHttp(404, url); })(),
    });
    const segunda = await huttopia.obtener(sinCondiciones.ctx);
    assert.ok(sinCondiciones.logs.some((l) => l.startsWith('https://europe.huttopia.com/es/apertura-ventas/: ')), sinCondiciones.logs.join('\n'));
    assert.equal(segunda.reemplazar({ id: 'huttopia:millau:NATURE27', caduca: null }), false, 'sin fecha, lo de NATURE27 sigue');
    assert.equal(segunda.reemplazar({ id: 'huttopia:millau:NATURE27', caduca: '2026-10-14T22:59:59.000Z' }), true);

    // WINTER26 no lleva el código en la portada, solo en su página: si esa página falla, no se
    // sabe qué código era, y no se borra nada de lo que hoy no se ha mirado (salvo lo caducado).
    const sinInvierno = crearCtx({
      ajustes: { origen: BARCELONA },
      ahora: new Date('2026-10-15T08:00:00Z'),
      respuestas: (url) => (url.endsWith('/promocion-de-invierno/') ? undefined : paginas[url]) ?? (() => { throw new ErrorHttp(500, url); })(),
    });
    const tercera = await huttopia.obtener(sinInvierno.ctx);
    assert.ok(sinInvierno.logs.some((l) => l.startsWith('https://europe.huttopia.com/es/promocion-de-invierno/: ')), sinInvierno.logs.join('\n'));
    assert.equal(tercera.reemplazar({ id: 'huttopia:camping-font-romeu:WINTER26', caduca: null }), false, 'sin su página, lo de WINTER26 sigue');
    assert.equal(tercera.reemplazar({ id: 'huttopia:camping-font-romeu:WINTER26', caduca: '2026-10-14T22:59:59.000Z' }), true);
    assert.equal(tercera.reemplazar({ id: 'huttopia:millau:NATURE27', caduca: null }), true, 'NATURE27 sí se ha mirado');
  });

  it('una promoción sin código se sigue por su descuento, como el final de sus id', async () => {
    const paginas = {
      'https://europe.huttopia.com/es/': portada,
      'https://europe.huttopia.com/es/apertura-ventas/': leerFixture('huttopia-apertura-ventas.html'),
      'https://europe.huttopia.com/es/promocion-de-invierno/': leerFixture('huttopia-promocion-invierno.html').replaceAll('WINTER26', ''),
      'https://europe.huttopia.com/es/nuestras-ofertas/alquiler-chalets-en-invierno/': pagina,
    };
    const { ctx } = crearCtx({
      ajustes: { origen: BARCELONA },
      ahora: new Date('2026-10-15T08:00:00Z'),
      respuestas: (url) => paginas[url] ?? (() => { throw new ErrorHttp(404, url); })(),
    });
    const { ofertas, reemplazar } = await huttopia.obtener(ctx);
    assert.ok(ofertas.some((o) => o.id === 'huttopia:camping-font-romeu:20'), ofertas.map((o) => o.id).join(' '));
    // Mirada hoy: lo guardado de ella que hoy no sale se cambia por lo de hoy, como con código.
    assert.equal(reemplazar({ id: 'huttopia:millau:20', caduca: '2026-10-18T22:59:59.000Z' }), true);
  });
});
