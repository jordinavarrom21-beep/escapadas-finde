import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { separarDatosPanel } from '../src/panel-datos.js';
import { oferta } from './ayudas.js';

describe('datos del panel en dos archivos', () => {
  it('lo de la ficha (enlaces y eventos) va aparte; urlReserva solo si es distinta', () => {
    const evento = { nombre: 'Feria', fecha: '2026-10-03', url: 'https://feria.es', municipio: 'Olot', tipo: 'ferias', km: 2.4, precio: 'desde 5 €' };
    const conTodo = oferta({ enlaces: [{ etiqueta: 'Booking', url: 'https://www.booking.com/' }], eventos: [evento], urlReserva: 'https://ejemplo.es/oferta' });
    const sinNada = oferta({ enlaces: [], eventos: [], urlReserva: 'https://otra.es/reserva' });
    const { ofertas, detalles, version } = separarDatosPanel({ generado: '2026-10-01T10:00:00Z', ofertas: [conTodo, sinNada] });
    assert.deepEqual(version, { generado: '2026-10-01T10:00:00Z' });
    assert.equal(ofertas.generado, '2026-10-01T10:00:00Z');
    const [ligera, otra] = ofertas.ofertas;
    assert.ok(!('enlaces' in ligera) && !('urlReserva' in ligera));
    // La tarjeta («Concierto a 3 km»), la portada (el pueblo del evento, no el de la oferta) y el
    // filtro de eventos funcionan sin abrir ninguna ficha.
    assert.deepEqual(ligera.eventos, [{ nombre: 'Feria', tipo: 'ferias', km: 2.4, fecha: '2026-10-03', municipio: 'Olot' }]);
    assert.deepEqual(detalles[conTodo.id].eventos, [evento], 'la ficha recibe los eventos enteros');
    assert.ok(!('eventos' in otra), 'sin eventos, nada');
    assert.equal(otra.urlReserva, 'https://otra.es/reserva');
    assert.deepEqual(Object.keys(detalles), [conTodo.id], 'sin detalles vacíos');
    assert.equal(detalles[conTodo.id].enlaces[0].etiqueta, 'Booking');
    assert.ok(conTodo.enlaces, 'no toca las ofertas originales (las páginas y los emails las usan enteras)');
  });

  it('de las webs de chollos, solo título, precio y enlace: ni su texto ni su «Top chollo»', () => {
    const deChollos = oferta({ fuente: 'buscounchollo', descripcion: 'Su texto entero', resumen: 'Hotel con desayuno', etiquetas: ['top-chollo', 'sale-de:Madrid'] });
    const directa = oferta({ fuente: 'atrapalo', descripcion: 'Jaén · Relax', resumen: 'Hotel con cena', etiquetas: ['top-chollo'] });
    const { ofertas } = separarDatosPanel({ generado: '2026-10-01T10:00:00Z', ofertas: [deChollos, directa] });
    const [ligera, otra] = ofertas.ofertas;
    assert.ok(!('descripcion' in ligera) && !('resumen' in ligera));
    assert.deepEqual(ligera.etiquetas, ['sale-de:Madrid'], 'las etiquetas que pone el escaneo se quedan');
    assert.equal(ligera.titulo, deChollos.titulo);
    assert.equal(ligera.precio, deChollos.precio);
    assert.equal(ligera.url, deChollos.url);
    assert.equal(otra.descripcion, 'Jaén · Relax');
    assert.equal(otra.resumen, 'Hotel con cena');
    assert.equal(deChollos.descripcion, 'Su texto entero', 'el escaneo y las guías siguen leyendo el texto');
  });

  it('no publica lo que dio su web antes de enriquecer ni el título sin limpiar', () => {
    const limpia = oferta({ titulo: 'Hotel 3* en La Massana', tituloOriginal: 'Hotel 3* en LA MASSANA 🏔️', deLaFuente: { tipo: 'hotel' } });
    const [ligera] = separarDatosPanel({ generado: '2026-10-01T10:00:00Z', ofertas: [limpia] }).ofertas.ofertas;
    assert.ok(!('deLaFuente' in ligera) && !('tituloOriginal' in ligera));
    assert.equal(ligera.titulo, 'Hotel 3* en La Massana');
  });
});
