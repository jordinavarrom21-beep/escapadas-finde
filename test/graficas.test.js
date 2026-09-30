import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { nivelesCalendario } from '../site/js/vistas-info.js';
import { mediana } from '../site/js/ficha.js';

describe('gráficas: calendario de calor e historial', () => {
  it('con vuelos, el finde más barato es el nivel 4 y el más caro el 1; sin dato, 0', () => {
    const resumen = [60, 30, null, 90, 45].map((precio) => ({ vuelo: precio == null ? null : { precio }, escapadas: 10 }));
    assert.deepEqual(nivelesCalendario(resumen, true), [2, 4, 0, 1, 3]);
  });

  it('sin vuelos, más escapadas es más intenso', () => {
    const resumen = [5, 20, 0, 10].map((escapadas) => ({ vuelo: null, escapadas }));
    assert.deepEqual(nivelesCalendario(resumen, false), [1, 4, 0, 3]);
  });

  it('con un solo dato no hay escala', () => {
    assert.deepEqual(nivelesCalendario([{ vuelo: { precio: 40 } }, { vuelo: null }], true), [0, 0]);
  });

  it('el precio típico es la mediana', () => {
    assert.equal(mediana([30, 10, 20]), 20);
    assert.equal(mediana([10, 20, 30, 100]), 25);
  });
});
