import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Cache } from '../src/cache.js';
import {
  ACTORES, ErrorPresupuesto, anotarConsultas, consultasDeHoy, costeEstimado, ejecutarActor, gastoDelMes, urlEjecucion,
} from '../src/util/apify.js';
import { ErrorHttp } from '../src/util/http.js';
import { AHORA, AJUSTES } from './ayudas.js';

/** Contexto con una API de Apify simulada que apunta cada petición con sus opciones. */
function ctxApify({ respuesta = [], token = 'token-secreto', presupuesto = 4.5, cache = new Cache() } = {}) {
  const peticiones = [];
  const http = {
    json: async (url, opciones) => {
      peticiones.push({ url, opciones });
      if (respuesta instanceof Error) throw respuesta;
      return typeof respuesta === 'function' ? respuesta(url, opciones) : respuesta;
    },
  };
  const env = token ? { APIFY_TOKEN: token } : {};
  return { ctx: { ahora: AHORA, ajustes: { ...AJUSTES, apify: { presupuestoMensualUsd: presupuesto } }, cache, env, http }, peticiones };
}

describe('apify: ejecutar un actor sin pasarse del presupuesto', () => {
  it('la URL lleva el actor, el tope de la ejecución y nunca el token', () => {
    const url = urlEjecucion('googleFlights', 0.01);
    assert.match(url, /^https:\/\/api\.apify\.com\/v2\/acts\/lergassy~google-flights-scraper\/run-sync-get-dataset-items\?/);
    assert.equal(new URL(url).searchParams.get('maxTotalChargeUsd'), '0.01');
    assert.doesNotMatch(url, /token/i);
    assert.throws(() => urlEjecucion('noExiste'), /desconocido/);
  });

  it('manda la entrada por POST, el token en una cabecera y sin reintentos (cada intento cobra)', async () => {
    const { ctx, peticiones } = ctxApify({ respuesta: [{ a: 1 }, { a: 2 }] });
    const filas = await ejecutarActor(ctx, 'googleMaps', { searchStringsArray: ['Can Panxa'] }, { maxUsd: 0.05 });
    assert.equal(filas.length, 2);
    assert.equal(peticiones.length, 1);
    const { url, opciones } = peticiones[0];
    assert.match(url, /compass~crawler-google-places/);
    assert.deepEqual(opciones.cuerpo, { searchStringsArray: ['Can Panxa'] });
    assert.equal(opciones.cabeceras.Authorization, 'Bearer token-secreto');
    assert.equal(opciones.reintentos, 0);
  });

  it('apunta el gasto estimado del mes: arranque más cada resultado, sin pasar del tope', async () => {
    const { ctx } = ctxApify({ respuesta: [{}, {}, {}] });
    await ejecutarActor(ctx, 'googleMaps', {}, { maxUsd: 0.05 });
    assert.deepEqual(gastoDelMes(ctx.cache, AHORA), { usd: costeEstimado('googleMaps', 3), ejecuciones: 1 });
    assert.equal(costeEstimado('googleMaps', 3), ACTORES.googleMaps.usdPorEjecucion + 3 * ACTORES.googleMaps.usdPorResultado);
    assert.equal(costeEstimado('googleMaps', 1000, 0.05), 0.05, 'nunca más que el tope de la ejecución');
    // Otro mes, otra cuenta.
    assert.deepEqual(gastoDelMes(ctx.cache, new Date('2026-10-02T08:00:00Z')), { usd: 0, ejecuciones: 0 });
  });

  it('sin presupuesto para el tope de la ejecución no se lanza nada', async () => {
    const { ctx, peticiones } = ctxApify({ presupuesto: 0.03 });
    await assert.rejects(ejecutarActor(ctx, 'googleHoteles', {}, { maxUsd: 0.05 }), ErrorPresupuesto);
    assert.equal(peticiones.length, 0);
  });

  it('sin token, error claro y sin peticiones', async () => {
    const { ctx, peticiones } = ctxApify({ token: null });
    await assert.rejects(ejecutarActor(ctx, 'googleMaps', {}, { maxUsd: 0.05 }), /APIFY_TOKEN/);
    assert.equal(peticiones.length, 0);
  });

  it('si la petición falla se cuenta el tope como gastado (el actor puede haber trabajado)', async () => {
    const { ctx } = ctxApify({ respuesta: new ErrorHttp(500, urlEjecucion('googleMaps')) });
    await assert.rejects(ejecutarActor(ctx, 'googleMaps', {}, { maxUsd: 0.05 }), ErrorHttp);
    assert.equal(gastoDelMes(ctx.cache, AHORA).usd, 0.05);
  });

  it('token rechazado (401) y cuenta sin saldo (402) se explican', async () => {
    const rechazado = ctxApify({ respuesta: new ErrorHttp(401, urlEjecucion('googleMaps')) });
    await assert.rejects(ejecutarActor(rechazado.ctx, 'googleMaps', {}, { maxUsd: 0.01 }), /revisa el secreto APIFY_TOKEN/);
    const sinSaldo = ctxApify({ respuesta: new ErrorHttp(402, urlEjecucion('googleMaps')) });
    await assert.rejects(ejecutarActor(sinSaldo.ctx, 'googleMaps', {}, { maxUsd: 0.01 }), ErrorPresupuesto);
  });

  it('una respuesta que no es una lista es un error', async () => {
    const { ctx } = ctxApify({ respuesta: { error: 'algo' } });
    await assert.rejects(ejecutarActor(ctx, 'googleMaps', {}, { maxUsd: 0.01 }), /no es una lista/);
  });

  it('cuenta las consultas de cada día por separado', () => {
    const cache = new Cache();
    anotarConsultas(cache, 'googleMaps', AHORA, 3);
    anotarConsultas(cache, 'googleMaps', AHORA, 2);
    assert.equal(consultasDeHoy(cache, 'googleMaps', AHORA), 5);
    assert.equal(consultasDeHoy(cache, 'googleHoteles', AHORA), 0);
    assert.equal(consultasDeHoy(cache, 'googleMaps', new Date('2026-09-19T08:00:00Z')), 0);
  });
});
