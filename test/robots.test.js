import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Cache } from '../src/cache.js';
import { ErrorHttp } from '../src/util/http.js';
import { ErrorRobots, comprobarRobots, rutaPermitida } from '../src/util/robots.js';

const ROBOTS_RYANAIR = readFileSync(new URL('./fixtures/ryanair-robots.txt', import.meta.url), 'utf8');
const AHORA = new Date('2026-09-18T10:00:00Z');

describe('rutaPermitida', () => {
  test('el robots.txt real de Ryanair prohíbe su API', () => {
    assert.equal(rutaPermitida(ROBOTS_RYANAIR, '/api/farfnd/v4/roundTripFares'), false);
    assert.equal(rutaPermitida(ROBOTS_RYANAIR, '/es/es/trip/flights/select'), false);
    assert.equal(rutaPermitida(ROBOTS_RYANAIR, '/es/es/vuelos-baratos'), true);
  });

  test('gana la regla más larga y, a igualdad, Allow', () => {
    const robots = 'User-agent: *\nDisallow: /api\nAllow: /api/farfnd\nDisallow: /x\nAllow: /x\n';
    assert.equal(rutaPermitida(robots, '/api/farfnd/v4/roundTripFares'), true);
    assert.equal(rutaPermitida(robots, '/api/views'), false);
    assert.equal(rutaPermitida(robots, '/x'), true);
  });

  test('solo aplica los grupos de «User-agent: *», también compartidos', () => {
    assert.equal(rutaPermitida('User-agent: OtroBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n', '/api'), true);
    assert.equal(rutaPermitida('User-agent: OtroBot\nUser-agent: *\nDisallow: /privado # comentario\n', '/privado/1'), false);
  });

  test('entiende los comodines «*» y «$» y los parámetros', () => {
    const robots = 'User-agent: *\nDisallow: /*.json$\nDisallow: /*/*/booking\nDisallow: /*?pagina=\n';
    assert.equal(rutaPermitida(robots, '/datos/a.json'), false);
    assert.equal(rutaPermitida(robots, '/datos/a.json?v=1'), true);
    assert.equal(rutaPermitida(robots, '/es/es/booking/home'), false);
    assert.equal(rutaPermitida(robots, '/ofertas/?pagina=2'), false);
    assert.equal(rutaPermitida(robots, '/ofertas/'), true);
  });
});

describe('comprobarRobots', () => {
  const crearCtx = (responder) => {
    const peticiones = [];
    const ctx = {
      ahora: AHORA,
      cache: new Cache(),
      http: { texto: async (url) => { peticiones.push(url); return responder(url); } },
    };
    return { ctx, peticiones };
  };

  test('lanza ErrorRobots con las rutas prohibidas y guarda robots.txt un día por web', async () => {
    const { ctx, peticiones } = crearCtx(() => ROBOTS_RYANAIR);
    const urls = ['https://www.ryanair.com/api/farfnd/v4/roundTripFares', 'https://www.ryanair.com/es/es/vuelos-baratos'];
    await assert.rejects(comprobarRobots(ctx, urls), (error) => {
      assert.ok(error instanceof ErrorRobots);
      assert.deepEqual(error.prohibidas, ['https://www.ryanair.com/api/farfnd/v4/roundTripFares']);
      return true;
    });
    assert.deepEqual(peticiones, ['https://www.ryanair.com/robots.txt']);
    assert.equal(ctx.cache.obtener('robots:https://www.ryanair.com'), ROBOTS_RYANAIR);
  });

  test('sin robots.txt (404) se permite todo', async () => {
    const { ctx } = crearCtx((url) => { throw new ErrorHttp(404, url); });
    await comprobarRobots(ctx, ['https://ejemplo.es/feed/']);
    assert.equal(ctx.cache.obtener('robots:https://ejemplo.es'), '');
  });

  test('si robots.txt no se puede leer (5xx), no se consulta la web', async () => {
    const { ctx } = crearCtx((url) => { throw new ErrorHttp(503, url); });
    await assert.rejects(comprobarRobots(ctx, ['https://ejemplo.es/feed/']), /HTTP 503/);
  });
});
