import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { clasificarVueloSinFecha, salidasDe } from '../src/enriquecer/vuelos.js';
import { oferta } from './ayudas.js';

const salidas = (o) => o.etiquetas.filter((e) => e.startsWith('sale-de:')).map((e) => e.slice(8));

describe('vuelos sin fecha: billete, paquete o promoción', () => {
  it('con alojamiento es un paquete (títulos reales del 28-09-2026)', () => {
    for (const titulo of [
      'Viaje a Venecia 4 días / 3 noches en Hotel 3* con vuelos y desayuno inc. desde Madrid el 10 enero por 199€',
      'Irlanda con vuelos ida y vuelta + 2 noches en hostal céntrico. Desde Madrid del 13 al 15 diciembre.',
      '11 días en Corea del Sur. Vuelo ida y vuelta, alojamiento y seguro. 30 de noviembre desde Madrid.',
      'Malta y Nápoles ¡Viaje combinado de 7 días por Nápoles y Malta con vuelos + traslados entre destinos + hoteles',
    ]) {
      const o = clasificarVueloSinFecha(oferta({ tipo: 'vuelo', titulo }));
      assert.equal(o.tipo, 'paquete', titulo);
      assert.equal(o.transporte, 'avion');
    }
    const largo = clasificarVueloSinFecha(oferta({ tipo: 'vuelo', titulo: 'Vuelo ida y vuelta a Pekin desde Madrid en Enero 13 días con escala corta' }));
    assert.equal(largo.tipo, 'vuelo', '«13 días» es la duración del viaje, no un hotel');
  });

  it('un descuento o una selección de destinos es una promoción, no un billete', () => {
    for (const titulo of [
      'Ryanair 20 € de descuento en vuelos de ida y vuelta',
      'Hasta un 20% de descuento en vuelos de QATAR AIRWAYS',
      'Escala gratuita + vuelo nacional gratuito en Japón con All Nippon Airways (ANA)',
      'Ofertas en Ryanair para volar en Octubre. Muchos destinos por menos de 15 € por trayecto.',
      'Etihad Airways Sale 💥 Flights from many European cities to numerous destinations across Asia',
    ]) {
      assert.ok(clasificarVueloSinFecha(oferta({ tipo: 'vuelo', titulo })).etiquetas.includes('promocion'), titulo);
    }
    const billete = clasificarVueloSinFecha(oferta({ tipo: 'vuelo', titulo: '¡NORUEGA! Vuelos DIRECTOS de IDA y VUELTA por solo 46€ (noviembre) Salidas desde Alicante' }));
    assert.ok(!billete.etiquetas.includes('promocion'));
  });

  it('anota desde dónde sale', () => {
    assert.deepEqual(salidasDe('¡CHICAGO! VUELOS de IDA y VUELTA por solo 268€ (nov - mar) Salidas desde Málaga, Alicante, Madrid y Barcelona'), ['Málaga', 'Alicante', 'Madrid', 'Barcelona']);
    assert.deepEqual(salidasDe('Vuelos Barcelona – Murcia con Volotea'), ['Barcelona']);
    assert.deepEqual(salidasDe('Qatar Airways flights from Madrid & London to exotic Seychelles'), ['Madrid', 'Londres']);
    assert.deepEqual(salidasDe('Cheap flights from many European cities to Peru 🦙 from €587'), ['varias ciudades europeas']);
    assert.deepEqual(salidasDe('Crazy-low prices 😉 Cheap full-service flights from Spain to New York from €244'), ['España']);
    assert.deepEqual(salidasDe('Surfing & volcano views in Costa Rica Flights from Madrid from €476'), ['Madrid']);
    assert.deepEqual(salidasDe('Viaje barato a Nápoles desde 121€ o desde solo 9€'), [], 'un precio no es una ciudad');
    const paquete = clasificarVueloSinFecha(oferta({ tipo: 'paquete', transporte: 'avion', titulo: 'Bernina Express', descripcion: '3 noches en Milán, incluye los Vuelos ida y vuelta desde Barcelona' }));
    assert.deepEqual(salidas(paquete), ['Barcelona']);
  });

  it('es idempotente y no toca los vuelos con fecha ni lo que no va en avión', () => {
    const o = oferta({ tipo: 'vuelo', titulo: 'Ryanair 20 € de descuento. Salidas desde Girona' });
    clasificarVueloSinFecha(clasificarVueloSinFecha(o));
    assert.deepEqual(o.etiquetas, ['promocion', 'sale-de:Girona']);
    const conFecha = oferta({ tipo: 'vuelo', titulo: 'Oporto 2 noches hotel', vuelo: { origen: 'BCN', destino: 'OPO' } });
    assert.equal(clasificarVueloSinFecha(conFecha).tipo, 'vuelo');
    const casa = oferta({ tipo: 'hotel', titulo: 'Casa rural desde Girona' });
    assert.deepEqual(clasificarVueloSinFecha(casa).etiquetas, []);
  });
});

describe('vuelos sin fecha en el panel', async () => {
  const { chollosDeVuelos, leerFiltrosVuelos, promocionesDeVuelos, saleDeMisAeropuertos } = await import('../site/js/filtros.js');
  const { tarjeta } = await import('../site/js/plantillas.js');
  const ctx = { aeropuertos: ['BCN', 'GRO', 'REU'], origen: { nombre: 'Barcelona' }, favoritos: new Set(), descartadas: new Set() };
  const vuelo = (titulo, extra = {}) => clasificarVueloSinFecha(oferta({ tipo: 'vuelo', titulo, precio: 50, unidad: 'i/v', ...extra }));
  const alicante = vuelo('¡NORUEGA! Vuelos DIRECTOS por solo 46€ Salidas desde Alicante');
  const barcelona = vuelo('¡EGIPTO! Vuelos DIRECTOS por solo 158€ Salidas desde Barcelona');
  const europa = vuelo('Cheap flights from many European cities to Peru from €587');
  const sinSalida = vuelo('Vuelos a Cerdeña ¡SOLO 15€!');
  const promo = vuelo('Ryanair 20 € de descuento en vuelos de ida y vuelta', { precio: null, unidad: null });
  const todas = [alicante, barcelona, europa, sinSalida, promo];

  it('«desde mis aeropuertos» quita lo que sale de otra ciudad y deja lo que puede incluir la tuya', () => {
    assert.equal(saleDeMisAeropuertos(alicante, ctx.aeropuertos, ctx.origen), false);
    assert.equal(saleDeMisAeropuertos(barcelona, ctx.aeropuertos, ctx.origen), true);
    assert.equal(saleDeMisAeropuertos(europa, ctx.aeropuertos, ctx.origen), true, '«varias ciudades europeas» puede incluirla');
    assert.equal(saleDeMisAeropuertos(sinSalida, ctx.aeropuertos, ctx.origen), true, 'si no lo dice, no se esconde');
    const ids = (lista) => lista.map((o) => o.id).sort();
    assert.deepEqual(ids(chollosDeVuelos(todas, leerFiltrosVuelos({ mios: '1' }), ctx)), ids([barcelona, europa, sinSalida]));
    assert.equal(chollosDeVuelos(todas, leerFiltrosVuelos({}), ctx).length, 4);
  });

  it('las promociones van aparte de los billetes', () => {
    assert.deepEqual(promocionesDeVuelos(todas, leerFiltrosVuelos({}), ctx).map((o) => o.id), [promo.id]);
    assert.ok(!chollosDeVuelos(todas, leerFiltrosVuelos({}), ctx).includes(promo));
  });

  it('la tarjeta dice desde dónde sale', () => {
    const html = tarjeta(alicante, { temas: new Map(), fuentes: new Map(), favoritos: new Set() });
    assert.match(html, /🛫 Sale de Alicante/);
  });
});
