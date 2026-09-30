import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { fuentesConProblemas, informe } from '../scripts/salud-fuentes.js';

const AHORA = new Date('2026-10-05T06:00:00Z');
const estado = {
  fuentes: {
    ok: { estado: 'ok' },
    reciente: { estado: 'error', error: 'HTTP 403', desdeError: '2026-10-05T01:00:00Z' },
    vieja: { estado: 'error', error: 'HTTP 403 en web.es', desdeError: '2026-10-02T10:00:00Z', ultimoOk: '2026-10-02T09:45:00Z' },
    cambiada: { estado: 'ok', aviso: 'Falta el precio en casi todas', desdeAviso: '2026-10-03T10:00:00Z' },
    apagada: { estado: 'desactivada', motivo: 'robots.txt' },
  },
};

describe('salud semanal de las fuentes', () => {
  it('solo las que llevan más de 24 h con error o aviso (las desactivadas no cuentan)', () => {
    assert.deepEqual(fuentesConProblemas(estado, { ahora: AHORA }).map((p) => [p.id, p.tipo]), [['vieja', 'error'], ['cambiada', 'aviso']]);
  });

  it('el informe es una tabla con qué hacer', () => {
    const texto = informe(fuentesConProblemas(estado, { ahora: AHORA }), 24);
    assert.match(texto, /\| `vieja` \| 🔴 Falla \| HTTP 403 en web\.es \|/);
    assert.match(texto, /Qué hacer/);
  });
});
