import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { separarDatosPanel } from '../src/panel-datos.js';
import { oferta } from './ayudas.js';

describe('datos del panel en dos archivos', () => {
  it('lo de la ficha (enlaces y eventos) va aparte; urlReserva solo si es distinta', () => {
    const conTodo = oferta({ enlaces: [{ etiqueta: 'Booking', url: 'https://www.booking.com/' }], eventos: [{ nombre: 'Feria' }], urlReserva: 'https://ejemplo.es/oferta' });
    const sinNada = oferta({ enlaces: [], eventos: [], urlReserva: 'https://otra.es/reserva' });
    const { ofertas, detalles, version } = separarDatosPanel({ generado: '2026-10-01T10:00:00Z', ofertas: [conTodo, sinNada] });
    assert.deepEqual(version, { generado: '2026-10-01T10:00:00Z' });
    assert.equal(ofertas.generado, '2026-10-01T10:00:00Z');
    const [ligera, otra] = ofertas.ofertas;
    assert.ok(!('enlaces' in ligera) && !('eventos' in ligera) && !('urlReserva' in ligera));
    assert.equal(otra.urlReserva, 'https://otra.es/reserva');
    assert.deepEqual(Object.keys(detalles), [conTodo.id], 'sin detalles vacíos');
    assert.equal(detalles[conTodo.id].enlaces[0].etiqueta, 'Booking');
    assert.ok(conTodo.enlaces, 'no toca las ofertas originales (las páginas y los emails las usan enteras)');
  });
});
