import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { separarDatosPanel } from '../src/panel-datos.js';
import { oferta } from './ayudas.js';

describe('datos del panel en dos archivos', () => {
  it('lo de la ficha (enlaces, eventos y descripción) va aparte; urlReserva solo si es distinta', () => {
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

  it('los precios de Google Hoteles solo los usa la ficha: van aparte, y sin ellos nada', () => {
    const preciosGoogle = { fecha: '2026-10-16', adultos: 2, minimo: 63, proveedores: [{ nombre: 'Booking.com', precio: 76, oficial: false }] };
    const conPrecios = oferta({ preciosGoogle });
    const sinPrecios = oferta();
    const { ofertas, detalles } = separarDatosPanel({ generado: '2026-10-01T10:00:00Z', ofertas: [conPrecios, sinPrecios] });
    assert.ok(ofertas.ofertas.every((o) => !('preciosGoogle' in o)));
    assert.deepEqual(detalles[conPrecios.id].preciosGoogle, preciosGoogle);
    assert.ok(!detalles[sinPrecios.id]);
  });

  it('de las webs de chollos, solo título, precio y enlace: ni su texto ni su «Top chollo»', () => {
    const deChollos = oferta({ fuente: 'buscounchollo', precio: 89, descripcion: 'Su texto entero', resumen: 'Hotel con desayuno', etiquetas: ['top-chollo', 'sale-de:Madrid'] });
    const directa = oferta({ fuente: 'atrapalo', descripcion: 'Jaén · Relax', resumen: 'Hotel con cena', etiquetas: ['top-chollo'] });
    const { ofertas, detalles } = separarDatosPanel({ generado: '2026-10-01T10:00:00Z', ofertas: [deChollos, directa] });
    const [ligera, otra] = ofertas.ofertas;
    assert.ok(!('descripcion' in ligera) && !('resumen' in ligera));
    assert.ok(!detalles[deChollos.id]?.descripcion, 'ni en la ficha');
    assert.deepEqual(ligera.etiquetas, ['sale-de:Madrid'], 'las etiquetas que pone el escaneo se quedan');
    assert.equal(ligera.titulo, deChollos.titulo);
    assert.equal(ligera.precio, deChollos.precio);
    assert.equal(ligera.url, deChollos.url);
    // La descripción solo se lee en la ficha: va en detalles.json (unos 200 KB menos al cargar).
    assert.ok(!('descripcion' in otra));
    assert.equal(detalles[directa.id].descripcion, 'Jaén · Relax');
    assert.equal(otra.resumen, 'Hotel con cena');
    assert.equal(deChollos.descripcion, 'Su texto entero', 'el escaneo y las guías siguen leyendo el texto');
  });

  it('sin campos vacíos (null), tampoco dentro de lugar o fechas; las listas se quedan', () => {
    const o = oferta({ precioAnterior: null, temas: [], lugar: { nombre: 'Olot', provincia: null, lat: 42.18, lon: 2.49 }, fechas: { salida: null, vuelta: null } });
    const [ligera] = separarDatosPanel({ generado: '2026-10-01T10:00:00Z', ofertas: [o] }).ofertas.ofertas;
    assert.ok(!('precioAnterior' in ligera));
    assert.deepEqual(ligera.lugar, { nombre: 'Olot', lat: 42.18, lon: 2.49 });
    assert.deepEqual(ligera.fechas, {});
    assert.deepEqual(ligera.temas, []);
    assert.equal(o.precioAnterior, null, 'no toca la oferta original');
  });

  it('no publica lo que dio su web antes de enriquecer ni el título sin limpiar', () => {
    const limpia = oferta({ titulo: 'Hotel 3* en La Massana', tituloOriginal: 'Hotel 3* en LA MASSANA 🏔️', deLaFuente: { tipo: 'hotel' } });
    const [ligera] = separarDatosPanel({ generado: '2026-10-01T10:00:00Z', ofertas: [limpia] }).ofertas.ofertas;
    assert.ok(!('deLaFuente' in ligera) && !('tituloOriginal' in ligera));
    assert.equal(ligera.titulo, 'Hotel 3* en La Massana');
  });
});
