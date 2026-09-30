import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { puntuar } from '../src/enriquecer/puntuacion.js';
import { motivoPrincipal, motivosNota } from '../site/js/nota.js';
import { textoPrecioLitro } from '../site/js/plantillas.js';
import { AJUSTES, oferta } from './ayudas.js';

const AHORA = new Date('2026-10-01T10:00:00Z');

describe('nota del chollo explicada con los datos de cada oferta', () => {
  const ofertas = [10, 20, 30, 40, 50].map((precio, i) => oferta({ tipo: 'escapada', precio, unidad: 'pp/noche', vistaPrimera: '2026-09-01T00:00:00Z', ...(i === 0 ? { minimoHistorico: true, valoracion: { nota: 9.4, n: 120 } } : {}) }));
  puntuar(ofertas, AJUSTES, { ahora: AHORA });
  const [barata, , , , cara] = ofertas;

  it('el escaneo guarda los puntos de cada parte y con cuántas se compara el precio', () => {
    assert.deepEqual(barata.notaDetalle.comparacion, { grupo: 'noche', parecidas: 4, masCaras: 4 });
    assert.equal(barata.notaDetalle.partes.precio, 45);
    assert.equal(barata.notaDetalle.partes.bajada, 15);
    const suma = Object.values(barata.notaDetalle.partes).reduce((s, p) => s + p, 0);
    assert.ok(Math.abs(suma - barata.puntuacion) <= 1, 'las partes suman la nota');
    assert.equal(cara.notaDetalle.partes.precio, undefined, 'lo que no suma no se guarda');
  });

  it('frases propias: precio frente a las parecidas, bajada y opiniones', () => {
    const motivos = motivosNota(barata, AHORA);
    assert.deepEqual(motivos.map((m) => m.clave), ['precio', 'bajada', 'opiniones']);
    assert.equal(motivos[0].texto, 'Más barata que el 100 % de 4 escapadas parecidas');
    assert.equal(motivos[1].texto, 'Es el precio más bajo que se ha visto');
    assert.match(motivos[2].texto, /Los clientes le dan un 9,4 \(120 opiniones\)/);
    assert.equal(motivoPrincipal(barata, AHORA), 'Más barata que el 100 % de 4 escapadas parecidas · es el precio más bajo que se ha visto');
  });

  it('la cara también se explica: el precio sale aunque no sume', () => {
    const [precio] = motivosNota(cara, AHORA);
    assert.deepEqual([precio.clave, precio.puntos, precio.texto], ['precio', 0, 'Precio normal: 4 de 4 escapadas parecidas son más baratas']);
    assert.equal(motivoPrincipal(cara, AHORA), 'Precio normal: 4 de 4 escapadas parecidas son más baratas');
  });

  it('sin desglose (datos antiguos) no se inventa nada', () => {
    assert.deepEqual(motivosNota({ puntuacion: 50 }), []);
    assert.equal(motivoPrincipal({ puntuacion: 50 }), null);
  });

  it('el precio del litro dice de dónde sale', () => {
    assert.match(textoPrecioLitro({ precioLitro: 1.916, carburante: 'gasolina95', consumoL100km: 6.5, precioMedio: { provincia: 'Barcelona' } }), /1,92\s€\/l es el precio medio de hoy de la gasolina 95 en las gasolineras de Barcelona/);
    assert.match(textoPrecioLitro({ precioLitro: 1.55, carburante: 'gasoleo', consumoL100km: 6.5, precioMedio: null }), /1,55\s€\/l es un precio de referencia del diésel: hoy no se ha podido consultar/);
  });
});
