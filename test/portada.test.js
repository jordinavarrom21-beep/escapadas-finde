import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { estadoWebs } from '../site/js/vistas.js';

const AHORA = new Date('2026-10-01T12:00:00Z');
const ok = (id) => ({ id, nombre: id, estado: 'ok' });

describe('portada: el estado de las webs, una sola frase', () => {
  test('todas bien', () => {
    assert.deepEqual(estadoWebs([ok('a'), ok('b')], AHORA), { texto: 'Las 2 webs funcionan', problemas: [], error: false });
  });

  test('un fallo reciente se reintenta: no se dice que hay problemas', () => {
    const r = estadoWebs([ok('a'), { id: 'b', nombre: 'B', estado: 'error', desdeError: '2026-10-01T11:00:00Z' }], AHORA);
    assert.equal(r.texto, '1 de 2 webs al día · 1 reintentando');
    assert.equal(r.error, false);
  });

  test('horas fallando o leyendo menos de lo normal: con problemas (y el pie dice lo mismo)', () => {
    const r = estadoWebs([
      ok('a'), { ...ok('b'), aviso: 'Lee la mitad de lo normal' },
      { id: 'c', nombre: 'C', estado: 'error', desdeError: '2026-09-30T08:00:00Z' },
    ], AHORA);
    assert.equal(r.texto, '2 de 3 webs con problemas');
    assert.equal(r.error, true);
    assert.deepEqual(r.problemas.map((f) => f.id), ['b', 'c']);
  });
});
