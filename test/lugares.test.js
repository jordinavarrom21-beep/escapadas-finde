import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { completarOferta, crearOferta } from '../src/modelo.js';
import { nombreOficial } from '../src/util/lugares.js';

describe('lugares: un solo nombre por localidad', () => {
  it('cambia los exónimos que salen en los datos reales por el nombre oficial', () => {
    assert.equal(nombreOficial('Gerona'), 'Girona');
    assert.equal(nombreOficial('ROSAS'), 'Roses');
    assert.equal(nombreOficial('Llansá'), 'Llançà');
    assert.equal(nombreOficial('La  Escala'), "L'Escala");
    assert.equal(nombreOficial('Vilaseca'), 'Vila-seca');
  });

  it('deja igual lo que no conoce o ya es oficial', () => {
    for (const nombre of ['Girona', 'Tossa de Mar', 'Villanueva de Bogas', 'Roma', '']) assert.equal(nombreOficial(nombre), nombre);
    assert.equal(nombreOficial(null), null);
  });

  it('crearOferta lo aplica a todas las fuentes, y completarOferta a las ya guardadas', () => {
    const lugar = { nombre: 'Gerona', region: 'Girona', pais: 'España', codigoPais: 'ES', lat: null, lon: null };
    const nueva = crearOferta({ id: 'x:1', fuente: 'x', titulo: 'Casa', url: 'https://x.es', lugar });
    assert.equal(nueva.lugar.nombre, 'Girona');
    assert.equal(lugar.nombre, 'Gerona', 'no modifica el objeto de entrada');
    assert.equal(completarOferta({ id: 'x:2', lugar }).lugar.nombre, 'Girona');
    assert.equal(completarOferta({ id: 'x:3' }).lugar, null);
  });
});
