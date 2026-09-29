import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { aplicarNinos, detectarNinos } from '../src/enriquecer/ninos.js';
import { aplicarClasificacion } from '../src/enriquecer/temas.js';
import { ETIQUETAS_NINOS, NINOS, cumpleNinos, crearHash, leerFiltrosActividades, leerFiltrosEscapadas, leerRuta } from '../site/js/filtros.js';
import { textoNinos } from '../site/js/plantillas.js';
import { oferta } from './ayudas.js';

const ninos = (campos) => detectarNinos(oferta(campos));

describe('niños: gratis', () => {
  it('«1er niño gratis», «un niño incluido» y la edad cuando la dan', () => {
    assert.deepEqual(ninos({ titulo: 'Mazarrón: vacaciones en familia con ¡1er niño GRATIS!' }), { ventaja: 'gratis', descuento: null, detalle: '1 niño gratis' });
    assert.equal(ninos({ titulo: 'Media pensión y un niño incluido en l\'Ametlla' }).detalle, '1 niño gratis');
    assert.equal(ninos({ titulo: 'Magic World', descripcion: 'desde 37 € y con el primer niño de 2 a 16 años gratis.' }).detalle, '1 niño gratis (de 2 a 16 años)');
    assert.equal(ninos({ titulo: 'Vall de Boí con spa y niños GRATIS' }).detalle, 'Niños gratis');
    assert.equal(ninos({ titulo: 'Hotel', descripcion: 'Los niños duermen y comen gratis en la habitación de los padres' }).ventaja, 'gratis');
    assert.equal(ninos({ titulo: 'Entrada', descripcion: 'Entrada gratuita para menores de 4 años' }).detalle, 'Niños gratis (menos de 4 años)');
    assert.equal(ninos({ titulo: 'Hotel', descripcion: '1 niño gratuito en el mismo régimen hasta 12 años' }).ventaja, 'gratis');
  });

  it('no confunde la cancelación gratuita, el desayuno incluido ni el precio de una familia', () => {
    // BuscoUnChollo pone «niños» como etiqueta junto a «cancelación gratuita».
    assert.equal(ninos({ titulo: 'Hotel en Salou', etiquetas: ['Niños', 'Cancelación gratuita'] }).ventaja, null);
    assert.equal(ninos({ titulo: 'Hotel', descripcion: 'Desayuno incluido para niños y adultos' }).ventaja, null);
    assert.equal(ninos({ titulo: 'Apartamento', descripcion: 'Precio para 2 adultos y 2 niños incluidos' }).ventaja, null);
  });
});

describe('niños: descuento y tarifa infantil', () => {
  it('«niños 60 % de descuento», «-50% niños» y «mitad de precio»', () => {
    assert.deepEqual(ninos({ titulo: 'Hotel 4* en Tossa de Mar con media pensión, niños 60% de descuento' }), { ventaja: 'descuento', descuento: 60, detalle: 'Niños con un 60 % de descuento' });
    assert.equal(ninos({ titulo: 'Benidorm: hotel 4*+pensión completa -50% niños' }).descuento, 50);
    assert.equal(ninos({ titulo: 'Hotel', descripcion: '30 % de descuento para el primer niño' }).descuento, 30);
    assert.equal(ninos({ titulo: 'Crucero', descripcion: 'Los niños pagan la mitad' }).descuento, 50);
  });

  it('«tarifa infantil» o «precio reducido para niños», sin porcentaje', () => {
    assert.equal(ninos({ tipo: 'actividad', titulo: 'Entrada al zoo', descripcion: 'Hay tarifa infantil' }).ventaja, 'reducido');
    assert.equal(ninos({ tipo: 'actividad', titulo: 'Museo', descripcion: 'Precio reducido para niños' }).ventaja, 'reducido');
  });
});

describe('niños: apto, negaciones y solo adultos', () => {
  it('planes para ir con niños sin precio especial', () => {
    assert.deepEqual(ninos({ titulo: 'Escapada en familia al Pirineo' }), { ventaja: null, descuento: null, detalle: null });
    assert.ok(ninos({ tipo: 'actividad', titulo: 'Juego de pistas en Tarragona: Búsqueda del tesoro' }));
    assert.ok(ninos({ tipo: 'actividad', titulo: 'Entrada al Museo del Juguete de Cataluña' }));
    assert.ok(ninos({ titulo: 'Hotel con miniclub' }));
  });

  it('nada de niños: vuelos, «solo adultos», lo negado, «suite junior» y «bodegas familiares»', () => {
    assert.equal(ninos({ tipo: 'vuelo', titulo: 'Vuelo a Roma, niños gratis' }), null);
    assert.equal(ninos({ titulo: 'Hotel solo adultos con spa', descripcion: 'Niños gratis' }), null);
    assert.equal(ninos({ titulo: 'Casa rural', descripcion: 'No se admiten niños ni mascotas' }), null);
    assert.equal(ninos({ titulo: 'Noche en suite junior con cancelación gratis' }), null);
    assert.equal(ninos({ tipo: 'actividad', titulo: 'Cata de vinos', descripcion: 'pequeñas bodegas familiares y ecológicas' }), null);
  });

  it('aplicarNinos pone el tema «familia» y el tema ya no salta con «bodegas familiares»', () => {
    const o = aplicarNinos(oferta({ titulo: 'Hotel con 1 niño gratis' }));
    assert.equal(o.ninos.ventaja, 'gratis');
    assert.ok(o.temas.includes('familia'));
    const vino = aplicarClasificacion(oferta({ tipo: 'actividad', titulo: 'Cata', descripcion: 'bodegas familiares' }));
    assert.ok(!vino.temas.includes('familia'));
    assert.equal(aplicarNinos(oferta({ titulo: 'Hotel' })).ninos, null);
  });
});

describe('niños: filtro y textos del panel', () => {
  const gratis = { ninos: { ventaja: 'gratis', descuento: null, detalle: '1 niño gratis' } };
  const descuento = { ninos: { ventaja: 'descuento', descuento: 60, detalle: 'Niños con un 60 % de descuento' } };
  const apto = { ninos: { ventaja: null, descuento: null, detalle: null } };
  const nada = { ninos: null };

  it('apto, ventaja y gratis, de más a menos amplio', () => {
    const todas = [gratis, descuento, apto, nada];
    const cuantas = (valor) => todas.filter((o) => cumpleNinos(o, valor)).length;
    assert.deepEqual(NINOS.map(cuantas), [3, 2, 1]);
    assert.equal(cuantas(''), 4);
  });

  it('se lee de la URL en escapadas y planes, y lo desconocido se ignora', () => {
    assert.equal(leerFiltrosEscapadas(leerRuta(crearHash('escapadas', { ninos: 'ventaja' })).params).ninos, 'ventaja');
    assert.equal(leerFiltrosActividades({ ninos: 'gratis' }).ninos, 'gratis');
    assert.equal(leerFiltrosEscapadas({ ninos: 'x' }).ninos, '');
    assert.deepEqual(Object.keys(ETIQUETAS_NINOS), NINOS);
  });

  it('la insignia dice lo que tienen los niños', () => {
    assert.equal(textoNinos(gratis), '1 niño gratis');
    assert.equal(textoNinos(descuento), 'Niños −60 %');
    assert.equal(textoNinos({ ninos: { ventaja: 'reducido', descuento: null, detalle: 'x' } }), 'Tarifa para niños');
    assert.equal(textoNinos(apto), null);
    assert.equal(textoNinos(nada), null);
  });
});
