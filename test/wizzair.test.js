import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import wizzair, { cuerpoCalendario, diasDeCalendario, ofertaDeRuta, rutasDesde, tramosDeFechas, versionDePortada } from '../src/fuentes/wizzair.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { AJUSTES, crearCtx, leerFixtureJson } from './ayudas.js';

const MAPA = leerFixtureJson('wizzair-mapa.json');
const CALENDARIO = leerFixtureJson('wizzair-calendario.json');
const consulta = { id: 'BCN:2026-10-16:2026-10-18:normal', origen: 'BCN', salida: '2026-10-16', vuelta: '2026-10-18', tipo: 'normal', patron: 'vie-dom', exigirHoraIda: true };
const HASTA_200 = { ...AJUSTES, vuelos: { ...AJUSTES.vuelos, precioMax: 200 } };
const findes = [{ id: '2026-10-16', viernes: '2026-10-16', sabado: '2026-10-17', domingo: '2026-10-18' }];
const PORTADA = '<script src="https://be.wizzair.com/29.18.0/Api/asset/x.js"></script>';

describe('wizzair: vuelos con fecha, gratis y sin registro', () => {
  it('lee la versión de la API de la portada', () => {
    assert.equal(versionDePortada(PORTADA), '29.18.0');
    assert.equal(versionDePortada('<html></html>'), null);
  });

  it('rutas directas desde cada aeropuerto, sin códigos de área ni vuelos con escala', () => {
    const rutas = rutasDesde(MAPA, ['BCN', 'GRO']);
    assert.deepEqual(rutas.BCN.map((r) => r.iata), ['BUD', 'BGY'], 'MIL es el área de Milán y TIA va con escala');
    assert.deepEqual(rutas.GRO, []);
    assert.deepEqual(rutas.BCN[0], { iata: 'BUD', ciudad: 'Budapest', pais: 'Hungría', codigoPais: 'HU', lat: 47.436944, lon: 19.261111 });
  });

  it('las fechas se piden en tramos de como mucho 42 días que cubren todos los viajes', () => {
    const tramos = tramosDeFechas([{ salida: '2026-10-16', vuelta: '2026-10-18' }, { salida: '2026-12-18', vuelta: '2026-12-20' }]);
    assert.deepEqual(tramos, [{ desde: '2026-10-16', hasta: '2026-11-26' }, { desde: '2026-11-27', hasta: '2026-12-20' }]);
    assert.deepEqual(cuerpoCalendario('BCN', 'BUD', tramos[0]).flightList.map((f) => `${f.departureStation}-${f.arrivalStation}`), ['BCN-BUD', 'BUD-BCN']);
  });

  it('una oferta por finde y destino con la suma de las tarifas más bajas y las horas de cada día', () => {
    const dias = diasDeCalendario(CALENDARIO);
    assert.deepEqual(dias.ida['2026-10-16'].horas, ['2026-10-16T10:10:00', '2026-10-16T17:10:00', '2026-10-16T20:55:00']);
    const budapest = rutasDesde(MAPA, ['BCN']).BCN[0];
    const oferta = ofertaDeRuta(consulta, budapest, dias, HASTA_200);
    assert.deepEqual(validarOferta(oferta), []);
    assert.equal(oferta.precio, 160.33, '35,34 € la ida del viernes + 124,99 € la vuelta del domingo');
    assert.equal(oferta.precioAnterior, 164.98);
    assert.equal(oferta.id, 'wizzair:BCN-BUD:2026-10-16:2026-10-18');
    assert.deepEqual([oferta.titulo, oferta.lugar.pais, oferta.unidad], ['Budapest', 'Hungría', 'i/v']);
    assert.deepEqual([oferta.vuelo.ida.salida, oferta.vuelo.vuelta.salida], ['2026-10-16T20:55:00', '2026-10-18T17:30:00'], 'la última salida de cada día');
    assert.equal(oferta.vuelo.horarioIdeal, true);
    assert.match(oferta.descripcion, /salidas: 10:10, 17:10, 20:55/);
    assert.equal(oferta.url, 'https://wizzair.com/es-es/booking/select-flight/BCN/BUD/2026-10-16/2026-10-18/1/0/0/null');
    const caro = { ...AJUSTES, vuelos: { ...AJUSTES.vuelos, precioMax: 150 } };
    assert.equal(ofertaDeRuta(consulta, budapest, dias, caro), null, 'pasa del precio máximo');
    assert.equal(ofertaDeRuta({ ...consulta, vuelta: '2026-10-25' }, budapest, dias, HASTA_200), null, 'sin vuelo de vuelta ese día');
  });

  it('obtener: versión, mapa y un POST por ruta con pausa; «reemplazar» solo las rutas consultadas', async () => {
    const cuerpos = [];
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: (url) => {
      if (url === 'https://wizzair.com/es-es') return PORTADA;
      if (url.includes('/Api/asset/map')) return MAPA;
      return CALENDARIO;
    } });
    const json = ctx.http.json;
    ctx.http.json = (url, o) => { if (o?.cuerpo) cuerpos.push(o.cuerpo); return json(url, o); };
    Object.assign(ctx, { ajustes: HASTA_200, findes, puentes: [], ahora: new Date('2026-10-01T10:00:00Z') });
    const { ofertas, reemplazar } = await wizzair.obtener(ctx);
    assert.equal(peticiones.filter((u) => u.endsWith('/29.18.0/Api/search/timetable')).length, 2, 'BUD y BGY desde BCN');
    assert.equal(esperas.length, 1);
    assert.equal(cuerpos[0].flightList[0].from, '2026-10-16');
    assert.ok(ofertas.length >= 1);
    assert.equal(reemplazar(ofertas[0]), true);
    assert.equal(reemplazar({ vuelo: { origen: 'REU', destino: 'BUD' } }), false);
  });

  it('un bloqueo (403) para enseguida; si ninguna ruta funciona, la fuente falla', async () => {
    const { ctx, peticiones, logs } = crearCtx({ respuestas: (url) => {
      if (url === 'https://wizzair.com/es-es') return PORTADA;
      if (url.includes('/Api/asset/map')) return MAPA;
      throw new ErrorHttp(403, url);
    } });
    Object.assign(ctx, { findes, ahora: new Date('2026-10-01T10:00:00Z') });
    await assert.rejects(wizzair.obtener(ctx), /Ninguna consulta a Wizz Air/);
    assert.equal(peticiones.filter((u) => u.includes('timetable')).length, 1);
    assert.match(logs.join('\n'), /bloqueado o limitado/);
  });
});
