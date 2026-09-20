import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_PARALELO_POR_DEFECTO, dominioDe, ejecutarFuentes } from '../src/core/source-runner.js';

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Fuente de mentira: al orquestador de la cola solo le importan `modo`, `urls` y `web`. */
const fuente = (id, url = `https://${id}.es/feed`, extra = {}) => ({ id, nombre: id, modo: 'feed', urls: [url], ...extra });

/**
 * Ejecutor que anota cuántas fuentes hay a la vez, en total y por dominio, y en qué
 * orden terminan. `trabajo` decide qué hace cada fuente (por defecto, tardar 5 ms).
 */
function vigilante(trabajo = () => esperar(5)) {
  const activas = new Map();
  const picos = new Map();
  const terminadas = [];
  const anotar = (clave, delta) => {
    const n = (activas.get(clave) ?? 0) + delta;
    activas.set(clave, n);
    picos.set(clave, Math.max(picos.get(clave) ?? 0, n));
  };
  const ejecutar = async (f) => {
    const dominio = dominioDe(f) ?? 'sin-dominio';
    anotar('total', 1);
    anotar(dominio, 1);
    try {
      return await trabajo(f);
    } finally {
      anotar('total', -1);
      anotar(dominio, -1);
      terminadas.push(f.id);
    }
  };
  return { ejecutar, picos, terminadas };
}

describe('dominioDe', () => {
  test('sale de la primera url y, si no hay, de la web', () => {
    assert.equal(dominioDe(fuente('atrapalo', 'https://www.atrapalo.com/viajes?pag=2')), 'www.atrapalo.com');
    assert.equal(dominioDe({ modo: 'html', urls: [], web: 'https://www.volotea.com/es' }), 'www.volotea.com');
  });

  test('el buzón y las fuentes sin urls válidas no tienen dominio', () => {
    assert.equal(dominioDe({ modo: 'buzon', urls: [], web: 'https://mail.google.com' }), null);
    assert.equal(dominioDe({ modo: 'html' }), null);
    assert.equal(dominioDe({ modo: 'html', urls: ['/ruta-relativa'] }), null);
  });
});

describe('ejecutarFuentes', () => {
  test('nunca hay más fuentes a la vez de las permitidas', async () => {
    const fuentes = Array.from({ length: 9 }, (_, i) => fuente(`f${i}`));
    const { ejecutar, picos } = vigilante();
    const resultados = await ejecutarFuentes(fuentes, { ejecutar, maxParalelo: 3 });
    assert.equal(picos.get('total'), 3);
    assert.equal(resultados.length, 9);
    assert.ok(resultados.every((r) => r.error === null));
  });

  test('sin ajuste (o con uno absurdo) usa el máximo por defecto', async () => {
    const fuentes = Array.from({ length: 8 }, (_, i) => fuente(`f${i}`));
    const sinAjuste = vigilante();
    await ejecutarFuentes(fuentes, { ejecutar: sinAjuste.ejecutar });
    assert.equal(sinAjuste.picos.get('total'), MAX_PARALELO_POR_DEFECTO);
    const absurdo = vigilante();
    await ejecutarFuentes(fuentes, { ejecutar: absurdo.ejecutar, maxParalelo: 0 });
    assert.equal(absurdo.picos.get('total'), MAX_PARALELO_POR_DEFECTO);
  });

  test('dos fuentes de la misma web nunca se solapan', async () => {
    const mismaWeb = ['a', 'b', 'c'].map((p) => fuente(`viajes-${p}`, `https://viajes.es/${p}`));
    const otras = ['x', 'y'].map((id) => fuente(id));
    const { ejecutar, picos } = vigilante();
    await ejecutarFuentes([...mismaWeb, ...otras], { ejecutar, maxParalelo: 4 });
    assert.equal(picos.get('viajes.es'), 1);
    assert.equal(picos.get('total'), 3, 'las de otras webs sí siguen en paralelo');
  });

  test('las fuentes sin dominio (buzón) no se bloquean entre sí', async () => {
    const buzones = [1, 2, 3].map((n) => ({ id: `buzon${n}`, modo: 'buzon', urls: [], web: 'https://mail.google.com' }));
    const { ejecutar, picos } = vigilante();
    await ejecutarFuentes(buzones, { ejecutar, maxParalelo: 3 });
    assert.equal(picos.get('sin-dominio'), 3);
  });

  test('una fuente que falla no bloquea a las demás ni a su dominio', async () => {
    const rota = fuente('rota', 'https://rota.es/uno');
    const hermana = fuente('hermana', 'https://rota.es/dos');
    const sana = fuente('sana');
    const ejecutar = async (f) => {
      if (f.id === 'rota') throw new Error('HTTP 500 en rota.es');
      await esperar(1);
      return f.id;
    };
    const resultados = await ejecutarFuentes([rota, hermana, sana], { ejecutar, maxParalelo: 2 });
    assert.equal(resultados[0].error.message, 'HTTP 500 en rota.es');
    assert.equal(resultados[0].valor, null);
    assert.deepEqual(resultados.slice(1).map((r) => r.valor), ['hermana', 'sana']);
  });

  test('el orden de los resultados es el de las fuentes, aunque acaben al revés', async () => {
    const demoras = { lenta: 20, media: 10, rapida: 1 };
    const { ejecutar, terminadas } = vigilante((f) => esperar(demoras[f.id]).then(() => f.id));
    const fuentes = ['lenta', 'media', 'rapida'].map((id) => fuente(id));
    const resultados = await ejecutarFuentes(fuentes, { ejecutar, maxParalelo: 3 });
    assert.deepEqual(terminadas, ['rapida', 'media', 'lenta']);
    assert.deepEqual(resultados.map((r) => r.fuente.id), ['lenta', 'media', 'rapida']);
    assert.deepEqual(resultados.map((r) => r.valor), ['lenta', 'media', 'rapida']);
  });

  test('sin fuentes no ejecuta nada', async () => {
    assert.deepEqual(await ejecutarFuentes([], { ejecutar: () => assert.fail('no debería ejecutarse') }), []);
  });
});
