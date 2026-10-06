import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { marcarEquivalentes, nombreAlojamiento, nucleoNombre } from '../src/enriquecer/duplicados.js';
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

    assert.deepEqual(barata.equivalentes, [{ id: cara.id, fuente: 'nomolesten', precio: 120, unidad: 'noche', precioNoche: 60, url: 'https://nomolesten.com/a' }]);
    assert.deepEqual(barata.etiquetas, []);
    assert.deepEqual(cara.equivalentes, [{ id: barata.id, fuente: 'weekendesk', precio: 100, unidad: 'noche', precioNoche: 50, url: 'https://www.weekendesk.es/b' }]);
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
    for (const o of [nomolesten, weekendesk]) assert.deepEqual(o.etiquetas, ['duplicada'], o.fuente);
    // Cada una ve las otras webs, de la más barata a la más cara: la primera es siempre la más barata.
    assert.deepEqual(nomolesten.equivalentes.map((e) => e.fuente), ['atrapalo', 'weekendesk']);
    assert.deepEqual(weekendesk.equivalentes.map((e) => e.fuente), ['atrapalo', 'nomolesten']);
  });

  it('cada web escribe el pueblo a su manera: apóstrofos, tildes y espacios no cuentan', () => {
    const lugar = (nombre) => ({ nombre, region: 'Girona', pais: 'España' });
    const a = casa({ fuente: 'escapadarural', titulo: 'Can Salvà', precio: 31, unidad: 'pp/noche', lugar: lugar("Vilobí d'Onyar") });
    const b = casa({ fuente: 'tuscasasrurales', titulo: 'Can Salvà', precio: 28, unidad: 'pp/noche', lugar: lugar('Vilobi d Onyar') });
    const c = casa({ fuente: 'escapadarural', titulo: 'Cal Gorguixé', precio: 29, unidad: 'pp/noche', lugar: lugar("Castell de l'Areny") });
    const d = casa({ fuente: 'tuscasasrurales', titulo: 'Cal Gorguixé', precio: 24, unidad: 'pp/noche', lugar: lugar('Castell de l´Areny') });
    marcarEquivalentes([a, b, c, d]);
    assert.deepEqual([a, b, c, d].map((o) => o.equivalentes.length), [1, 1, 1, 1]);
    assert.deepEqual([a, b, c, d].map((o) => o.etiquetas.includes('duplicada')), [true, false, true, false]);
  });

  it('«Can», «Cal», «Casa», «Rural» delante y «Masía» por «Mas» no cambian el alojamiento', () => {
    assert.equal(nucleoNombre('can mas vila'), 'mas vila');
    assert.equal(nucleoNombre('rural mas vila'), 'mas vila');
    assert.equal(nucleoNombre('masia ca l estrada'), nucleoNombre('mas ca l estrada'));
    assert.equal(nucleoNombre('can ros'), 'can ros', 'lo que queda es demasiado corto: el nombre entero');

    const fogars = { nombre: 'Fogars de la Selva', region: 'Barcelona', pais: 'España' };
    const a = casa({ fuente: 'tuscasasrurales', titulo: 'Rural Mas Vila', precio: 32, unidad: 'pp/noche', lugar: fogars });
    const b = casa({ fuente: 'escapadarural', titulo: 'Can Mas Vila', precio: 35, unidad: 'pp/noche', lugar: fogars });
    const c = casa({ fuente: 'tuscasasrurales', titulo: 'Can Ros', precio: 30, unidad: 'pp/noche', lugar: fogars });
    const d = casa({ fuente: 'escapadarural', titulo: 'Cal Ros', precio: 33, unidad: 'pp/noche', lugar: fogars });
    marcarEquivalentes([a, b, c, d]);
    assert.deepEqual(a.equivalentes.map((e) => e.fuente), ['escapadarural']);
    assert.deepEqual(b.etiquetas, ['duplicada']);
    assert.deepEqual([c.equivalentes, d.equivalentes], [[], []], '«ros» solo no distingue una casa de otra');
  });

  it('usa las coordenadas: pueblos vecinos con el mismo nombre exacto sí, homónimos lejanos y otra provincia no', () => {
    const lugar = (nombre, lat, lon, provincia = 'Girona') => ({ nombre, region: provincia, provincia, pais: 'España', lat, lon });
    // Una web lo pone en el municipio y otra en la pedanía, a 2 km.
    const municipio = casa({ fuente: 'escapadarural', titulo: 'Mas Rossell', precio: 39, unidad: 'pp/noche', lugar: lugar('Santa Pau', 42.144, 2.570) });
    const pedania = casa({ fuente: 'tuscasasrurales', titulo: 'Mas Rossell', precio: 41, unidad: 'pp/noche', lugar: lugar('Can Coromines', 42.150, 2.590) });
    marcarEquivalentes([municipio, pedania]);
    assert.deepEqual(municipio.equivalentes.map((e) => e.fuente), ['tuscasasrurales']);

    // Solo el núcleo igual («Can Mas Vila» / «Rural Mas Vila») en pueblos distintos: no.
    const a = casa({ fuente: 'escapadarural', titulo: 'Can Mas Vila', precio: 35, unidad: 'pp/noche', lugar: lugar('Santa Pau', 42.144, 2.570) });
    const b = casa({ fuente: 'tuscasasrurales', titulo: 'Rural Mas Vila', precio: 32, unidad: 'pp/noche', lugar: lugar('Can Coromines', 42.150, 2.590) });
    marcarEquivalentes([a, b]);
    assert.deepEqual([a.equivalentes, b.equivalentes], [[], []]);

    // Dos «Villanueva» a cientos de km, o el mismo nombre de pueblo en otra provincia: no.
    const lejos = [
      casa({ fuente: 'escapadarural', titulo: 'El Molino Viejo', precio: 30, unidad: 'pp/noche', lugar: lugar('Villanueva', 37.9, -4.7, 'Córdoba') }),
      casa({ fuente: 'tuscasasrurales', titulo: 'El Molino Viejo', precio: 35, unidad: 'pp/noche', lugar: lugar('Villanueva', 43.3, -5.6, 'Córdoba') }),
    ];
    const otraProvincia = [
      casa({ fuente: 'escapadarural', titulo: 'El Molino Viejo', precio: 30, unidad: 'pp/noche', lugar: { nombre: 'Villanueva', provincia: 'Córdoba' } }),
      casa({ fuente: 'tuscasasrurales', titulo: 'El Molino Viejo', precio: 35, unidad: 'pp/noche', lugar: { nombre: 'Villanueva', provincia: 'Asturias' } }),
    ];
    for (const pareja of [lejos, otraProvincia]) {
      marcarEquivalentes(pareja);
      assert.deepEqual(pareja.map((o) => o.equivalentes.length), [0, 0]);
    }
  });

  it('las ofertas sin pareja se quedan sin equivalentes', () => {
    const sola = casa({ fuente: 'nomolesten', titulo: 'Hotel Mas Bassó', precio: 120, etiquetas: ['duplicada', 'Spa'] });
    marcarEquivalentes([sola]);
    assert.deepEqual(sola.equivalentes, []);
    assert.deepEqual(sola.etiquetas, ['Spa'], 'la etiqueta de una ejecución anterior se retira');
  });
});

describe('duplicados: la misma oferta publicada dos veces en la misma web', () => {
  const lloret = { nombre: 'Lloret de Mar', region: 'Girona', pais: 'España' };
  const weekendesk = (id, campos = {}) => oferta({
    id: `weekendesk:${id}`, fuente: 'weekendesk', titulo: 'Relax total en Lloret de Mar', precio: 99, unidad: 'total', noches: 1,
    lugar: lloret, descripcion: 'Hotel GHT Oasis Park & Spa · 1 noche', etiquetas: ['Hotel 4*', 'Pensión completa'], ...campos,
  });

  it('si todo lo que se ve coincide, se queda la primera y la otra se marca «duplicada»', () => {
    const [a, b] = [weekendesk('21976524'), weekendesk('21976522')];
    marcarEquivalentes([a, b]);
    assert.deepEqual(b.etiquetas, ['Hotel 4*', 'Pensión completa'], 'la de id menor se queda');
    assert.ok(a.etiquetas.includes('duplicada'));
    assert.deepEqual(a.equivalentes, [], 'no es «también en otra web»');
    marcarEquivalentes([a, b]);
    assert.equal(a.etiquetas.filter((e) => e === 'duplicada').length, 1, 'idempotente');
    assert.ok(!b.etiquetas.includes('duplicada'));
  });

  it('un reclamo que la web pone o quita («Noche adicional con descuento») no las distingue; se queda la más completa', () => {
    const sinNombre = weekendesk('21836906', { etiquetas: ['Escapada barata', 'Noche adicional con descuento', 'Hotel 4*', 'Pensión completa'] });
    const conNombre = weekendesk('8082400', { establecimiento: 'Hotel GHT Oasis Park & Spa', etiquetas: ['Escapada barata', 'Hotel 4*', 'Pensión completa'] });
    marcarEquivalentes([sinNombre, conNombre]);
    assert.ok(sinNombre.etiquetas.includes('duplicada'));
    assert.ok(!conNombre.etiquetas.includes('duplicada'), 'la que dice el nombre del hotel se queda');
  });

  it('una etiqueta, el precio o la descripción distintos son productos distintos', () => {
    const base = weekendesk('1');
    const otras = [
      weekendesk('2', { etiquetas: ['Hotel 4*', 'Cena gastronómica'] }),
      weekendesk('3', { precio: 109 }),
      weekendesk('4', { descripcion: 'Hotel GHT Oasis Park & Spa · habitación superior' }),
      weekendesk('5', { noches: 2 }),
    ];
    marcarEquivalentes([base, ...otras]);
    for (const o of [base, ...otras]) assert.ok(!o.etiquetas.includes('duplicada'), o.id);
  });
});

describe('reenvíos: Chollometro publica una oferta de otra web que también se lee', () => {
  const webs = new Map([['buscounchollo', 'buscounchollo'], ['atrapalo', 'atrapalo']]);
  const massana = { nombre: 'La Massana', lat: 42.5442, lon: 1.5164, codigoPais: 'AD' };
  const original = () => oferta({ fuente: 'buscounchollo', tipo: 'escapada', titulo: '¡Escapada a la vista en Andorra! Tu estancia en la montaña en hotel 3*', precio: 17, unidad: 'pp', estrellas: 3, noches: 1, lugar: { ...massana, lat: 42.5443, lon: 1.5224 } });
  const reenvio = (campos = {}) => oferta({ fuente: 'chollometro', tipo: 'hotel', titulo: 'Hotel 3* + desayuno en LA MASSANA, ANDORRA desde 15€ pp. Octubre', precio: 15, unidad: 'pp', estrellas: 3, lugar: massana, etiquetas: ['Viajes', 'BuscoUnChollo'], ...campos });

  it('el reenvío se junta con la original, que queda a la vista con «También en Chollometro»', () => {
    const [a, b] = [original(), reenvio()];
    marcarEquivalentes([a, b], { webs });
    assert.ok(b.etiquetas.includes('duplicada'));
    assert.ok(!a.etiquetas.includes('duplicada'));
    assert.deepEqual(a.equivalentes.map((e) => e.fuente), ['chollometro']);
    assert.deepEqual(b.equivalentes.map((e) => e.fuente), ['buscounchollo']);
  });

  it('sin decir la web, con otra unidad, otro precio, otras estrellas, lejos o dudando entre dos: nada', () => {
    for (const campos of [{ etiquetas: ['Viajes'] }, { unidad: 'noche' }, { precio: 30 }, { estrellas: 4 }, { lugar: { nombre: 'Andorra la Vella', lat: 42.3, lon: 1.2 } }]) {
      const [a, b] = [original(), reenvio(campos)];
      marcarEquivalentes([a, b], { webs });
      assert.ok(!b.etiquetas.includes('duplicada'), JSON.stringify(campos));
      assert.deepEqual(a.equivalentes, []);
    }
    const [a, a2, b] = [original(), original(), reenvio()];
    marcarEquivalentes([a, a2, b], { webs });
    assert.ok(!b.etiquetas.includes('duplicada'), 'dos posibles originales: no se sabe cuál');
    // Sin la lista de webs (como antes), tampoco.
    const [c, d] = [original(), reenvio()];
    marcarEquivalentes([c, d]);
    assert.ok(!d.etiquetas.includes('duplicada'));
  });
});
