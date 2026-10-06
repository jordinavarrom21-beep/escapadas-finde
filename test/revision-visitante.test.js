/**
 * Lo que vio un visitante nuevo y se arregló: billetes sueltos fuera de Escapadas, Vuelos
 * que empieza por las fechas, el calendario con lo que distingue a cada finde, Puentes solo
 * con ofertas buenas, Inicio sin «Sugerencia de hoy» y una ficha más corta.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buscarEscapadas, esEscapada, esTransporte, leerFiltrosEscapadas, leerFiltrosVuelos, transporteSuelto, ATAJOS_ESCAPADAS } from '../site/js/filtros.js';
import { resultadosVuelos, vistaFinde, vistaPuentes } from '../site/js/vistas.js';
import { contenidoFicha } from '../site/js/plantillas.js';
import { contextoBusqueda } from '../site/js/vistas-comun.js';
import { crearOferta } from '../src/modelo.js';
import { DATOS_PANEL, estadoPanel } from './ayudas-panel.js';

const billete = (campos = {}) => crearOferta({
  id: 'flixbus:bcn-perpinan', fuente: 'flixbus', tipo: 'escapada', titulo: 'Bus Barcelona – Perpiñán el vie 18 sep desde 10,99 €',
  url: 'https://www.flixbus.es/', precio: 10.99, unidad: 'trayecto', transporte: 'bus',
  lugar: { nombre: 'Perpiñán', pais: 'Francia', lat: 42.6986, lon: 2.8956 }, ...campos,
});
const conBillete = (extra = []) => estadoPanel({ ...DATOS_PANEL, ofertas: [...DATOS_PANEL.ofertas, billete(), ...extra] });

describe('billetes sueltos de tren, bus y ferry', () => {
  it('no son escapadas; un paquete con tren y hotel, sí', () => {
    assert.ok(esTransporte(billete()) && !esEscapada(billete()));
    assert.ok(esTransporte(billete({ unidad: null, transporte: 'tren', precio: null })), 'promoción de Renfe sin precio');
    const paquete = billete({ alojamiento: 'hotel', noches: 2, unidad: 'pp' });
    assert.ok(!esTransporte(paquete) && esEscapada(paquete));
    const e = conBillete();
    assert.ok(!buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({}), contextoBusqueda(e)).ofertas.some((o) => o.id === 'flixbus:bcn-perpinan'));
  });

  it('salen en «Vuelos y trenes», plegados en «Tren, bus y ferry», con el texto buscado', () => {
    const e = conBillete();
    const html = resultadosVuelos(e, {});
    assert.match(html, /<details class="seccion seccion-plegable">[^]*?Tren, bus y ferry<\/h2><span class="contador">1<\/span>[^]*?Bus Barcelona – Perpiñán/);
    assert.equal(transporteSuelto(e.datos.ofertas, leerFiltrosVuelos({ q: 'perpiñán' }), contextoBusqueda(e)).length, 1);
    assert.equal(transporteSuelto(e.datos.ofertas, leerFiltrosVuelos({ q: 'oporto' }), contextoBusqueda(e)).length, 0);
  });
});

describe('Vuelos empieza por las fechas', () => {
  it('sin finde elegido, «¿Para cuándo?» con cada finde, cuántos vuelos hay y desde cuánto; con uno elegido, no', () => {
    const e = estadoPanel();
    const html = resultadosVuelos(e, {});
    assert.match(html, /¿Para cuándo\?[^]*?href="#\/vuelos\?finde=2026-09-18"[^]*?atajo__cifra">\d+ · desde [\d,]+\s€/);
    assert.doesNotMatch(resultadosVuelos(e, { finde: e.findes[0].id }), /¿Para cuándo\?/);
    // Lo secundario, plegado: billetes sin fecha y promociones.
    assert.match(html, /<details class="seccion seccion-plegable">\s*<summary><h2>Billetes sin fecha concreta/);
  });
});

describe('Puentes y atajos', () => {
  it('Puentes enseña solo ofertas «Buena» o mejor', () => {
    const e = estadoPanel();
    const html = vistaPuentes(e);
    const ids = [...html.matchAll(/data-descartar="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) {
      const o = e.porId.get(id);
      assert.ok(o.chollazo || o.puntuacion >= 40, `${id}: ${o.puntuacion}`);
    }
  });
  it('«Este finde» ya no es un atajo de Escapadas (está en «¿Cuándo?»)', () => {
    assert.ok(!ATAJOS_ESCAPADAS.some((a) => a.params.cuando));
  });
});

describe('Inicio y ficha', () => {
  it('el Inicio ya no lleva «Sugerencia de hoy»', () => {
    assert.doesNotMatch(vistaFinde(estadoPanel(), {}), /portada__destacado|Sugerencia de hoy/);
  });
  it('la ficha pliega «Organiza el viaje» y explica para quién son «La he reservado» y «Ya no está disponible»', () => {
    const e = estadoPanel();
    const o = e.datos.ofertas.find((x) => (x.enlaces ?? []).length > 1);
    const html = contenidoFicha(o, { fuentes: e.fuentes, temas: e.temas, favoritos: new Set(), misEstados: new Map(), historial: {}, ahora: e.ahora });
    assert.match(html, /<details class="ficha__mas-enlaces">\s*<summary><h3/);
    assert.match(html, /Solo para ti, en este navegador[^]*La he reservado[^]*Ya no está disponible/);
  });
});
