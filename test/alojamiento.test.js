import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { aplicarAlojamiento, detectarAlojamiento } from '../src/enriquecer/alojamiento.js';
import { ALOJAMIENTOS } from '../src/modelo.js';
import { parsear as parsearClubrural } from '../src/fuentes/clubrural.js';
import { parsear as parsearEscapadarural } from '../src/fuentes/escapadarural.js';
import { parsear as parsearNomolesten } from '../src/fuentes/nomolesten.js';
import { parsear as parsearWeekendesk } from '../src/fuentes/weekendesk.js';
import { leerFixture, oferta } from './ayudas.js';

describe('alojamiento: por fuente', () => {
  const porFuente = {
    clubrural: 'casa-rural',
    escapadarural: 'casa-rural',
    campings: 'camping',
    paradores: 'parador',
    nomolesten: 'hotel',
    rusticae: 'hotel',
  };

  for (const [fuente, esperado] of Object.entries(porFuente)) {
    it(`${fuente} → ${esperado}`, () => {
      assert.equal(detectarAlojamiento(oferta({ fuente, titulo: 'Escapada de dos noches' })), esperado);
    });
  }

  it('la fuente manda sobre las palabras del texto', () => {
    assert.equal(detectarAlojamiento(oferta({ fuente: 'paradores', titulo: 'Hotel de lujo con spa' })), 'parador');
  });
});

describe('alojamiento: por palabras del título o la descripción', () => {
  const porTexto = [
    ['Casa rural con chimenea', 'casa-rural'],
    ['Masía del siglo XVIII', 'casa-rural'],
    ['Apartamento con vistas al mar', 'apartamento'],
    ['Bungalow para cuatro', 'camping'],
    ['Camping junto al lago', 'camping'],
    ['Glamping en el Montseny', 'camping'],
    ['Balneario termal', 'balneario'],
    ['Hostal céntrico', 'hostal'],
    ['Parador de Cardona', 'parador'],
    ['Hotel boutique', 'hotel'],
  ];

  for (const [titulo, esperado] of porTexto) {
    it(`«${titulo}» → ${esperado}`, () => {
      assert.equal(detectarAlojamiento(oferta({ titulo })), esperado);
      assert.ok(ALOJAMIENTOS.includes(esperado));
    });
  }

  it('también mira la descripción y prefiere lo más concreto', () => {
    const o = oferta({ titulo: 'Escapada romántica', descripcion: 'Casa rural con encanto en un hotel con spa' });
    assert.equal(detectarAlojamiento(o), 'casa-rural');
  });

  it('sin pistas devuelve null, y los vuelos nunca son alojamiento', () => {
    assert.equal(detectarAlojamiento(oferta({ titulo: 'Escapada romántica' })), null);
    assert.equal(detectarAlojamiento(oferta({ tipo: 'vuelo', titulo: 'Vuelo a Oporto con hotel barato' })), null);
  });
});

describe('alojamiento: aplicarAlojamiento', () => {
  it('rellena solo lo que está vacío', () => {
    assert.equal(aplicarAlojamiento(oferta({ titulo: 'Camping del Pirineo' })).alojamiento, 'camping');
    assert.equal(aplicarAlojamiento(oferta({ titulo: 'Camping del Pirineo', alojamiento: 'hostal' })).alojamiento, 'hostal');
  });
});

describe('valoración en las fuentes', () => {
  const notaValida = (o) => {
    if (o.valoracion === null) return true;
    const { nota, n } = o.valoracion;
    return nota > 0 && nota <= 10 && Number.isInteger(n) && n > 0;
  };

  it('nomolesten: nota sobre 10 y número de opiniones de la tarjeta', () => {
    const ofertas = parsearNomolesten(leerFixture('nomolesten-ofertas.html'), {}, { tema: 'ofertas' });
    const conValoracion = ofertas.filter((o) => o.valoracion);
    assert.ok(conValoracion.length >= 3, `solo ${conValoracion.length} con valoración`);
    assert.ok(ofertas.every(notaValida));
    assert.deepEqual(conValoracion[0].valoracion, { nota: 10, n: 2 });
  });

  it('clubrural: la nota de Holidu ya viene sobre 10', () => {
    const ofertas = parsearClubrural(leerFixture('clubrural-fin-de-semana.html'));
    const cadalso = ofertas.find((o) => o.id === 'clubrural:56956009');
    assert.deepEqual(cadalso.valoracion, { nota: 9.8, n: 32 });
    assert.ok(ofertas.every(notaValida));
  });

  it('escapadarural: convierte las 5 estrellas a nota sobre 10', () => {
    const ofertas = parsearEscapadarural(leerFixture('escapadarural-ofertas.html'));
    const muralla = ofertas.find((o) => o.id === 'escapadarural:65d734b152d65');
    assert.deepEqual(muralla.valoracion, { nota: 10, n: 4 }, '5/5 estrellas con 4 opiniones');
    assert.deepEqual(ofertas.find((o) => o.id === 'escapadarural:5f4e5d589a8da').valoracion, { nota: 9, n: 21 });
    assert.ok(ofertas.every(notaValida));
    assert.equal(ofertas.find((o) => o.id === 'escapadarural:619f751dcce9e').valoracion, null, 'sin opiniones, sin valoración');
  });

  it('weekendesk: media del hotel y número de opiniones', () => {
    const ofertas = parsearWeekendesk(leerFixture('weekendesk-cataluna-baratas.html'));
    const oasis = ofertas.find((o) => /GHT Oasis Park/.test(o.descripcion));
    assert.deepEqual(oasis.valoracion, { nota: 7.9, n: 44 });
    assert.ok(ofertas.every(notaValida));
  });
});
