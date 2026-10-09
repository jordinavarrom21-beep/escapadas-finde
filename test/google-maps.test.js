import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Cache } from '../src/cache.js';
import {
  anadirNotasGoogle, aplicarNotaGoogle, busquedaMaps, candidatasMaps, coincideLugar, mismoNombre, notaDeLugar, resultadoMaps,
} from '../src/enriquecer/google-maps.js';
import { consultasDeHoy } from '../src/util/apify.js';
import { AHORA, AJUSTES, leerFixtureJson, oferta } from './ayudas.js';

/** Respuesta real del actor para «Guitart Central Park Aqua Resort, Lloret de Mar» y «Can Panxa, Sant Pere de Vilamajor». */
const LUGARES = leerFixtureJson('apify-google-maps.json');
const [GUITART, PANXA] = LUGARES;

const guitart = () => oferta({ fuente: 'muchoviaje', alojamiento: 'hotel', establecimiento: 'Guitart Central Park Aqua Resort', lugar: { nombre: 'Lloret de Mar', provincia: 'Girona' } });
const panxa = () => oferta({ fuente: 'tuscasasrurales', alojamiento: 'casa-rural', establecimiento: 'Can Panxa', lugar: { nombre: 'Sant Pere de Vilamajor', provincia: 'Barcelona' } });

function ctxMaps({ respuesta = LUGARES, token = 'x', cache = new Cache(), config = {} } = {}) {
  const peticiones = [];
  const logs = [];
  const http = {
    json: async (url, opciones) => {
      peticiones.push({ url, opciones });
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
  };
  const ajustes = { ...AJUSTES, apify: { presupuestoMensualUsd: 4.5, googleMaps: { maxPorEscaneo: 5, maxPorDia: 10, ...config } } };
  return { ctx: { ahora: AHORA, ajustes, cache, env: token ? { APIFY_TOKEN: token } : {}, http, log: (m) => logs.push(m) }, peticiones, logs };
}

describe('google-maps: nota de Google para los alojamientos sin opiniones en su web', () => {
  it('mismo nombre: cuentan las palabras que distinguen, no «Hotel», «Can» ni «Rural»', () => {
    assert.ok(mismoNombre('Can Panxa', 'Can Panxa'));
    assert.ok(mismoNombre('Oassium Hotel - Adults Only', 'Oassium Hotel'));
    assert.ok(mismoNombre('Hotel Alba Seleqtta', 'Alba Seleqtta Hotel Spa'));
    assert.ok(mismoNombre('Masía Can Riera', 'Mas Can Riera'), 'sin tildes ni mayúsculas');
    assert.ok(!mismoNombre('Can Panxa', 'Can Riera'));
    assert.ok(!mismoNombre('Hotel Alba Seleqtta', 'Hotel Santa Anna'));
    assert.ok(!mismoNombre('Hotel Spa', 'Hotel Sol'), 'sin palabras distintivas, solo si es idéntico');
  });

  it('mismo sitio: a menos de 25 km si la oferta trae coordenadas; si no, localidad o provincia en la dirección', () => {
    assert.ok(coincideLugar(GUITART, guitart()), 'Lloret de Mar está en su dirección');
    assert.ok(coincideLugar(PANXA, panxa()), 'Google no da el pueblo, pero sí la provincia');
    const lejos = oferta({ establecimiento: 'Can Panxa', lugar: { nombre: 'Sant Pere de Vilamajor', lat: 42.5, lon: 1.5 } });
    assert.ok(!coincideLugar(PANXA, lejos));
    const cerca = oferta({ establecimiento: 'Can Panxa', lugar: { nombre: 'Sant Pere de Vilamajor', lat: 41.686, lon: 2.391 } });
    assert.ok(coincideLugar(PANXA, cerca));
    const otraProvincia = oferta({ establecimiento: 'Can Panxa', lugar: { nombre: 'Olot', provincia: 'Girona' } });
    assert.ok(!coincideLugar(PANXA, otraProvincia));
  });

  it('la nota pasa de 5 estrellas a 10 y guarda el enlace a Google Maps y sus coordenadas', () => {
    assert.deepEqual(notaDeLugar(GUITART), { nota: 8, n: 4091, url: GUITART.url, lat: 41.6985995, lon: 2.8391036 });
    assert.equal(notaDeLugar(PANXA).nota, 7.8);
    assert.equal(notaDeLugar({ ...PANXA, reviewsCount: 0 }), null, 'sin opiniones no hay nota');
    assert.equal(notaDeLugar({ ...PANXA, url: 'https://otra.web/x' }).url, null);
  });

  it('solo para ofertas con nombre y lugar y sin valoración de su web (la de la web manda)', () => {
    const conNota = oferta({ establecimiento: 'Can Riera', lugar: { nombre: 'Olot' }, valoracion: { nota: 9, n: 10 } });
    const deGoogle = oferta({ establecimiento: 'Can Riera', lugar: { nombre: 'Olot' }, valoracion: { nota: 9, n: 10, fuente: 'google' } });
    const vuelo = oferta({ tipo: 'vuelo', establecimiento: 'X', lugar: { nombre: 'Roma' } });
    assert.deepEqual(candidatasMaps([guitart(), conNota, deGoogle, vuelo, oferta()]).map((o) => o.establecimiento), ['Guitart Central Park Aqua Resort', 'Can Riera']);
  });

  it('otro sitio o uno cerrado: «sin nota», para no volver a pagar por él', () => {
    assert.deepEqual(resultadoMaps(guitart(), PANXA), { sinNota: true });
    assert.deepEqual(resultadoMaps(guitart(), { ...GUITART, permanentlyClosed: true }), { sinNota: true });
    assert.deepEqual(resultadoMaps(guitart(), undefined), { sinNota: true });
    assert.equal(resultadoMaps(guitart(), GUITART).nota, 8);
  });

  it('pone la nota con su fuente y las coordenadas solo si la oferta no trae', () => {
    const o = panxa();
    assert.ok(aplicarNotaGoogle(o, notaDeLugar(PANXA)));
    assert.deepEqual(o.valoracion, { nota: 7.8, n: 98, fuente: 'google', url: PANXA.url });
    assert.equal(o.lugar.lat, 41.6972106);
    const conCoordenadas = oferta({ establecimiento: 'Can Panxa', lugar: { nombre: 'Sant Pere de Vilamajor', lat: 41.686, lon: 2.391 } });
    aplicarNotaGoogle(conCoordenadas, notaDeLugar(PANXA));
    assert.equal(conCoordenadas.lugar.lat, 41.686);
    assert.equal(aplicarNotaGoogle(panxa(), { sinNota: true }), false);
  });

  it('consulta los pendientes en una sola ejecución, guarda el resultado y la siguiente vez no paga', async () => {
    const cache = new Cache();
    const primera = ctxMaps({ cache });
    const ofertas = [guitart(), panxa()];
    await anadirNotasGoogle(ofertas, primera.ctx);
    assert.equal(primera.peticiones.length, 1);
    assert.deepEqual(primera.peticiones[0].opciones.cuerpo.searchStringsArray.sort(), ['Can Panxa, Sant Pere de Vilamajor', 'Guitart Central Park Aqua Resort, Lloret de Mar']);
    assert.equal(primera.peticiones[0].opciones.cuerpo.maxCrawledPlacesPerSearch, 1);
    assert.deepEqual(ofertas.map((o) => o.valoracion?.nota), [8, 7.8]);
    assert.equal(consultasDeHoy(cache, 'googleMaps', AHORA), 2);

    const segunda = ctxMaps({ cache });
    const otraVez = [guitart(), panxa()];
    await anadirNotasGoogle(otraVez, segunda.ctx);
    assert.equal(segunda.peticiones.length, 0);
    assert.deepEqual(otraVez.map((o) => o.valoracion?.nota), [8, 7.8]);
  });

  it('respeta el tope del día y del escaneo, y sin token solo pone lo guardado', async () => {
    const tope = ctxMaps({ config: { maxPorEscaneo: 1 } });
    await anadirNotasGoogle([guitart(), panxa()], tope.ctx);
    assert.equal(tope.peticiones[0].opciones.cuerpo.searchStringsArray.length, 1);

    const agotado = ctxMaps({ config: { maxPorDia: 2 } });
    await anadirNotasGoogle([guitart(), panxa()], agotado.ctx);
    await anadirNotasGoogle([oferta({ establecimiento: 'Hotel Nuevo', lugar: { nombre: 'Olot' } })], agotado.ctx);
    assert.equal(agotado.peticiones.length, 1, 'el segundo escaneo del día ya no consulta');

    const sinToken = ctxMaps({ token: null });
    await anadirNotasGoogle([guitart()], sinToken.ctx);
    assert.equal(sinToken.peticiones.length, 0);
  });

  it('si Apify falla, no guarda nada (se reintenta otro día) y no rompe el escaneo', async () => {
    const { ctx, logs } = ctxMaps({ respuesta: new Error('caído') });
    const ofertas = [guitart()];
    await anadirNotasGoogle(ofertas, ctx);
    assert.equal(ofertas[0].valoracion, null);
    assert.equal(ctx.cache.obtener(`gmaps:guitart central park aqua resort|lloret de mar`), undefined);
    assert.match(logs.join('\n'), /Google Maps: caído/);
    assert.equal(consultasDeHoy(ctx.cache, 'googleMaps', AHORA), 1, 'el intento gasta cupo: no se repite cada 15 minutos');
  });

  it('una nota de Google que ya no está guardada se quita (no se queda vieja en el estado)', async () => {
    const { ctx } = ctxMaps({ token: null });
    const vieja = guitart();
    vieja.valoracion = { nota: 8, n: 4091, fuente: 'google', url: null };
    await anadirNotasGoogle([vieja], ctx);
    assert.equal(vieja.valoracion, null);
  });

  it('la búsqueda es «nombre, localidad»', () => {
    assert.equal(busquedaMaps(panxa()), 'Can Panxa, Sant Pere de Vilamajor');
  });
});
