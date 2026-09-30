import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { instrucciones } from '../scripts/empaquetar.js';

describe('zip para Hostinger', () => {
  it('las instrucciones dicen dónde subirlo y avisan de que los datos no se actualizan solos', () => {
    const texto = instrucciones({ base: 'https://midominio.es/', generado: '2026-10-01T10:00:00Z' });
    assert.match(texto, /public_html/);
    assert.match(texto, /SSL/);
    assert.match(texto, /no se actualizan solos/);
    assert.match(texto, /preparada para https:\/\/midominio\.es\//);
    assert.match(instrucciones({ base: null, generado: 'x' }), /vale para cualquier dominio/);
  });
});
