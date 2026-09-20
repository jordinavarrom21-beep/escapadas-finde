import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calcularReferencia, mediana } from '../src/enriquecer/referencia.js';
import { oferta } from './ayudas.js';

const GIRONA = { nombre: 'Girona', region: 'Girona', pais: 'España' };

/** Escapada con precio por persona y noche conocido. */
const noche = (precio, campos = {}) =>
  oferta({ tipo: 'escapada', temas: ['spa'], lugar: GIRONA, precio, unidad: 'pp/noche', ...campos });

const vuelo = (precio, destino = 'OPO') =>
  oferta({ tipo: 'vuelo', precio, unidad: 'i/v', vuelo: { origen: 'BCN', destino } });

describe('referencia: mediana', () => {
  it('impares y pares', () => {
    assert.equal(mediana([50, 10, 30]), 30);
    assert.equal(mediana([10, 20, 30, 50]), 25);
  });

  it('no modifica la lista que recibe', () => {
    const valores = [3, 1, 2];
    mediana(valores);
    assert.deepEqual(valores, [3, 1, 2]);
  });
});

describe('referencia: escapadas por tema y zona', () => {
  const ofertas = [40, 50, 60, 70, 100].map((precio) => noche(precio));
  calcularReferencia(ofertas);

  it('compara con la mediana del grupo y marca el ahorro', () => {
    const [barata, , , , cara] = ofertas;
    assert.deepEqual(barata.referencia, { mediana: 60, ahorroPct: 33, grupo: 'escapada:spa:girona', n: 5 });
    assert.equal(cara.referencia.ahorroPct, -67);
  });

  it('usa el precioNoche ya calculado si lo hay', () => {
    const conPrecioNoche = noche(999, { precioNoche: 20 });
    calcularReferencia([...[40, 50, 60, 70].map((precio) => noche(precio)), conPrecioNoche]);
    assert.deepEqual(conPrecioNoche.referencia, { mediana: 50, ahorroPct: 60, grupo: 'escapada:spa:girona', n: 5 });
  });
});

describe('referencia: grupos pequeños y respaldo por tipo', () => {
  it('sin cinco ofertas parecidas no hay referencia', () => {
    const ofertas = [40, 50, 60].map((precio) => noche(precio));
    calcularReferencia(ofertas);
    assert.deepEqual(ofertas.map((o) => o.referencia), [null, null, null]);
  });

  it('cae en el grupo por tipo cuando el preciso se queda corto', () => {
    const zonas = ['Girona', 'Lugo', 'Huesca', 'Cádiz', 'Teruel'];
    const ofertas = zonas.map((region, i) => noche(100 + i * 100, { lugar: { nombre: region, region, pais: 'España' } }));
    calcularReferencia(ofertas);
    for (const o of ofertas) {
      assert.equal(o.referencia.grupo, 'tipo:escapada');
      assert.equal(o.referencia.n, 5);
      assert.equal(o.referencia.mediana, 300);
    }
    assert.equal(ofertas[0].referencia.ahorroPct, 67);
  });

  it('sin precio no hay referencia', () => {
    const ofertas = [...[40, 50, 60, 70, 100].map((precio) => noche(precio)), noche(null)];
    calcularReferencia(ofertas);
    assert.equal(ofertas.at(-1).referencia, null);
  });
});

describe('referencia: vuelos por ruta', () => {
  const ofertas = [...[30, 40, 50, 60, 100].map((precio) => vuelo(precio)), vuelo(200, 'MAD')];
  calcularReferencia(ofertas);

  it('agrupa por ruta cuando hay bastantes vuelos', () => {
    assert.deepEqual(ofertas[0].referencia, { mediana: 50, ahorroPct: 40, grupo: 'vuelo:BCN-OPO', n: 5 });
  });

  it('una ruta suelta se compara con todos los vuelos', () => {
    assert.deepEqual(ofertas.at(-1).referencia, { mediana: 55, ahorroPct: -264, grupo: 'tipo:vuelo', n: 6 });
  });

  it('los vuelos sin datos de ruta no contaminan las escapadas', () => {
    const sinRuta = oferta({ tipo: 'vuelo', precio: 45, unidad: 'i/v' });
    calcularReferencia([sinRuta]);
    assert.equal(sinRuta.referencia, null);
  });
});
