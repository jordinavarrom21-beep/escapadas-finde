/**
 * Revisión del 4 de octubre de 2026 (domingo), con los datos de la web ese día: lo que se
 * propone y se enlaza ha de poder reservarse, cada cifra ha de ser la de la lista que abre y
 * los eventos se ven en la tarjeta y en el filtro sin abrir ninguna ficha.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findesConNoches, findesProximos, nombreFinde, nombreFindeEnFrase, proximoPuente, quedanNoches } from '../site/js/fechas.js';
import { filtrosActivos } from '../site/js/filtros.js';
import { barraFechas } from '../site/js/vistas-comun.js';
import { buscadorFinde, vistaEscapadas } from '../site/js/vistas.js';
import {
  buscarEscapadas, eventosEnBusqueda, filtrarVuelos, leerFiltrosEscapadas, leerFiltrosVuelos, leerRuta, rangoDe, resumenCalendario,
} from '../site/js/filtros.js';
import { contextoBusqueda } from '../site/js/vistas-comun.js';
import { partesPorFechas, resultadosEscapadas, vistaCalendario, vistaMis, vistaAyuda } from '../site/js/vistas.js';
import { insigniaEvento } from '../site/js/plantillas.js';
import { periodoViaje } from '../src/enriquecer/tiempo.js';
import { findesProximos as findesEscaner } from '../src/util/fechas.js';
import { DATOS_PANEL, estadoPanel } from './ayudas-panel.js';

const DOMINGO = new Date('2026-10-04T10:30:00Z');
const PUENTE = { id: 'puente-2026-10-10', nombre: 'Pilar', desde: '2026-10-10', hasta: '2026-10-12', salidas: ['2026-10-09'] };

describe('el domingo, el finde en curso ya no se propone', () => {
  it('no le queda ninguna noche: el primero es el siguiente; el sábado, aún el actual', () => {
    assert.equal(quedanNoches('2026-10-04', '2026-10-04'), false);
    assert.equal(quedanNoches('2026-10-04', '2026-10-03'), true);
    assert.equal(findesConNoches(3, DOMINGO)[0].id, '2026-10-09');
    assert.equal(findesConNoches(3, DOMINGO).length, 3);
    assert.equal(findesConNoches(1, new Date('2026-10-03T20:00:00Z'))[0].id, '2026-10-02', 'sábado: aún queda la noche del sábado');
    // La función común sigue igual que la del escáner (los dos asignan findes a las ofertas).
    assert.deepEqual(findesProximos(2, DOMINGO), findesEscaner(2, DOMINGO));
  });

  it('el domingo se llama «El próximo finde» en todas partes; el resto de días, «Este finde»', () => {
    assert.equal(nombreFinde('2026-10-04'), 'El próximo finde');
    assert.equal(nombreFinde('2026-10-03'), 'Este finde');
    assert.equal(nombreFinde('2026-10-05'), 'Este finde');
    assert.equal(nombreFindeEnFrase('2026-10-04'), 'el próximo finde');
    const e = estadoPanel(DATOS_PANEL, { hoy: '2026-09-20' }); // domingo
    assert.match(buscadorFinde(e), /<small>El próximo finde<\/small>/);
    assert.match(barraFechas(e, 'escapadas', { cuando: 'finde' }), /aria-pressed="true">El próximo finde ·/);
    assert.deepEqual(filtrosActivos('escapadas', { cuando: 'finde' }, { hoy: e.hoy }).map((c) => c.texto), ['El próximo finde']);
    assert.match(vistaEscapadas(e, {}), /El próximo finde ·/);
    assert.ok(!/Este finde/.test(buscadorFinde(e)));
    assert.match(buscadorFinde(estadoPanel()), /<small>Este finde<\/small>/, 'el viernes, «Este finde»');
  });

  it('el puente tampoco el día que termina', () => {
    assert.equal(proximoPuente([PUENTE], '2026-10-11')?.id, PUENTE.id);
    assert.equal(proximoPuente([PUENTE], '2026-10-12'), null);
  });

  it('el escáner da a las ofertas flexibles el tiempo y los eventos del finde siguiente, no del que acaba hoy', () => {
    const findes = findesEscaner(3, DOMINGO);
    const flexible = { fechas: {} };
    assert.deepEqual(periodoViaje(flexible, { findes, puentes: [], ahora: DOMINGO }), { desde: '2026-10-09', hasta: '2026-10-11' });
    assert.deepEqual(periodoViaje(flexible, { findes, puentes: [], ahora: new Date('2026-10-02T10:00:00Z') }), { desde: '2026-10-02', hasta: '2026-10-04' }, 'el viernes, el actual');
  });
});

describe('Calendario: cada cifra es la de la lista que abre', () => {
  const e = estadoPanel();
  const ctx = contextoBusqueda(e);
  it('cuenta con las mismas búsquedas (sin cruceros, duplicadas ni descartadas) y solo los findes que la web conoce', () => {
    const html = vistaCalendario(e);
    // «3 escapadas con fecha» o, sin ninguna con fecha ese finde, «Ver escapadas»: las flexibles valen
    // para todos los findes y su número se repetía en cada celda.
    const celdas = [...html.matchAll(/href="(#\/escapadas\?cuando=[^"]+)"[^>]*>(?:<svg[^]*?<\/svg>)?<span>(?:([\d.]+) escapadas? con fecha|Ver escapadas)<\/span>/g)];
    assert.equal(celdas.length, e.findes.length, 'ni un finde más de los que conocen las listas');
    const numero = (n) => Number((n ?? '0').replace('.', ''));
    for (const [, href, conFecha] of celdas) {
      const { params } = leerRuta(href);
      const lista = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas(params), ctx).ofertas;
      assert.equal(numero(conFecha), lista.filter((o) => o.fechas?.salida).length, href);
    }
    const resumen = resumenCalendario(e.datos.ofertas, e.findes, e.datos.puentes, ctx);
    for (const r of resumen) assert.equal(r.vuelos, filtrarVuelos(e.datos.ofertas, leerFiltrosVuelos({ finde: r.finde.id }), ctx).length);
    assert.match(html, new RegExp(`Los próximos ${e.findes.length} findes`));
  });
});

describe('Escapadas: primero las que tienen fechas del periodo elegido', () => {
  const e = estadoPanel();
  const ctx = contextoBusqueda(e);
  it('con el puente: las que caben, luego las que se salen un poco y al final las flexibles (y suman la lista)', () => {
    const params = { cuando: e.puente.id };
    const { ofertas } = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas(params), ctx);
    const partes = partesPorFechas(leerFiltrosEscapadas(params), ofertas, rangoDe(params.cuando, ctx));
    assert.ok(partes.caben.length > 0, 'la fixture tiene alguna con fechas del puente');
    assert.equal(partes.caben.length + partes.alrededor.length + partes.flexibles.length, ofertas.length);
    assert.ok(partes.caben.every((o) => o.fechas.salida) && partes.flexibles.every((o) => !o.fechas?.salida));
    const html = resultadosEscapadas(e, params);
    const primera = html.indexOf('Con fechas en ese puente');
    assert.ok(primera > 0 && primera < html.indexOf('De fechas flexibles'), 'primero las del puente');
    // Las tarjetas del primer bloque son las que caben, en el orden elegido.
    const bloque = html.slice(primera, html.indexOf('De fechas flexibles'));
    const ids = [...bloque.matchAll(/data-ficha="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(ids)], partes.caben.slice(0, 12).map((o) => o.id));
  });
  it('sin fechas elegidas, filtrando solo las de fechas cerradas o sin ninguna cerrada: la lista de siempre', () => {
    assert.equal(partesPorFechas(leerFiltrosEscapadas({}), [{ fechas: { salida: '2026-10-09' } }], null), null);
    assert.equal(partesPorFechas(leerFiltrosEscapadas({ cuando: 'finde', cerradas: '1' }), [{ fechas: { salida: '2026-10-09' } }], null), null);
    assert.equal(partesPorFechas(leerFiltrosEscapadas({ cuando: 'finde' }), [{ fechas: {} }], null), null);
    assert.ok(!/De fechas flexibles/.test(resultadosEscapadas(e, {})));
  });
});

describe('eventos: en la tarjeta y en el filtro sin abrir ninguna ficha', () => {
  const ev = (fecha, tipo = 'musica', km = 3) => ({ nombre: `Concierto ${fecha}`, fecha, tipo, km });
  const flexible = { id: 'f', fechas: {}, eventos: [ev('2026-10-03'), ev('2026-10-10', 'fiestas')] };
  const cerrada = { id: 'c', fechas: { salida: '2026-10-09', vuelta: '2026-10-11', findeId: '2026-10-09' }, eventos: [ev('2026-10-10')] };
  const ctx = { finde: { id: '2026-10-09', viernes: '2026-10-09', domingo: '2026-10-11' }, findes: [], puente: PUENTE, puentes: [PUENTE] };

  it('el filtro cuenta en una flexible solo los eventos de las fechas que buscas (antes, los de cualquier finde)', () => {
    assert.deepEqual(eventosEnBusqueda(flexible, leerFiltrosEscapadas({ cuando: PUENTE.id }), ctx).map((x) => x.fecha), ['2026-10-10']);
    assert.deepEqual(eventosEnBusqueda(flexible, leerFiltrosEscapadas({ desde: '2026-10-01', hasta: '2026-10-05' }), ctx).map((x) => x.fecha), ['2026-10-03']);
    assert.equal(eventosEnBusqueda(flexible, leerFiltrosEscapadas({}), ctx).length, 2, 'sin fechas, todos');
    assert.equal(eventosEnBusqueda(cerrada, leerFiltrosEscapadas({ cuando: PUENTE.id }), ctx).length, 1, 'con fechas cerradas, los suyos');
  });

  it('filtrando por eventos, la tarjeta de una flexible enseña el suyo con su día; si no, no (es una suposición)', () => {
    assert.equal(insigniaEvento(flexible, {}), '');
    const conFiltro = insigniaEvento(flexible, { conEventos: true, tipoEvento: 'fiestas' });
    assert.match(conFiltro, /Fiestas a 3 km si vas el sáb 10 oct \(\+1 plan\)</);
    assert.match(insigniaEvento(cerrada, {}), /Concierto a 3 km el sáb 10 oct</, 'con fechas cerradas, siempre y sin «si vas»');
  });

  it('con los datos publicados (eventos ligeros en ofertas.json) el filtro encuentra ofertas', () => {
    const e = estadoPanel();
    const conEventos = e.datos.ofertas.filter((o) => o.eventos?.length);
    if (!conEventos.length) return; // la fixture del panel puede no traerlos
    const { ofertas } = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ evtipo: 'todos' }), contextoBusqueda(e));
    assert.ok(ofertas.length > 0);
  });
});

describe('Guardados y Cómo funciona', () => {
  it('los favoritos que ya no se publican se cuentan, no desaparecen sin más', () => {
    const e = estadoPanel(DATOS_PANEL, { favoritos: new Set(['ya-no-esta:1', 'tampoco:2', DATOS_PANEL.ofertas[0].id]) });
    assert.match(vistaMis(e), /2 favoritos ya no se publican: la oferta terminó o su web la quitó/);
    assert.ok(!/ya no se publica/.test(vistaMis(estadoPanel(DATOS_PANEL, { favoritos: new Set([DATOS_PANEL.ofertas[0].id]) }))));
  });
  it('la privacidad cuenta todo lo que sale del navegador: Photon, OpenStreetMap, OSRM y cdnjs', () => {
    const html = vistaAyuda(estadoPanel());
    for (const servicio of ['Photon', 'OpenStreetMap', 'OSRM', 'cdnjs']) assert.match(html, new RegExp(servicio));
  });
});
