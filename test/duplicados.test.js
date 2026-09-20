import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { marcarEquivalentes, nombreAlojamiento } from '../src/enriquecer/duplicados.js';
import { oferta } from './ayudas.js';

const BESALU = { nombre: 'Besalú', region: 'Girona', pais: 'España' };

const casa = (campos) => oferta({ tipo: 'hotel', unidad: 'noche', lugar: BESALU, ...campos });

describe('duplicados: nombre del alojamiento', () => {
  it('quita tildes, categoría y estrellas', () => {
    assert.equal(nombreAlojamiento(casa({ titulo: 'Hotel Mas Bassó' })), 'mas basso');
    assert.equal(nombreAlojamiento(casa({ titulo: 'Mas Bassó 4*' })), 'mas basso');
    assert.equal(nombreAlojamiento(casa({ titulo: 'Mas Bassó 4 estrellas & Spa' })), 'mas basso');
  });

  it('quita el lugar del final del título y se queda con el alojamiento de Nomolesten', () => {
    assert.equal(nombreAlojamiento(casa({ titulo: 'Mas Bassó en Besalú' })), 'mas basso');
    assert.equal(nombreAlojamiento(casa({ titulo: 'Escapada con cena · Hotel Mas Bassó' })), 'mas basso');
  });

  it('descarta los títulos que describen la oferta y no el alojamiento', () => {
    assert.equal(nombreAlojamiento(casa({ titulo: 'Chalet para 10 personas en Besalú' })), null);
    assert.equal(nombreAlojamiento(casa({ titulo: 'Escapada romántica con spa' })), null);
    assert.equal(nombreAlojamiento(casa({ titulo: '2 noches con desayuno' })), null);
    assert.equal(nombreAlojamiento(casa({ titulo: 'Hotel' })), null);
  });
});

describe('duplicados: marcarEquivalentes', () => {
  it('deja la lista a la más barata y etiqueta las demás', () => {
    const cara = casa({ fuente: 'nomolesten', titulo: 'Hotel Mas Bassó', precio: 120, url: 'https://nomolesten.com/a' });
    const barata = casa({ fuente: 'weekendesk', titulo: 'Mas Bassó 4*', precio: 100, url: 'https://www.weekendesk.es/b' });
    marcarEquivalentes([cara, barata]);

    assert.deepEqual(barata.equivalentes, [{ fuente: 'nomolesten', precio: 120, unidad: 'noche', url: 'https://nomolesten.com/a' }]);
    assert.deepEqual(barata.etiquetas, []);
    assert.deepEqual(cara.equivalentes, [{ fuente: 'weekendesk', precio: 100, unidad: 'noche', url: 'https://www.weekendesk.es/b' }]);
    assert.deepEqual(cara.etiquetas, ['duplicada']);
  });

  it('compara por precio por persona y noche, no por precio a secas', () => {
    const dosNoches = casa({ fuente: 'atrapalo', titulo: 'Mas Bassó', precio: 180, unidad: 'total', noches: 2 });
    const unaNoche = casa({ fuente: 'weekendesk', titulo: 'Hotel Mas Bassó', precio: 100 });
    marcarEquivalentes([unaNoche, dosNoches]);

    assert.deepEqual(dosNoches.etiquetas, [], '45 €/persona y noche frente a 50: es la barata');
    assert.deepEqual(unaNoche.etiquetas, ['duplicada']);
  });

  it('no agrupa si cambia la localidad, si el título es genérico o si es la misma web', () => {
    const otraLocalidad = [
      casa({ fuente: 'nomolesten', titulo: 'Hotel Mas Bassó', precio: 120 }),
      casa({ fuente: 'weekendesk', titulo: 'Mas Bassó', precio: 100, lugar: { nombre: 'Olot', region: 'Girona', pais: 'España' } }),
    ];
    const genericas = [
      casa({ fuente: 'clubrural', titulo: 'Chalet para 10 personas en Besalú', precio: 120 }),
      casa({ fuente: 'escapadarural', titulo: 'Chalet para 10 personas en Besalú', precio: 100 }),
    ];
    const mismaWeb = [
      casa({ fuente: 'rusticae', titulo: 'Hotel Mas Bassó', precio: 120 }),
      casa({ fuente: 'rusticae', titulo: 'Mas Bassó', precio: 100 }),
    ];
    for (const pareja of [otraLocalidad, genericas, mismaWeb]) {
      marcarEquivalentes(pareja);
      for (const o of pareja) {
        assert.deepEqual(o.equivalentes, [], `${o.fuente}: ${o.titulo}`);
        assert.deepEqual(o.etiquetas, [], `${o.fuente}: ${o.titulo}`);
      }
    }
  });

  it('reparte bien los grupos de tres y es idempotente', () => {
    const ofertas = [
      casa({ fuente: 'nomolesten', titulo: 'Hotel Mas Bassó', precio: 120 }),
      casa({ fuente: 'atrapalo', titulo: 'Mas Bassó Spa', precio: 90 }),
      casa({ fuente: 'weekendesk', titulo: 'Mas Bassó 4*', precio: 100 }),
    ];
    marcarEquivalentes(ofertas);
    marcarEquivalentes(ofertas);

    const [nomolesten, barata, weekendesk] = ofertas;
    assert.deepEqual(barata.equivalentes.map((e) => e.precio), [100, 120]);
    assert.deepEqual(barata.etiquetas, []);
    for (const o of [nomolesten, weekendesk]) {
      assert.deepEqual(o.etiquetas, ['duplicada'], o.fuente);
      assert.deepEqual(o.equivalentes.map((e) => e.fuente), ['atrapalo']);
    }
  });

  it('las ofertas sin pareja se quedan sin equivalentes', () => {
    const sola = casa({ fuente: 'nomolesten', titulo: 'Hotel Mas Bassó', precio: 120, etiquetas: ['duplicada', 'Spa'] });
    marcarEquivalentes([sola]);
    assert.deepEqual(sola.equivalentes, []);
    assert.deepEqual(sola.etiquetas, ['Spa'], 'la etiqueta de una ejecución anterior se retira');
  });
});
