import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import muchoviaje, { SECCIONES, combinar, parsearSeccion } from '../src/fuentes/muchoviaje.js';
import grandvalira, { parsear as parsearGrandvalira } from '../src/fuentes/grandvalira.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';
import { crearCtx, leerFixture } from './ayudas.js';

describe('muchoviaje: secciones de hoteles', () => {
  const finde = parsearSeccion(leerFixture('muchoviaje-fin-de-semana.html'));
  const ultima = parsearSeccion(leerFixture('muchoviaje-ultima-hora.html'));

  it('lee los hoteles de la lista (no los enlaces a otras secciones)', () => {
    assert.equal(finde.length, 9);
    assert.deepEqual(finde[0], {
      id: '96493', nombre: 'Balneario Cervantes', localidad: 'Santa Cruz de Mudela', pais: 'España', estrellas: 4, precio: 61,
      url: 'https://www.muchoviaje.com/hotel/balneario-cervantes-en-santa-cruz-de-mudela-ciudad-real-espana?niche=fin-de-semana',
      imagen: finde[0].imagen,
    });
    assert.match(finde[0].imagen, /^https:\/\/.*cloudfront\.net\/resize\//);
    assert.ok(finde.every((h) => /^\d+$/.test(h.id)));
    assert.equal(parsearSeccion('<html><body>Hola</body></html>'), null);
  });

  it('una oferta por hotel, la más barata si sale en varias secciones, con las secciones como etiquetas', () => {
    const { ctx, logs } = crearCtx();
    const ofertas = combinar([{ seccion: 'Fin de semana', hoteles: finde }, { seccion: 'Última hora', hoteles: ultima }], ctx);
    assert.deepEqual(logs, []);
    assert.equal(new Set(ofertas.map((o) => o.id)).size, ofertas.length);
    for (const o of ofertas) assert.deepEqual(validarOferta(o), [], o.id);
    const valencia = ofertas.find((o) => o.id === 'muchoviaje:47023');
    assert.deepEqual(valencia.etiquetas, ['Fin de semana', 'Última hora'], 'sale en las dos');
    assert.deepEqual([valencia.precio, valencia.unidad, valencia.estrellas, valencia.alojamiento], [72, 'noche', 4, 'hotel']);
    assert.equal(valencia.precioTexto, 'desde 72 € de media por noche');
    assert.equal(valencia.establecimiento, 'Hotel Valencia Congress');
    assert.match(valencia.descripcion, /^Hotel de 4 estrellas en Paterna, España\. Precio medio por noche/);
    assert.equal(ofertas.find((o) => /Apartamentos El Faro/.test(o.titulo)).alojamiento, 'apartamento');
  });

  it('obtener: todas las secciones con pausa; una que ya no existe no impide retirar lo viejo', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: (url) => {
      if (url.endsWith('/fin-de-semana')) return leerFixture('muchoviaje-fin-de-semana.html');
      if (url.endsWith('/ultima-hora')) return leerFixture('muchoviaje-ultima-hora.html');
      throw new ErrorHttp(404, url);
    } });
    const { ofertas, reemplazar } = await muchoviaje.obtener(ctx);
    assert.equal(peticiones.length, SECCIONES.length);
    assert.equal(esperas.length, SECCIONES.length - 1);
    assert.ok(ofertas.length >= 15);
    assert.equal(reemplazar, true);
    const caida = crearCtx({ respuestas: (url) => {
      if (url.endsWith('/fin-de-semana')) return leerFixture('muchoviaje-fin-de-semana.html');
      throw new ErrorHttp(500, url);
    } });
    assert.equal((await muchoviaje.obtener(caida.ctx)).reemplazar, false, 'con un fallo no se borra lo guardado');
    const bloqueo = crearCtx({ respuestas: (url) => { throw new ErrorHttp(403, url); } });
    await assert.rejects(muchoviaje.obtener(bloqueo.ctx), /No se ha podido leer ninguna sección/);
  });

  it('robots.txt permite las secciones', () => {
    const robots = leerFixture('muchoviaje-robots.txt');
    for (const url of muchoviaje.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
  });
});

describe('grandvalira: ofertas de esquí', () => {
  const pagina = 'https://www.grandvalira.com/es/ofertas-esqui-andorra';
  const ofertas = parsearGrandvalira(leerFixture('grandvalira-esqui-andorra.html'), pagina);
  const hotelForfait = parsearGrandvalira(leerFixture('grandvalira-hotel-forfait.html'), 'https://www.grandvalira.com/es/ofertas-hotel-forfait');

  it('con hotel es un paquete con fechas cerradas; lo demás, una actividad', () => {
    assert.equal(ofertas.length, 15);
    for (const o of [...ofertas, ...hotelForfait]) assert.deepEqual(validarOferta(o), [], o.id);
    const [primera] = ofertas;
    assert.equal(primera.titulo, 'Grandvalira: Hotel + Forfait, 3 noches de hotel y 2 días de forfait para 2 adultos y 2 niños');
    assert.deepEqual([primera.tipo, primera.alojamiento, primera.noches, primera.precio, primera.unidad], ['paquete', 'hotel', 3, 195.97, 'pp']);
    assert.equal(primera.precioTexto, 'desde 195,97 € por persona');
    assert.deepEqual([primera.fechas.salida, primera.fechas.vuelta], ['2026-12-05', '2026-12-08']);
    assert.equal(primera.caduca, '2026-12-05T22:59:59.000Z');
    assert.match(primera.url, /^https:\/\/assistant\.grandvalira\.com\//);
    assert.equal(primera.lugar.codigoPais, 'AD');
    const raquetas = ofertas.find((o) => /raquetas/.test(o.titulo));
    assert.deepEqual([raquetas.tipo, raquetas.precioTexto], ['actividad', 'desde 30,50 € por persona']);
    // Sin repetir el nombre («Snake Gliss, Snake Gliss en Grandvalira»).
    assert.equal(raquetas.titulo, 'Grandvalira: Excursión con raquetas');
    assert.ok(ofertas.some((o) => o.titulo === 'Grandvalira: Snake Gliss'));
  });

  it('un periodo largo es una validez, no una estancia; «por persona/noche» se entiende', () => {
    const periodo = ofertas.find((o) => /Forfait \+ material de alquiler, 4 días/.test(o.titulo));
    assert.equal(periodo.fechas.salida, null);
    assert.equal(periodo.caduca, '2026-12-31T22:59:59.000Z');
    const porNoche = hotelForfait.find((o) => /Hotel 3\* \+ Forfait/.test(o.titulo));
    assert.deepEqual([porNoche.unidad, porNoche.precioTexto], ['pp/noche', 'desde 171 € por persona y noche']);
    assert.equal(hotelForfait.filter((o) => o.alojamiento === 'apartamento').length, 2);
    assert.equal(parsearGrandvalira('<html><body></body></html>', pagina), null);
  });

  it('obtener: las dos páginas sin repetidas; fuera de temporada no es un error', async () => {
    const { ctx } = crearCtx({ respuestas: (url) => leerFixture(url.endsWith('hotel-forfait') ? 'grandvalira-hotel-forfait.html' : 'grandvalira-esqui-andorra.html') });
    const { ofertas: todas, reemplazar } = await grandvalira.obtener(ctx);
    assert.equal(todas.length, 19);
    assert.equal(reemplazar, true);
    const verano = crearCtx({ respuestas: () => '<html><body><h1>Ofertas</h1></body></html>' });
    assert.deepEqual(await grandvalira.obtener(verano.ctx), { ofertas: [], reemplazar: false });
    const bloqueo = crearCtx({ respuestas: (url) => { throw new ErrorHttp(403, url); } });
    await assert.rejects(grandvalira.obtener(bloqueo.ctx), /No se ha podido leer ninguna página/);
  });

  it('robots.txt permite las páginas', () => {
    const robots = leerFixture('grandvalira-robots.txt');
    for (const url of grandvalira.urls) assert.ok(rutaPermitida(robots, new URL(url).pathname), url);
  });
});
