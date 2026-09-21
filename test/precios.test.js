import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ETIQUETA_DUDOSO, precioDudoso, revisarPrecios } from '../src/enriquecer/precios.js';
import { oferta } from './ayudas.js';

describe('precios no creíbles', () => {
  test('acepta los precios normales de cada tipo', () => {
    for (const buena of [
      oferta({ tipo: 'hotel', precio: 65, unidad: 'noche', precioNoche: 32.5 }),
      oferta({ tipo: 'escapada', precio: 43, unidad: 'pp', noches: 2, precioNoche: 21.5 }),
      oferta({ tipo: 'vuelo', precio: 25, unidad: 'i/v' }),
      oferta({ tipo: 'actividad', precio: 0 }),
      oferta({ tipo: 'actividad', precio: 2.5 }),
      oferta({ tipo: 'escapada', transporte: 'bus', precio: 6.99 }),
      oferta({ tipo: 'escapada', transporte: 'tren', precio: 9 }),
    ]) assert.equal(precioDudoso(buena), null, buena.tipo);
  });

  test('descarta los que no pueden ser', () => {
    assert.match(precioDudoso(oferta({ tipo: 'hotel', precio: 2, unidad: 'noche' })), /demasiado poco/);
    assert.match(precioDudoso(oferta({ tipo: 'escapada', precio: 37, unidad: 'pp', noches: 14, precioNoche: 2.6 })), /por persona y noche/);
    // crearOferta ya rechaza un precio negativo; aquí se simula un estado viejo cargado de disco.
    assert.match(precioDudoso({ ...oferta({ tipo: 'vuelo' }), precio: -5 }), /negativo/);
    assert.equal(precioDudoso(oferta({ tipo: 'hotel', precio: null })), null, 'sin precio no hay nada que revisar');
    assert.match(precioDudoso(oferta({ tipo: 'escapada', transporte: 'bus', precio: 0.2 })), /demasiado poco para un billete/);
  });

  test('revisarPrecios deja la oferta sin precio, sin chollazo y marcada', () => {
    const avisos = [];
    const mala = oferta({ tipo: 'hotel', precio: 2, unidad: 'noche', precioNoche: 1, chollazo: true, titulo: 'Xalet de Prades' });
    const buena = oferta({ tipo: 'hotel', precio: 80, unidad: 'noche', precioNoche: 40, chollazo: true });
    assert.equal(revisarPrecios([mala, buena], (m) => avisos.push(m)), 1);
    assert.equal(mala.precio, null);
    assert.equal(mala.precioNoche, null);
    assert.equal(mala.chollazo, false);
    assert.ok(mala.etiquetas.includes(ETIQUETA_DUDOSO));
    assert.equal(mala.precioTexto !== undefined, true, 'el texto original se conserva');
    assert.match(avisos[0], /Xalet de Prades/);
    assert.equal(buena.precio, 80, 'la buena no se toca');
  });

  test('no marca dos veces la misma oferta', () => {
    const mala = oferta({ tipo: 'hotel', precio: 1, unidad: 'noche' });
    revisarPrecios([mala]);
    revisarPrecios([mala]);
    assert.deepEqual(mala.etiquetas.filter((e) => e === ETIQUETA_DUDOSO), [ETIQUETA_DUDOSO]);
  });
});
