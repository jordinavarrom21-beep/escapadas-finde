/**
 * Un test por cada fallo que encontró la auditoría en los enriquecedores.
 * Todos fallan sin su arreglo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { asignarFechas } from '../src/enriquecer/festivos.js';
import { calcularCoche } from '../src/enriquecer/geo.js';
import { puntuar } from '../src/enriquecer/puntuacion.js';
import { clasificar } from '../src/enriquecer/temas.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, AJUSTES, crearCtx, oferta } from './ayudas.js';

const escapada = (campos) => ({ tipo: 'escapada', titulo: '', descripcion: '', etiquetas: [], temas: [], lugar: null, ...campos });

describe('auditoría: noches', () => {
  test('una actividad sin alojamiento no tiene noches: «2 días de forfait» no es 1 noche', () => {
    assert.equal(clasificar(escapada({ tipo: 'actividad', titulo: 'Grandvalira: Forfait + Alquiler de material, 2 días de forfait' })).noches, null);
    assert.equal(clasificar(escapada({ tipo: 'actividad', alojamiento: 'hotel', titulo: 'Esquí con hotel, 3 noches' })).noches, 3);
  });

  test('no las saca de las etiquetas de categoría (que traen varios rangos a la vez)', () => {
    assert.equal(clasificar(escapada({ titulo: 'Hotel en Lloret', etiquetas: ['Escapada de 3 a 6 noches', 'Escapada 1-2 noches'] })).noches, null);
  });

  test('un rango no es un número de noches, y «5 días a la semana» es una frecuencia', () => {
    assert.equal(clasificar(escapada({ titulo: 'Casa rural de 2 a 4 noches' })).noches, null);
    assert.equal(clasificar(escapada({ titulo: 'Ferry a Ibiza', descripcion: 'Travesía directa, 5 días a la semana.' })).noches, null);
    assert.equal(clasificar(escapada({ titulo: 'Escapada de 2 noches en Sitges' })).noches, 2);
    assert.equal(clasificar(escapada({ titulo: 'Viaje de 5 días a Londres' })).noches, 4);
  });
});

describe('auditoría: temas sin falsos positivos', () => {
  const temas = (campos) => clasificar(escapada(campos)).temas;

  test('«Sagrada Familia» no es un plan en familia', () => {
    assert.deepEqual(temas({ titulo: 'Visita guiada a la Sagrada Familia' }), []);
    assert.deepEqual(temas({ titulo: 'Escapada en familia al Pirineo' }), ['rural', 'familia']);
  });

  test('lo que se niega no cuenta, y «solo adultos» no es con niños', () => {
    assert.deepEqual(temas({ titulo: 'Hotel boutique', descripcion: 'No se admiten niños ni mascotas.' }), []);
    assert.deepEqual(temas({ titulo: 'Hotel adults only con parque acuático' }), ['romantico']);
    assert.deepEqual(temas({ titulo: 'Hotel que admite mascotas' }), ['mascotas']);
  });

  test('«Isla Mágica» es un parque (no una isla) y Sevilla se puede ir en coche', () => {
    const c = clasificar(escapada({ titulo: 'Entradas a Isla Mágica', lugar: { nombre: 'Sevilla', pais: 'España' } }));
    assert.deepEqual(c.temas, ['parques']);
    assert.equal(c.transporte, 'coche');
    assert.deepEqual(temas({ titulo: 'Escapada a una isla desierta' }), ['playa']);
  });

  test('«árboles centenarios» o «a los pies del castillo» no son alojamientos singulares', () => {
    assert.deepEqual(temas({ titulo: 'Hotel a los pies del castillo', descripcion: 'Jardín con árboles centenarios.' }), []);
    assert.deepEqual(temas({ titulo: 'Noche en una cabaña en el árbol' }), ['singular']);
    assert.deepEqual(temas({ titulo: 'Dormir en un castillo medieval' }), ['singular']);
  });
});

describe('auditoría: puntuación, fechas y coche', () => {
  test('sin precio por noche, cada tipo compite con los suyos (una entrada de 5 € no gana a un paquete por su tipo)', () => {
    const entradas = [5, 20].map((precio) => oferta({ tipo: 'actividad', precio, unidad: 'pp' }));
    const paquetes = [600, 900].map((precio) => oferta({ tipo: 'paquete', precio, unidad: 'total' }));
    puntuar([...entradas, ...paquetes], AJUSTES, { ahora: AHORA });
    // El paquete más barato es el primero de su grupo, igual que la entrada más barata del suyo:
    // con todo lo demás igual, puntúan lo mismo (antes el paquete quedaba detrás de las dos entradas).
    assert.equal(paquetes[0].puntuacion, entradas[0].puntuacion);
    assert.equal(paquetes[1].puntuacion, entradas[1].puntuacion);
  });

  test('una semana que sale en viernes no cuenta como fin de semana; una escapada vie–dom, sí', () => {
    const findes = findesProximos(3, AHORA);
    const semana = oferta({ fechas: { salida: '2026-10-02', vuelta: '2026-10-09' } });
    const finde = oferta({ fechas: { salida: '2026-10-02', vuelta: '2026-10-04' } });
    assert.equal(asignarFechas(semana, findes, []).findeId, null);
    assert.equal(asignarFechas(finde, findes, []).findeId, findes.find((f) => f.viernes === '2026-10-02').id);
  });

  test('a Mallorca no se va en coche: ni tiempo ni gasolina (OSRM cuenta el ferry como carretera)', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => ({ code: 'Ok', durations: [[0, 30000]], distances: [[0, 260000]] }) });
    const palma = oferta({ lugar: { nombre: 'Palma', lat: 39.57, lon: 2.65 }, cocheMin: 500, cocheKm: 260 });
    await calcularCoche([palma], ctx);
    assert.deepEqual([palma.cocheMin, palma.cocheKm], [null, null]);
    assert.equal(peticiones.length, 0);
  });
});
