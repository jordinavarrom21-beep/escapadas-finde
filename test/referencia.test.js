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

  it('cae en el grupo por persona y noche del tipo cuando el preciso se queda corto', () => {
    const zonas = ['Girona', 'Lugo', 'Huesca', 'Cádiz', 'Teruel'];
    const ofertas = zonas.map((region, i) => noche(100 + i * 100, { lugar: { nombre: region, region, pais: 'España' } }));
    calcularReferencia(ofertas);
    for (const o of ofertas) {
      assert.equal(o.referencia.grupo, 'noche:escapada');
      assert.equal(o.referencia.n, 5);
      assert.equal(o.referencia.mediana, 300);
    }
    assert.equal(ofertas[0].referencia.ahorroPct, 67);
  });

  it('sin precio por noche, el respaldo separa las unidades: un total no se compara con un precio por noche', () => {
    const totales = [700, 800, 900, 1000, 1100].map((precio) => oferta({ tipo: 'paquete', precio, unidad: 'total' }));
    const porNoche = [80, 90, 100, 110, 120].map((precio) => oferta({ tipo: 'paquete', precio, unidad: 'noche' }));
    const sinUnidad = [30, 40, 50, 60, 70].map((precio) => oferta({ tipo: 'paquete', precio }));
    calcularReferencia([...totales, ...porNoche, ...sinUnidad]);
    assert.deepEqual(totales[0].referencia, { mediana: 900, ahorroPct: 22, grupo: 'tipo:paquete:total', n: 5 });
    assert.equal(sinUnidad[0].referencia.grupo, 'tipo:paquete:sin-unidad');
    assert.ok(porNoche.every((o) => o.referencia.grupo === 'noche:paquete'), 'los que tienen precio por noche se comparan así');
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
    assert.deepEqual(ofertas[0].referencia, { mediana: 50, ahorroPct: 40, grupo: 'vuelo:BCN-OPO:i/v', n: 5 });
  });

  it('una ruta suelta se compara con todos los vuelos', () => {
    assert.deepEqual(ofertas.at(-1).referencia, { mediana: 55, ahorroPct: -264, grupo: 'tipo:vuelo:i/v', n: 6 });
  });

  it('un vuelo de solo ida no se compara con los de ida y vuelta de la misma ruta', () => {
    const ida = [...[30, 40, 50, 60, 100].map((precio) => vuelo(precio)), oferta({ tipo: 'vuelo', precio: 20, unidad: null, vuelo: { origen: 'BCN', destino: 'OPO' } })];
    calcularReferencia(ida);
    assert.notEqual(ida.at(-1).referencia?.grupo, 'vuelo:BCN-OPO:i/v');
  });

  it('los vuelos sin datos de ruta no contaminan las escapadas', () => {
    const sinRuta = oferta({ tipo: 'vuelo', precio: 45, unidad: 'i/v' });
    calcularReferencia([sinRuta]);
    assert.equal(sinRuta.referencia, null);
  });
});
