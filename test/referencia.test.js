import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MINIMO_GRUPO, calcularReferencia, mediana } from '../src/enriquecer/referencia.js';
import { oferta } from './ayudas.js';

const GIRONA = { nombre: 'Girona', region: 'Girona', pais: 'España' };

/** Escapada con precio por persona y noche conocido. */
const noche = (precio, campos = {}) =>
  oferta({ tipo: 'escapada', temas: ['spa'], lugar: GIRONA, precio, unidad: 'pp/noche', ...campos });

/** `n` precios seguidos: desde, desde + paso… (por defecto, justo los que hacen falta para un grupo). */
const serie = (desde, paso, n = MINIMO_GRUPO) => Array.from({ length: n }, (_, i) => desde + i * paso);

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
  // 40, 50 … 180: mediana 110.
  const ofertas = serie(40, 10).map((precio) => noche(precio));
  calcularReferencia(ofertas);

  it('compara con la mediana del grupo y marca el ahorro', () => {
    const barata = ofertas[0];
    const cara = ofertas.at(-1);
    assert.deepEqual(barata.referencia, { mediana: 110, ahorroPct: 64, grupo: 'escapada:spa:girona', descripcion: 'escapadas de relax y spa en Girona, por persona y noche', n: MINIMO_GRUPO });
    assert.equal(cara.referencia.ahorroPct, -64);
  });

  it('usa el precioNoche ya calculado si lo hay', () => {
    const conPrecioNoche = noche(999, { precioNoche: 20 });
    calcularReferencia([...serie(40, 10, MINIMO_GRUPO - 1).map((precio) => noche(precio)), conPrecioNoche]);
    assert.deepEqual(conPrecioNoche.referencia, { mediana: 100, ahorroPct: 80, grupo: 'escapada:spa:girona', descripcion: 'escapadas de relax y spa en Girona, por persona y noche', n: MINIMO_GRUPO });
  });
});

describe('referencia: grupos pequeños y respaldo por tipo', () => {
  it(`sin ${MINIMO_GRUPO} ofertas parecidas no hay referencia (con 5, la mediana no dice qué es lo normal)`, () => {
    const ofertas = serie(40, 10, MINIMO_GRUPO - 1).map((precio) => noche(precio));
    calcularReferencia(ofertas);
    assert.ok(ofertas.every((o) => o.referencia === null));
  });

  it('cae en el grupo por persona y noche del tipo cuando el preciso se queda corto', () => {
    const ofertas = serie(100, 100).map((precio, i) => noche(precio, { lugar: { nombre: `Pueblo ${i}`, region: `Zona ${i}`, pais: 'España' } }));
    calcularReferencia(ofertas);
    for (const o of ofertas) {
      assert.equal(o.referencia.grupo, 'noche:escapada');
      assert.equal(o.referencia.n, MINIMO_GRUPO);
      assert.equal(o.referencia.mediana, 800);
    }
    assert.equal(ofertas[0].referencia.ahorroPct, 88);
  });

  it('sin precio por noche, el respaldo separa las unidades: un total no se compara con un precio por noche', () => {
    const totales = serie(700, 50).map((precio) => oferta({ tipo: 'paquete', precio, unidad: 'total' }));
    const porNoche = serie(80, 10).map((precio) => oferta({ tipo: 'paquete', precio, unidad: 'noche' }));
    const sinUnidad = serie(30, 10).map((precio) => oferta({ tipo: 'paquete', precio }));
    calcularReferencia([...totales, ...porNoche, ...sinUnidad]);
    assert.deepEqual(totales[0].referencia, { mediana: 1050, ahorroPct: 33, grupo: 'tipo:paquete:total', descripcion: 'paquetes, en total', n: MINIMO_GRUPO });
    assert.equal(sinUnidad[0].referencia.grupo, 'tipo:paquete:sin-unidad');
    assert.ok(porNoche.every((o) => o.referencia.grupo === 'noche:paquete'), 'los que tienen precio por noche se comparan así');
  });

  it('sin precio no hay referencia', () => {
    const ofertas = [...serie(40, 10).map((precio) => noche(precio)), noche(null)];
    calcularReferencia(ofertas);
    assert.equal(ofertas.at(-1).referencia, null);
  });
});

describe('referencia: vuelos por ruta', () => {
  // 30, 35 … 100: mediana 65.
  const ofertas = [...serie(30, 5).map((precio) => vuelo(precio)), vuelo(200, 'MAD')];
  calcularReferencia(ofertas);

  it('agrupa por ruta cuando hay bastantes vuelos', () => {
    assert.deepEqual(ofertas[0].referencia, { mediana: 65, ahorroPct: 54, grupo: 'vuelo:BCN-OPO:i/v', descripcion: 'vuelos BCN–OPO, ida y vuelta', n: MINIMO_GRUPO });
  });

  it('una ruta suelta se compara con todos los vuelos', () => {
    assert.deepEqual(ofertas.at(-1).referencia, { mediana: 67.5, ahorroPct: -196, grupo: 'tipo:vuelo:i/v', descripcion: 'chollos de vuelos, ida y vuelta', n: MINIMO_GRUPO + 1 });
  });

  it('un vuelo de solo ida no se compara con los de ida y vuelta de la misma ruta', () => {
    const ida = [...serie(30, 5).map((precio) => vuelo(precio)), oferta({ tipo: 'vuelo', precio: 20, unidad: null, vuelo: { origen: 'BCN', destino: 'OPO' } })];
    calcularReferencia(ida);
    assert.notEqual(ida.at(-1).referencia?.grupo, 'vuelo:BCN-OPO:i/v');
  });

  it('los vuelos sin datos de ruta no contaminan las escapadas', () => {
    const sinRuta = oferta({ tipo: 'vuelo', precio: 45, unidad: 'i/v' });
    calcularReferencia([sinRuta]);
    assert.equal(sinRuta.referencia, null);
  });
});

describe('referencia: actividades', () => {
  it('no se comparan: una entrada a un museo y un paseo en barco no son parecidos', () => {
    const actividades = [5, 10, 20, 40, 80, 120].map((precio) => oferta({ tipo: 'actividad', precio, unidad: 'pp' }));
    calcularReferencia(actividades);
    assert.ok(actividades.every((o) => o.referencia === null));
  });
});
