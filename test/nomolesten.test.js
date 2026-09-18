import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import fuente, { parsear } from '../src/fuentes/nomolesten.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { rutaPermitida } from '../src/util/robots.js';

const leer = (nombre) => readFileSync(new URL(`./fixtures/nomolesten-${nombre}`, import.meta.url), 'utf8');
const OFERTAS = leer('ofertas.html');
const ROMANTICOS = leer('romanticos.html');
const ENOTURISMO = leer('enoturismo.html');
const PAGINA_SIN_TARJETAS = '<html><body><h1>Hoteles de Montaña</h1></body></html>';

const URL_OFERTAS = 'https://nomolesten.com/hoteles-con-encanto/ofertas/';
const URL_ROMANTICOS = 'https://nomolesten.com/hoteles-con-encanto/hoteles-romanticos/';
const URL_ENOTURISMO = 'https://nomolesten.com/escapadas/enoturismo/';

/** ctx con un http falso: `respuestas[url]` es el HTML o un Error que se lanza. */
function crearCtx(respuestas = {}) {
  const registro = [];
  const peticiones = [];
  const pausas = [];
  return {
    registro,
    peticiones,
    pausas,
    ahora: new Date('2026-09-18T12:00:00+02:00'),
    log: (mensaje) => registro.push(mensaje),
    http: {
      texto: async (url) => {
        peticiones.push(url);
        const respuesta = respuestas[url] ?? PAGINA_SIN_TARJETAS;
        if (respuesta instanceof Error) throw respuesta;
        return respuesta;
      },
      esperar: async (ms) => pausas.push(ms),
    },
  };
}

const PAGINAS_REALES = { [URL_OFERTAS]: OFERTAS, [URL_ROMANTICOS]: ROMANTICOS, [URL_ENOTURISMO]: ENOTURISMO };
const hoteles = parsear(OFERTAS, crearCtx(), { tema: 'ofertas' });
const hotel = (ruta) => hoteles.find((o) => o.id === `nomolesten:hoteles-con-encanto/${ruta}`);

describe('nomolesten: tarjetas de hotel', () => {
  it('convierte las tarjetas del servidor en ofertas válidas', () => {
    assert.equal(hoteles.length, 10);
    for (const o of hoteles) assert.deepEqual(validarOferta(o), [], o.id);
    assert.equal(new Set(hoteles.map((o) => o.id)).size, hoteles.length);
  });

  it('rellena nombre, enlace sin fechas, imagen, lugar y fechas del precio', () => {
    const comtal = hotel('castello-dempuries/boutique-hotel-comtal-empuries');
    assert.equal(comtal.tipo, 'hotel');
    assert.equal(comtal.titulo, 'Boutique Hotel Comtal Empúries');
    assert.equal(comtal.url, 'https://nomolesten.com/hoteles-con-encanto/castello-dempuries/boutique-hotel-comtal-empuries');
    assert.match(comtal.imagen, /^https:\/\/pro\.nomolesten\.com\/storage\/hotels\/758\//);
    assert.deepEqual(comtal.lugar, {
      nombre: "Castelló d'Empúries", region: 'Girona', pais: 'España', codigoPais: 'ES', lat: null, lon: null, iata: null,
    });
    assert.equal(comtal.transporte, 'coche');
    assert.equal(comtal.fechas.salida, '2026-09-18');
    assert.equal(comtal.fechas.vuelta, '2026-09-19');
    assert.equal(comtal.noches, 1);
    assert.equal(comtal.regimen, 'desayuno');
    assert.equal(
      comtal.descripcion,
      "Hotel con encanto en Castelló d'Empúries, Girona, Cataluña. Desayuno incluido. Valoración 10/10 (2 opiniones).",
    );
    assert.equal(hotel('monroyo/torre-del-marques-hotel-spa-winery-small-luxury-hotels').titulo,
      'Torre del Marqués Hotel Spa & Winery, Small Luxury Hotels');
  });

  it('el precio del Club Nomolesten es el precio y el público, el anterior', () => {
    const macelli = hotel('castello-dempuries/palau-macelli');
    assert.equal(macelli.precio, 195);
    assert.equal(macelli.precioAnterior, 287);
    assert.equal(macelli.descuento, 32);
    assert.equal(macelli.unidad, 'noche');
    assert.equal(macelli.precioTexto, '195 € la noche para 2 adultos con el Club Nomolesten (287 € sin él)');
    assert.deepEqual(macelli.etiquetas, ['Oferta Club Nomolesten', 'Club Nomolesten']);
  });

  it('sin precio de club, el precio es el público y las ventajas van como etiqueta', () => {
    const sixtytwo = hotel('barcelona/sixtytwo-hotel');
    assert.equal(sixtytwo.precio, 295);
    assert.equal(sixtytwo.precioAnterior, null);
    assert.equal(sixtytwo.descuento, null);
    assert.equal(sixtytwo.precioTexto, '295 € la noche para 2 adultos');
    assert.ok(sixtytwo.etiquetas.includes('Ventajas Club Nomolesten'));
  });

  it('un precio tachado pasa a ser el precio anterior', () => {
    const conTachado = OFERTAS.replace(
      'Precio 1 noche <span class="nm-text-base nm-font-bold">295 €</span>',
      'Precio 1 noche <s class="nm-text-red-600">350 €</s> <span class="nm-text-base nm-font-bold">295 €</span>',
    );
    const sixtytwo = parsear(conTachado, crearCtx()).find((o) => o.titulo === 'Sixtytwo Hotel');
    assert.equal(sixtytwo.precio, 295);
    assert.equal(sixtytwo.precioAnterior, 350);
    assert.equal(sixtytwo.descuento, 16);
  });

  it('el tema de la página añade temas y etiqueta', () => {
    const romanticos = parsear(ROMANTICOS, crearCtx(), { tema: 'romantico' });
    assert.equal(romanticos.length, 10);
    for (const o of romanticos) {
      assert.deepEqual(o.temas, ['romantico']);
      assert.equal(o.etiquetas[0], 'Romántico');
    }
    assert.deepEqual(parsear(OFERTAS, crearCtx())[0].temas, []);
  });
});

describe('nomolesten: escapadas', () => {
  const escapadas = parsear(ENOTURISMO, crearCtx(), { tema: 'enoturismo' });
  const priorat = escapadas.find((o) => o.id.endsWith('/escapada-al-priorat-con-una-cena-incluida'));

  it('ignora las tarjetas no disponibles en las fechas', () => {
    assert.equal(escapadas.length, 7);
    for (const o of escapadas) assert.deepEqual(validarOferta(o), [], o.id);
  });

  it('une el nombre de la escapada y del alojamiento, y lo que incluye', () => {
    assert.equal(priorat.tipo, 'escapada');
    assert.equal(priorat.titulo, 'Escapada al Priorat con una cena incluida · El Palauet del Priorat');
    assert.equal(priorat.precio, 239);
    assert.equal(priorat.lugar.nombre, 'Cornudella de montsant');
    assert.deepEqual(priorat.temas, ['gastronomia']);
    assert.deepEqual(priorat.etiquetas, ['Enoturismo', 'Comida o cena']);
    assert.match(priorat.descripcion, /^En El Palauet del Priorat, Cornudella de montsant, Tarragona, Cataluña\. Incluye: Comida o cena\./);
  });

  it('desayuno más cena es media pensión', () => {
    const meano = escapadas.find((o) => o.id.includes('/quinta-de-san-amaro/'));
    assert.equal(meano.regimen, 'media-pension');
  });
});

describe('nomolesten: obtener', () => {
  it('declara solo URLs que su robots.txt permite, sin parámetros prohibidos', () => {
    const robots = leer('robots.txt');
    assert.equal(fuente.urls.length, 7);
    for (const url of fuente.urls) {
      const { pathname, search } = new URL(url);
      assert.equal(search, '');
      assert.ok(rutaPermitida(robots, pathname), url);
    }
  });

  it('recorre las páginas con pausas y une los hoteles repetidos con todos sus temas', async () => {
    const ctx = crearCtx(PAGINAS_REALES);
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.deepEqual(ctx.peticiones, fuente.urls);
    assert.deepEqual(ctx.pausas, Array(6).fill(2000));
    assert.equal(reemplazar, true);
    assert.equal(ofertas.length, 10 + 10 + 7 - 1);
    assert.equal(new Set(ofertas.map((o) => o.url)).size, ofertas.length);

    const axara = ofertas.find((o) => o.id === 'nomolesten:hoteles-con-encanto/jorquera/xuq-al-axara');
    assert.deepEqual(axara.temas, ['romantico']);
    assert.deepEqual(axara.etiquetas, ['Oferta Club Nomolesten', 'Ventajas Club Nomolesten', 'Romántico']);
    assert.ok(ctx.registro.some((linea) => linea.includes('ninguna tarjeta con precio')));
  });

  it('si falla una página sigue con las demás y no reemplaza el catálogo', async () => {
    const ctx = crearCtx({ ...PAGINAS_REALES, [URL_ROMANTICOS]: new ErrorHttp(500, URL_ROMANTICOS) });
    const { ofertas, reemplazar } = await fuente.obtener(ctx);
    assert.equal(reemplazar, false);
    assert.equal(ofertas.length, 17);
    assert.equal(ctx.peticiones.length, 7);
  });

  it('ante un bloqueo deja de pedir páginas', async () => {
    const ctx = crearCtx({ [URL_OFERTAS]: new ErrorHttp(403, URL_OFERTAS) });
    await assert.rejects(fuente.obtener(ctx), /No se ha podido leer ninguna página de Nomolesten.*HTTP 403/);
    assert.equal(ctx.peticiones.length, 1);
  });

  it('un desafío anti-bot se trata como bloqueo', async () => {
    const desafio = '<html><head><title>Just a moment...</title></head><body class="cf-chl"></body></html>';
    const ctx = crearCtx({ [URL_OFERTAS]: desafio });
    await assert.rejects(fuente.obtener(ctx), /desafío anti-bot/);
    assert.equal(ctx.peticiones.length, 1);
  });

  it('falla con un mensaje claro si ninguna página tiene precios', async () => {
    await assert.rejects(fuente.obtener(crearCtx()), /ningún hotel con precio/);
  });
});
