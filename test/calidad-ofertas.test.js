/**
 * Calidad de lo que enseña cada tarjeta: atributos coherentes con el tipo de oferta
 * (una de bus no habla de gasolina), fechas de viaje separadas de la caducidad,
 * cuándo se comprobó cada dato y etiquetas con un cálculo que se puede explicar.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { crearOferta } from '../src/modelo.js';
import { medirDistancias } from '../site/js/filtros.js';
import { contenidoFicha, tarjeta } from '../site/js/plantillas.js';

const ORIGEN = { nombre: 'Barcelona', lat: 41.3874, lon: 2.1686 };
const TOULOUSE = { nombre: 'Toulouse', pais: 'Francia', lat: 43.6045, lon: 1.444 };

let n = 0;
const oferta = (campos = {}) => crearOferta({
  id: `prueba:${++n}`, fuente: 'prueba', titulo: `Oferta ${n}`, url: 'https://ejemplo.es/oferta', ...campos,
});

function ctxPara(ofertas, extra = {}) {
  return {
    temas: new Map(), fuentes: new Map([['prueba', 'Prueba']]), favoritos: new Set(), historial: {},
    distancias: medirDistancias(ofertas, null, ORIGEN), desde: ORIGEN.nombre, viajeros: 2, ...extra,
  };
}

describe('calidad: el transporte de la oferta manda', () => {
  const comun = { lugar: TOULOUSE, cocheMin: 256, cocheKm: 390, precio: 25.49, unidad: 'pp' };
  const bus = oferta({ ...comun, titulo: 'Bus Barcelona – Toulouse', transporte: 'bus', costeCoche: { eur: 98.3, litros: 51.4 } });
  const coche = oferta({ ...comun, titulo: 'Casa rural en Toulouse', transporte: null, costeCoche: { eur: 98.3, litros: 51.4 } });

  it('una oferta de bus no enseña tiempo ni gasolina de coche en la tarjeta', () => {
    const html = tarjeta(bus, ctxPara([bus]));
    assert.ok(!html.includes('🚗'), 'sin tiempo en coche');
    assert.ok(!html.includes('⛽'), 'sin coste de gasolina');
    assert.match(html, /📍 \d+ km/, 'la distancia sí, en línea recta');
  });

  it('en la ficha, el coche solo aparece como comparación explícita y sin gasolina', () => {
    const html = contenidoFicha(bus, ctxPara([bus]));
    assert.match(html, /Esta oferta va en autobús/);
    assert.match(html, /Para comparar: en coche serían 4 h 16 min/);
    assert.ok(!html.includes('⛽'));
  });

  it('a lo que se va en coche le siguen saliendo el tiempo y la gasolina', () => {
    const html = tarjeta(coche, ctxPara([coche]));
    assert.match(html, /🚗 4 h 16 min/);
    assert.match(html, /⛽ ≈ 98\s€ de gasolina ida y vuelta · estimado/);
  });
});
