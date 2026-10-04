/**
 * ¿Sigue activa? Con páginas reales de Chollometro (4 oct 2026): un chollo caducado, uno activo
 * y uno que Chollometro fusionó en otro (la página ya es de otro chollo).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COMPROBADORES, VIGENCIA_POR_ESCANEO, comprobarVigencia, pendientesDeVigencia } from '../src/enriquecer/vigencia.js';
import { ErrorHttp } from '../src/util/http.js';
import { AHORA, crearCtx, oferta } from './ayudas.js';

const pagina = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');
const CADUCADO = pagina('chollometro-caducado.html');
const ACTIVO = pagina('chollometro-activo.html');
const REDIRIGIDO = pagina('chollometro-redirigido.html');
const chollo = (id, extra = {}) => oferta({ id: `chollometro:${id}`, fuente: 'chollometro', url: `https://www.chollometro.com/ofertas/x-${id}`, vistaUltima: '2026-09-28T10:00:00Z', ...extra });

describe('vigencia: lo que dice la página de cada oferta', () => {
  test('Chollometro: «isExpired» del chollo de la oferta (no el de otro de la misma página)', () => {
    assert.equal(COMPROBADORES.chollometro(CADUCADO, chollo('2015800')), 'terminada');
    assert.equal(COMPROBADORES.chollometro(ACTIVO, chollo('2020276')), 'activa');
    assert.equal(COMPROBADORES.chollometro(REDIRIGIDO, chollo('2020614')), null, 'fusionado en otro chollo: no se sabe');
    assert.equal(COMPROBADORES.chollometro(ACTIVO, chollo('999')), null, 'otro id: no se sabe');
  });

  test('las terminadas se retiran, las activas cuentan como vistas hoy y se respeta robots.txt con pausas', async () => {
    const paginas = {
      'https://www.chollometro.com/ofertas/x-2015800': CADUCADO,
      'https://www.chollometro.com/ofertas/x-2020276': ACTIVO,
      'https://www.chollometro.com/ofertas/x-2020614': REDIRIGIDO,
      'https://www.chollometro.com/robots.txt': 'User-agent: *\nDisallow: /search\n',
    };
    const { ctx, peticiones, esperas, logs } = crearCtx({ respuestas: (url) => paginas[url] });
    const otra = oferta({ id: 'weekendesk:1', fuente: 'weekendesk', url: 'https://www.weekendesk.es/x' });
    const estado = { ofertas: Object.fromEntries([chollo('2015800'), chollo('2020276'), chollo('2020614'), otra].map((o) => [o.id, o])) };
    const r = await comprobarVigencia(estado, ctx);
    assert.deepEqual(r, { miradas: 3, terminadas: 1, activas: 1 });
    assert.ok(!estado.ofertas['chollometro:2015800'], 'la caducada se retira');
    assert.equal(estado.ofertas['chollometro:2020276'].vistaUltima, AHORA.toISOString(), 'la activa cuenta como vista hoy');
    assert.equal(estado.ofertas['chollometro:2020614'].vistaUltima, '2026-09-28T10:00:00Z', 'la dudosa, igual');
    assert.ok(estado.ofertas['weekendesk:1'], 'las webs sin comprobador no se tocan');
    assert.ok(!peticiones.some((u) => u.includes('weekendesk')));
    assert.ok(peticiones.includes('https://www.chollometro.com/robots.txt'));
    assert.deepEqual(esperas, [1500, 1500], 'una pausa entre página y página');
    assert.match(logs.at(-1), /3 ofertas miradas en su web: 1 terminadas \(retiradas\), 1 siguen activas/);

    // La siguiente vez (en menos de 6 h) no se vuelven a pedir.
    const antes = peticiones.length;
    await comprobarVigencia(estado, ctx);
    assert.equal(peticiones.length, antes);
  });

  test('una página que ya no existe (404) es una oferta terminada; otro fallo, se reintenta luego', async () => {
    const { ctx } = crearCtx({
      respuestas: (url) => {
        if (url.endsWith('robots.txt')) return '';
        if (url.endsWith('-1')) throw new ErrorHttp(404, url);
        throw new ErrorHttp(503, url);
      },
    });
    const estado = { ofertas: { 'chollometro:1': chollo('1'), 'chollometro:2': chollo('2') } };
    const r = await comprobarVigencia(estado, ctx);
    assert.equal(r.terminadas, 1);
    assert.ok(!estado.ofertas['chollometro:1'] && estado.ofertas['chollometro:2']);
  });

  test('pocas por escaneo, primero las que llevan más sin verse', () => {
    const { ctx } = crearCtx();
    const muchas = Array.from({ length: 30 }, (_, i) => chollo(String(i), { vistaUltima: new Date(Date.UTC(2026, 8, 1 + i)).toISOString() }));
    const lista = pendientesDeVigencia(muchas, ctx);
    assert.equal(lista.length, VIGENCIA_POR_ESCANEO);
    assert.equal(lista[0].id, 'chollometro:0', 'la que lleva más sin verse, primero');
  });
});
