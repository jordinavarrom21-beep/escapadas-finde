import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import fuente, { aplicarTema, condicionDe, lugarDe, parsear, parsearHoteles } from '../src/fuentes/rusticae.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { crearCtx, leerFixture } from './ayudas.js';

const LAST_MINUTE = leerFixture('rusticae-last-minute.html');
const ENTRE_SEMANA = leerFixture('rusticae-entre-semana.html');
const [URL_LAST_MINUTE, URL_ENTRE_SEMANA, URL_ROMANTICOS, URL_GASTRONOMICOS, URL_MASCOTAS, URL_RURALES] = fuente.urls;
const PAGINAS = {
  [URL_LAST_MINUTE]: LAST_MINUTE,
  [URL_ENTRE_SEMANA]: ENTRE_SEMANA,
  [URL_ROMANTICOS]: leerFixture('rusticae-romanticos.html'),
  [URL_GASTRONOMICOS]: leerFixture('rusticae-gastronomicos.html'),
  [URL_MASCOTAS]: leerFixture('rusticae-mascotas.html'),
  [URL_RURALES]: leerFixture('rusticae-rurales.html'),
};

const responder = (paginas) => (url) => {
  const respuesta = paginas[url];
  if (respuesta instanceof Error) throw respuesta;
  if (respuesta === undefined) throw new Error(`URL inesperada: ${url}`);
  return respuesta;
};

const porId = (ofertas, slug) => ofertas.find((o) => o.id === `rusticae:${slug}`);

describe('parsear (páginas reales)', () => {
  it('une tarjetas y mapa: todos los hoteles con ubicación, imagen y coordenadas', () => {
    const hoteles = parsearHoteles(ENTRE_SEMANA);
    assert.equal(hoteles.length, 14);
    for (const hotel of hoteles) {
      assert.ok(hotel.ubicacion, hotel.slug);
      assert.match(hotel.imagen, /^https:\/\/img\.guestpro\.com\//);
      assert.ok(hotel.lat > 27 && hotel.lat < 44 && hotel.lon > -19 && hotel.lon < 5, hotel.slug);
    }
    assert.equal(parsearHoteles(PAGINAS[URL_ROMANTICOS]).length, 96, 'las temáticas recortadas solo traen el mapa');
  });

  it('extrae ofertas de hotel válidas, sin precio y con la condición de la página', () => {
    const logs = [];
    const ofertas = parsear(LAST_MINUTE, { log: (m) => logs.push(m) }, ['Último minuto']);
    assert.equal(ofertas.length, 7);
    assert.deepEqual(logs, []);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.match(o.id, /^rusticae:[a-z0-9-]+$/);
      assert.match(o.url, /^https:\/\/rusticae\.es\/hotel\/[a-z0-9-]+$/);
      assert.equal(o.tipo, 'hotel');
      assert.equal(o.precio, null);
      assert.equal(o.unidad, null);
      assert.equal(o.precioTexto, 'Hasta −15 % (Ofertas de última hora)');
      assert.ok(o.etiquetas.includes('Último minuto'));
      assert.ok(o.descripcion.length > 20 && o.descripcion.length <= 300);
    }

    const aldaca = porId(ofertas, 'hotel-de-aldaca-rural');
    assert.equal(aldaca.titulo, 'Hotel De Aldaca Rural');
    assert.deepEqual(aldaca.lugar, {
      nombre: 'Jerte', region: 'Extremadura', pais: 'España', codigoPais: 'ES', lat: 40.222591400146, lon: -5.750094890594, iata: null,
    });
    assert.ok(aldaca.etiquetas.includes('Solo adultos'));
    assert.match(aldaca.descripcion, /^Una casa del siglo XIX/);
    assert.equal(aldaca.imagen, 'https://img.guestpro.com/images/pms/hotel/100487-photo-screen.jpg?1716799363');
  });

  it('lee la condición de la cabecera y el lugar de la ubicación', () => {
    assert.equal(condicionDe(ENTRE_SEMANA), 'Hasta −15 % (Ofertas de Domingo a Jueves a partir de 2 noches)');
    assert.deepEqual(lugarDe({ ubicacion: 'Lisboa, Portugal', lat: 38.7, lon: -9.1, titulo: 'X' }), {
      nombre: 'Lisboa', region: null, pais: 'Portugal', codigoPais: 'PT', lat: 38.7, lon: -9.1, iata: null,
    });
    assert.equal(lugarDe({ ubicacion: 'Marruecos, Marrakech', lat: null, lon: null, titulo: 'X' }).nombre, 'Marrakech');
    assert.equal(lugarDe({ ubicacion: '', lat: 42.1, lon: -7.9, titulo: 'Acouga' }).nombre, 'Acouga');
    assert.equal(lugarDe({ ubicacion: '', lat: null, lon: null, titulo: 'X' }), null);
  });

  it('las páginas temáticas añaden tema y etiqueta a los hoteles que salen en ellas', () => {
    const ofertas = parsear(ENTRE_SEMANA, {}, ['Entre semana']);
    const encontrados = aplicarTema(ofertas, PAGINAS[URL_MASCOTAS], { tema: 'mascotas', etiqueta: 'Mascotas bienvenidas' });
    assert.equal(encontrados, 45);
    const conMascotas = ofertas.filter((o) => o.temas.includes('mascotas'));
    assert.ok(conMascotas.length > 0 && conMascotas.length < ofertas.length);
    assert.ok(conMascotas.every((o) => o.etiquetas.includes('Mascotas bienvenidas')));
  });
});

describe('obtener', () => {
  it('pide las 6 páginas con 2 s de pausa, une los hoteles repetidos y reemplaza el catálogo', async () => {
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: responder(PAGINAS) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, fuente.urls);
    assert.equal(fuente.urls.length, 6);
    assert.deepEqual(esperas, [2000, 2000, 2000, 2000, 2000]);
    assert.deepEqual(logs, []);
    assert.equal(reemplazar, true);

    const esperadas = new Set([...parsearHoteles(LAST_MINUTE), ...parsearHoteles(ENTRE_SEMANA)].map((h) => h.slug));
    assert.equal(ofertas.length, esperadas.size);
    assert.ok(ofertas.length < 7 + 14, 'hay hoteles en las dos páginas de ofertas');

    const aldaca = porId(ofertas, 'hotel-de-aldaca-rural');
    assert.ok(aldaca.etiquetas.includes('Último minuto') && aldaca.etiquetas.includes('Entre semana'));
    assert.equal(aldaca.precioTexto, 'Hasta −15 % (Ofertas de última hora) · Hasta −15 % (Ofertas de Domingo a Jueves a partir de 2 noches)');
    assert.ok(ofertas.some((o) => o.temas.length > 0), 'las temáticas asignan temas');
    for (const o of ofertas) assert.deepEqual(validarOferta(o), [], o.id);
  });

  it('si falla una página temática sigue con el resto y no pierde las ofertas', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: responder({ ...PAGINAS, [URL_ROMANTICOS]: new ErrorHttp(500, URL_ROMANTICOS) }) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.equal(peticiones.length, 6);
    assert.equal(reemplazar, true);
    assert.ok(ofertas.every((o) => !o.temas.includes('romantico')));
  });

  it('ante un bloqueo (429) deja de pedir y no reemplaza el catálogo', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: responder({ ...PAGINAS, [URL_ENTRE_SEMANA]: new ErrorHttp(429, URL_ENTRE_SEMANA) }) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(peticiones, [URL_LAST_MINUTE, URL_ENTRE_SEMANA]);
    assert.equal(reemplazar, false);
    assert.equal(ofertas.length, 7);
  });

  it('lanza un error claro si solo recibe un desafío anti-bot', async () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>';
    const { ctx, peticiones } = crearCtx({ respuestas: () => desafio });
    await assert.rejects(fuente.obtener(ctx), /ninguna página de ofertas de Rusticae.*desafío anti-bot/);
    assert.equal(peticiones.length, 1);
  });
});
