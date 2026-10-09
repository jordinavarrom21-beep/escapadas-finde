/**
 * Los arreglos de interfaz y textos del plan de corrección (fase 4), cada uno con el caso que lo
 * pedía: fechas con el nombre que toca en cada pestaña, periodos largos que no son «69 noches»,
 * vuelos sin fecha que dicen sus meses, planes de nieve fuera de temporada, el aviso de equipaje,
 * el botón que dice adónde lleva y la tabla de webs sin enlaces que no son para visitantes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MAXIMO_DIAS, ROTULOS_FECHAS, camposFechas, elegirDia, htmlCalendario, textoNoches } from '../site/js/selector-fechas.js';
import { nombreSiguienteFinde } from '../site/js/fechas.js';
import { actividadesCerca } from '../site/js/filtros.js';
import { motivosNota } from '../site/js/nota.js';
import {
  avisoEquipaje, botonDescartar, enlaceOferta, esFreeTour, mesesDelTexto, textoFechas, textoGratis, textoTendencia,
} from '../site/js/plantillas.js';
import { vistaFuentes } from '../site/js/vistas-info.js';
import { diasConNombre } from '../src/util/fechas.js';
import { numeroWebs } from '../src/paginas.js';

describe('plan F4: fechas', () => {
  it('cada pestaña nombra sus fechas: entrada/salida, ida/vuelta, desde/hasta', () => {
    assert.deepEqual(ROTULOS_FECHAS.vuelos, ['Ida', 'Vuelta']);
    assert.deepEqual(ROTULOS_FECHAS.actividades, ['Desde', 'Hasta']);
    const etiquetas = (html) => [...html.matchAll(/class="fechas__etiqueta">([^<]+)</g)].map((m) => m[1]);
    assert.deepEqual(etiquetas(camposFechas({ idPanel: 'p' })), ['Fecha de entrada', 'Fecha de salida']);
    assert.deepEqual(etiquetas(camposFechas({ idPanel: 'p', rotulos: ROTULOS_FECHAS.vuelos })), ['Ida', 'Vuelta']);
  });

  it(`un rango de como mucho ${MAXIMO_DIAS} días: lo de después no se puede elegir como salida`, () => {
    const sel = { entrada: '2026-10-16', salida: '', editando: 'salida' };
    assert.deepEqual(elegirDia(sel, '2026-10-18'), { entrada: '2026-10-16', salida: '2026-10-18', editando: 'entrada', completo: true });
    // Más lejos, ese día empieza otra búsqueda (no una «estancia» de tres meses).
    assert.equal(elegirDia(sel, '2027-01-20').entrada, '2027-01-20');
    const calendario = htmlCalendario(sel, { hoy: '2026-10-09', mes: '2026-12', meses: 1 });
    assert.match(calendario, /data-dia="2026-12-11"[^>]*>11</, 'a 56 días, se puede');
    assert.match(calendario, /data-dia="2026-12-12"[^>]* disabled>12</, 'a 57, no');
  });

  it('más de una semana es un periodo en el que buscar, no las noches del viaje', () => {
    assert.equal(textoNoches('2026-10-16', '2026-10-18'), '2 noches');
    assert.equal(textoNoches('2026-10-17', '2026-12-25'), 'Del 17 oct al 25 dic');
    assert.equal(textoNoches('2026-10-17', '2026-10-17'), 'Un día');
  });

  it('el domingo, «el próximo finde» es el de después', () => {
    assert.equal(nombreSiguienteFinde('2026-10-11'), 'El de después');
    assert.equal(nombreSiguienteFinde('2026-10-09'), 'El próximo finde');
  });

  it('los puentes con el día de la semana: «vie 4 – mar 8 dic»', () => {
    assert.equal(diasConNombre('2026-12-04', '2026-12-08'), 'vie 4 – mar 8 dic');
    assert.equal(diasConNombre('2026-10-30', '2026-11-01'), 'vie 30 oct – dom 1 nov');
  });
});

describe('plan F4: tarjetas y ficha', () => {
  const vuelo = { id: 'v', tipo: 'vuelo', fuente: 'chollometro', titulo: 'Vuelos a Roma', fechas: {} };

  it('un vuelo sin fecha dice sus meses o hasta cuándo vale, no «Fechas flexibles»', () => {
    assert.equal(mesesDelTexto('Vuelos a Roma en noviembre y diciembre'), 'nov–dic');
    assert.equal(textoFechas({ ...vuelo, tituloOriginal: 'Vuelos a Roma en noviembre y diciembre' }), 'nov–dic');
    assert.equal(textoFechas({ ...vuelo, caduca: '2026-11-30T21:00:00Z' }), 'Válido hasta el 30 nov');
    assert.equal(textoFechas({ ...vuelo, tipo: 'hotel' }), 'Fechas flexibles');
  });

  it('la tendencia en una frase que no se contradice', () => {
    const serie = [['2026-10-01', 100], ['2026-10-07', 103], ['2026-10-08', 100]];
    assert.match(textoTendencia(serie), /^3\s€ menos que ayer · Igual que hace una semana$/);
    assert.equal(textoTendencia([['2026-10-07', 90], ['2026-10-08', 90]]), 'Igual que ayer');
    assert.equal(textoTendencia([['2026-10-08', 90]]), '');
  });

  it('Wizz Air y Volotea avisan de que la tarifa básica es solo un bolso', () => {
    assert.equal(avisoEquipaje({ ...vuelo, fuente: 'wizzair' }), 'Tarifa básica: solo bolso bajo el asiento');
    assert.equal(avisoEquipaje({ ...vuelo, fuente: 'volotea' }), 'Tarifa básica: solo bolso bajo el asiento');
    assert.equal(avisoEquipaje({ ...vuelo, fuente: 'ryanair' }), '');
    assert.equal(avisoEquipaje({ ...vuelo, tipo: 'hotel', fuente: 'volotea' }), '');
  });

  it('un free tour es gratis con propina voluntaria; una entrada gratis, solo gratis', () => {
    const tour = { tipo: 'actividad', fuente: 'guruwalk', precio: 0 };
    assert.ok(esFreeTour(tour));
    assert.equal(textoGratis(tour), 'Gratis (propina voluntaria)');
    assert.equal(textoGratis({ tipo: 'actividad', fuente: 'agenda', precio: 0 }), 'Gratis');
  });

  it('los botones dicen lo que hacen: «Ver oferta en {web}» y «Ocultar»', () => {
    const o = { id: 'x', fuente: 'weekendesk', titulo: 'Hotel', url: 'https://www.weekendesk.es/x' };
    assert.match(enlaceOferta(o, null, { fuentes: new Map([['weekendesk', 'Weekendesk']]) }), />Ver oferta<span class="boton__web"> en Weekendesk<\/span></);
    assert.match(botonDescartar(o), /class="boton-descartar"[^>]*>[^]*<span aria-hidden="true">Ocultar<\/span>/);
  });

  it('«Cerca» dice el tramo que da los puntos, no otro tiempo exacto', () => {
    const conPuntos = (cocheMin) => motivosNota({ cocheMin, notaDetalle: { partes: { comodidad: 5 } } })[0].texto;
    assert.equal(conPuntos(100), 'Cerca: a menos de 2 h en coche');
    assert.equal(conPuntos(170), 'Cerca: a menos de 3 h en coche');
  });

  it('los planes de nieve, solo de diciembre a abril', () => {
    const lugar = { nombre: 'Canillo', lat: 42.56, lon: 1.6 };
    const nieve = { id: 'a1', tipo: 'actividad', titulo: 'Snake Gliss', lugar, puntuacion: 50 };
    const museo = { id: 'a2', tipo: 'actividad', titulo: 'Museo del Perfume', lugar, puntuacion: 40 };
    const hotel = (salida) => ({ id: 'h', tipo: 'hotel', lugar, fechas: { salida } });
    const ids = (o, opciones) => actividadesCerca([nieve, museo], o, opciones).map((x) => x.id);
    assert.deepEqual(ids(hotel('2026-10-16')), ['a2'], 'en octubre, nada de nieve');
    assert.deepEqual(ids(hotel('2027-01-15')), ['a1', 'a2']);
    assert.deepEqual(ids(hotel(null), { hoy: '2026-10-09' }), ['a2'], 'fechas flexibles: la temporada de hoy');
  });
});

describe('plan F4: webs', () => {
  const fuentes = [
    { id: 'a', nombre: 'Web A', estado: 'ok', web: 'https://www.weba.es/', ultimoOk: '2026-10-09T08:00:00Z', total: 10 },
    { id: 'buzon', nombre: 'Buzón de newsletters', estado: 'ok', web: 'https://mail.google.com/mail/u/0/', ultimoOk: '2026-10-09T08:00:00Z', total: 5 },
    { id: 'tg', nombre: 'Telegram', estado: 'ok', web: 'https://t.me/canal_chollos/', ultimoOk: '2026-10-09T08:00:00Z', total: 3 },
    { id: 'ryanair', nombre: 'Ryanair', estado: 'bloqueada', web: 'https://www.ryanair.com/' },
    { id: 'serpapi', nombre: 'Google Flights', estado: 'desactivada', web: 'https://serpapi.com/' },
  ];

  it('la cifra de webs es la de las que se consultan, en todas partes', () => {
    assert.equal(numeroWebs({ fuentes }), 3);
  });

  it('la tabla no enlaza el correo, enseña el canal de Telegram y aparta las que están en pausa', () => {
    const html = vistaFuentes({ datos: { fuentes, ofertas: [], generado: '2026-10-09T08:00:00Z' }, ahora: new Date('2026-10-09T10:00:00Z') });
    assert.ok(!html.includes('href="https://mail.google.com'), 'el buzón no es para visitantes');
    assert.match(html, /Correo \(boletines\)/);
    assert.match(html, /href="https:\/\/t\.me\/canal_chollos\/"[^>]*>t\.me\/canal_chollos</);
    assert.match(html, /<h2 id="fuentes-pausa">En pausa<\/h2>[^]*<li><strong>Ryanair<\/strong>[^]*<li><strong>Google Flights<\/strong>/);
    assert.ok(!/<th scope="row">Ryanair/.test(html), 'en pausa no es «con problemas»');
  });
});
