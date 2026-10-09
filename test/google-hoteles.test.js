import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Cache } from '../src/cache.js';
import { anadirPreciosGoogle, candidatasHoteles, nocheDeReferencia, preciosDeFilas } from '../src/enriquecer/google-hoteles.js';
import { consultasDeHoy } from '../src/util/apify.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, AJUSTES, leerFixtureJson, oferta } from './ayudas.js';

/** Respuesta real del actor: «Hotel Alba Seleqtta, Lloret de Mar», noche del viernes 16 de octubre de 2026, 2 adultos. */
const FILAS = leerFixtureJson('apify-google-hoteles.json');
const VIERNES = '2026-10-16';
const FINDES = findesProximos(6, AHORA);

const alba = (campos = {}) => oferta({ fuente: 'weekendesk', alojamiento: 'hotel', establecimiento: 'Hotel Alba Seleqtta', lugar: { nombre: 'Lloret de Mar' }, ...campos });

function ctxHoteles({ respuesta = FILAS, token = 'x', cache = new Cache(), config = {}, ahora = AHORA } = {}) {
  const peticiones = [];
  const logs = [];
  const http = {
    json: async (url, opciones) => {
      peticiones.push({ url, opciones });
      if (respuesta instanceof Error) throw respuesta;
      // Las filas reales, con la fecha que se pide.
      return respuesta.map((f) => ({ ...f, checkInDate: opciones.cuerpo.checkInDate }));
    },
  };
  const ajustes = { ...AJUSTES, apify: { presupuestoMensualUsd: 4.5, googleHoteles: { maxPorDia: 2, diasValidez: 7, ...config } } };
  return { ctx: { ahora, ajustes, cache, env: token ? { APIFY_TOKEN: token } : {}, http, findes: FINDES, log: (m) => logs.push(m) }, peticiones, logs };
}

describe('google-hoteles: el mismo hotel en otras webs, según Google Hoteles', () => {
  it('lo más barato primero (como mucho 6) y siempre la web oficial', () => {
    const precios = preciosDeFilas(FILAS, alba(), VIERNES);
    assert.equal(precios.fecha, VIERNES);
    assert.equal(precios.adultos, 2);
    assert.equal(precios.minimo, 63);
    assert.deepEqual(precios.proveedores.map((p) => `${p.nombre} ${p.precio}`), [
      'Super.com 63', 'Billabook.com 63', 'Vio.com 68', 'Hotels.com 68', 'goseek.com 68', 'Etrip.net 68', 'Hotel Alba Seleqtta 89',
    ]);
    assert.equal(precios.proveedores.at(-1).oficial, true);
    assert.ok(!JSON.stringify(precios).includes('/travel/lodging/clk'), 'los enlaces de anuncios de Google no se guardan');
  });

  it('si la web oficial no se llama como el alojamiento, puede ser otro hotel: nada', () => {
    assert.equal(preciosDeFilas(FILAS, alba({ establecimiento: 'Hotel Santa Anna' }), VIERNES), null);
    assert.equal(preciosDeFilas(FILAS.filter((f) => !f.isOfficial), alba(), VIERNES), null);
    assert.equal(preciosDeFilas(FILAS, alba(), '2026-10-23'), null, 'filas de otra noche');
    assert.equal(preciosDeFilas({ error: 'x' }, alba(), VIERNES), null);
  });

  it('solo hoteles y similares con nombre propio (las casas rurales casi nunca están)', () => {
    const casa = oferta({ alojamiento: 'casa-rural', establecimiento: 'Can Panxa', lugar: { nombre: 'Sant Pere de Vilamajor' } });
    const sinNombre = oferta({ alojamiento: 'hotel', lugar: { nombre: 'Lloret de Mar' } });
    assert.deepEqual(candidatasHoteles([alba(), casa, sinNombre]).map((o) => o.establecimiento), ['Hotel Alba Seleqtta']);
  });

  it('la noche de referencia es el viernes de su finde o, si ya pasó o no tiene, el del próximo', () => {
    assert.equal(nocheDeReferencia(alba({ fechas: { findeId: '2026-10-02' } }), FINDES, '2026-09-18'), '2026-10-02');
    assert.equal(nocheDeReferencia(alba(), FINDES, '2026-09-18'), '2026-09-25', 'hoy es viernes: el siguiente');
    assert.equal(nocheDeReferencia(alba(), [], '2026-09-18'), null);
  });

  it('consulta los mejor puntuados primero, guarda el resultado y no repite mientras valga', async () => {
    const cache = new Cache();
    const primera = ctxHoteles({ cache, config: { maxPorDia: 1 } });
    const otro = alba({ establecimiento: 'Hotel Santa Anna', lugar: { nombre: "L'Estartit" }, puntuacion: 40 });
    const mejor = alba({ puntuacion: 80 });
    await anadirPreciosGoogle([otro, mejor], primera.ctx);
    assert.equal(primera.peticiones.length, 1);
    assert.deepEqual(primera.peticiones[0].opciones.cuerpo, { entity: 'Hotel Alba Seleqtta, Lloret de Mar', checkInDate: '2026-09-25', days: 1, adults: 2, currency: 'EUR' });
    assert.equal(mejor.preciosGoogle.minimo, 63);
    assert.equal(otro.preciosGoogle, null);
    assert.equal(consultasDeHoy(cache, 'googleHoteles', AHORA), 1);

    const segunda = ctxHoteles({ cache, ahora: new Date('2026-09-19T08:00:00Z') });
    const otraVez = alba();
    await anadirPreciosGoogle([otraVez], segunda.ctx);
    assert.equal(segunda.peticiones.length, 0, 'el precio guardado sigue valiendo');
    assert.equal(otraVez.preciosGoogle.minimo, 63);
  });

  it('cuando pasa su viernes, el precio guardado ya no se enseña', async () => {
    const cache = new Cache();
    await anadirPreciosGoogle([alba()], ctxHoteles({ cache }).ctx);
    const despues = ctxHoteles({ cache, token: null, ahora: new Date('2026-09-26T08:00:00Z') });
    const o = alba();
    o.preciosGoogle = { fecha: '2026-09-25', minimo: 63, proveedores: [] };
    await anadirPreciosGoogle([o], despues.ctx);
    assert.equal(o.preciosGoogle, null);
  });

  it('un hotel que no es el que se buscaba se guarda como «sin precios» y no se enseña', async () => {
    const { ctx } = ctxHoteles();
    const santa = alba({ establecimiento: 'Hotel Santa Anna', lugar: { nombre: "L'Estartit" } });
    await anadirPreciosGoogle([santa], ctx);
    assert.equal(santa.preciosGoogle, null);
    const guardado = Object.entries(ctx.cache.exportar()).find(([k]) => k.startsWith('ghoteles:'))[1].v;
    assert.deepEqual(guardado, { fecha: '2026-09-25', precios: null });
  });

  it('sin token no consulta nada; si Apify falla, no rompe el escaneo', async () => {
    const sinToken = ctxHoteles({ token: null });
    await anadirPreciosGoogle([alba()], sinToken.ctx);
    assert.equal(sinToken.peticiones.length, 0);
    const caido = ctxHoteles({ respuesta: new Error('caído') });
    const o = alba();
    await anadirPreciosGoogle([o], caido.ctx);
    assert.equal(o.preciosGoogle, null);
    assert.match(caido.logs.join('\n'), /Google Hoteles: caído/);
    assert.equal(consultasDeHoy(caido.ctx.cache, 'googleHoteles', AHORA), 1, 'el intento gasta cupo: no se repite cada 15 minutos');
  });
});
