import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import travelpayouts, { indexarCatalogos, llegadaLocal, parsearPrecios, urlAviasales, urlConsulta } from '../src/fuentes/travelpayouts.js';
import { validarOferta } from '../src/modelo.js';
import { ErrorHttp } from '../src/util/http.js';
import { AJUSTES, crearCtx } from './ayudas.js';
import { readFileSync } from 'node:fs';

const leer = (nombre) => JSON.parse(readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8'));
const catalogos = indexarCatalogos({
  ciudades: leer('travelpayouts-ciudades.json'), aeropuertos: leer('travelpayouts-aeropuertos.json'), paises: leer('travelpayouts-paises.json'),
});
const PRECIOS = leer('travelpayouts-precios.json');
const consulta = { id: 'BCN:2026-10-16:2026-10-18:normal', origen: 'BCN', salida: '2026-10-16', vuelta: '2026-10-18', tipo: 'normal', patron: 'vie-dom', exigirHoraIda: true };
const findes = [{ id: '2026-10-16', viernes: '2026-10-16', sabado: '2026-10-17', domingo: '2026-10-18' }];

describe('travelpayouts: vuelos con fecha de Aviasales', () => {
  it('la consulta pide ida y vuelta desde un aeropuerto a cualquier destino, en euros y ordenada por precio', () => {
    const url = new URL(urlConsulta(consulta));
    assert.equal(url.origin + url.pathname, 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      origin: 'BCN', departure_at: '2026-10-16', return_at: '2026-10-18', one_way: 'false', sorting: 'price', unique: 'false', currency: 'eur', market: 'es', limit: '1000',
    });
    assert.ok(!url.searchParams.has('token'), 'el token va en la cabecera, no en la URL (no queda en registros)');
  });

  it('una oferta por destino (la más barata), sin pasar del precio máximo y con ciudad y país en español', () => {
    const logs = [];
    const ofertas = parsearPrecios(PRECIOS, consulta, catalogos, { ajustes: AJUSTES, marca: '123456', log: (m) => logs.push(m) });
    for (const o of ofertas) assert.deepEqual(validarOferta(o), [], o.id);
    assert.deepEqual(ofertas.map((o) => o.lugar.iata).sort(), ['CIA', 'LGW', 'OPO'], 'París (310 €) pasa del máximo; XXX no tiene enlace');
    assert.match(logs.join('\n'), /XXX[^]*sin enlace/);
    const oporto = ofertas.find((o) => o.lugar.iata === 'OPO');
    assert.equal(oporto.precio, 58, 'la más barata de las dos a Oporto');
    assert.deepEqual([oporto.titulo, oporto.lugar.pais, oporto.lugar.codigoPais, oporto.unidad], ['Oporto', 'Portugal', 'PT', 'i/v']);
    assert.equal(oporto.id, 'travelpayouts:BCN-OPO:2026-10-16:2026-10-18');
    assert.match(oporto.precioTexto, /ida y vuelta por persona \(búsquedas recientes\)/);
    assert.match(oporto.descripcion, /confírmalo al abrir la búsqueda/);
    const roma = ofertas.find((o) => o.lugar.iata === 'CIA');
    assert.deepEqual([roma.titulo, roma.lugar.pais, roma.lugar.lat], ['Roma', 'Italia', 41.799065], 'Ciampino es Roma, con las coordenadas del aeropuerto');
    const londres = ofertas.find((o) => o.lugar.iata === 'LGW');
    assert.deepEqual([londres.titulo, londres.vuelo.directo, londres.vuelo.ida.escalas], ['Londres', false, 1], 'sin Gatwick en el catálogo, la ciudad del billete');
  });

  it('horarios en hora local: la llegada en la zona del destino (Oporto va una hora menos)', () => {
    const [oporto] = parsearPrecios(PRECIOS, consulta, catalogos, { ajustes: AJUSTES });
    assert.deepEqual([oporto.fechas.salida, oporto.fechas.vuelta], ['2026-10-16T19:05:00', '2026-10-18T21:30:00']);
    assert.deepEqual([oporto.vuelo.ida.salida, oporto.vuelo.ida.llegada], ['2026-10-16T19:05:00', '2026-10-16T19:50:00']);
    assert.equal(oporto.vuelo.vuelta.llegada, '2026-10-18T00:15:00'.replace('18T00', '19T00'), 'vuelve pasada la medianoche en Barcelona');
    assert.equal(oporto.vuelo.ida.numero, 'FR6512');
    assert.equal(oporto.vuelo.horarioIdeal, true, 'sale el viernes a las 19:05 y vuelve el domingo a las 21:30');
    assert.equal(llegadaLocal('2026-10-16T19:05:00+02:00', 105, null), null, 'sin zona horaria, sin llegada (la tarjeta enseña la duración)');
  });

  it('el enlace abre la búsqueda en Aviasales con tu marca de afiliado (si la hay)', () => {
    const [oporto] = parsearPrecios(PRECIOS, consulta, catalogos, { ajustes: AJUSTES, marca: '123456' });
    assert.match(oporto.url, /^https:\/\/www\.aviasales\.com\/search\/BCN1610OPO18101\?t=[^&]+&search_date=29092026[^]*&marker=123456$/);
    assert.equal(urlAviasales('/search/X?t=1', null), 'https://www.aviasales.com/search/X?t=1');
    assert.equal(urlAviasales('https://malo.example/x', '1'), null, 'solo rutas de Aviasales');
  });

  it('obtener: catálogos, una consulta por finde y aeropuerto con el token en la cabecera; «reemplazar» solo lo consultado', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: (url) => {
      if (url.endsWith('cities.json')) return leer('travelpayouts-ciudades.json');
      if (url.endsWith('airports.json')) return leer('travelpayouts-aeropuertos.json');
      if (url.endsWith('countries.json')) return leer('travelpayouts-paises.json');
      return PRECIOS;
    } });
    const opciones = [];
    const json = ctx.http.json;
    ctx.http.json = (url, o) => { opciones.push(o); return json(url, o); };
    Object.assign(ctx, { findes, puentes: [], env: { TRAVELPAYOUTS_TOKEN: 'secreto', TRAVELPAYOUTS_MARKER: '999' }, ahora: new Date('2026-10-01T10:00:00Z') });
    const { ofertas, reemplazar } = await travelpayouts.obtener(ctx);
    const consultas = peticiones.filter((u) => u.includes('prices_for_dates'));
    assert.equal(consultas.length, 3, 'BCN, GRO y REU para el finde');
    assert.equal(esperas.length, 2, 'con pausa entre consultas');
    assert.ok(opciones.filter(Boolean).every((o) => o.cabeceras['X-Access-Token'] === 'secreto'));
    assert.ok(ofertas.every((o) => o.url.endsWith('marker=999')));
    assert.equal(reemplazar(ofertas[0]), true);
    assert.equal(reemplazar({ vuelo: { consultaId: 'BCN:2026-11-06:2026-11-08:normal' } }), false, 'lo de otros findes no se toca');
  });

  it('un token mal puesto (401) para enseguida y lo dice; sin token la fuente ni se ejecuta', async () => {
    const { ctx, peticiones, logs } = crearCtx({ respuestas: (url) => {
      if (url.includes('prices_for_dates')) throw new ErrorHttp(401, url);
      return [];
    } });
    Object.assign(ctx, { findes, env: { TRAVELPAYOUTS_TOKEN: 'malo' }, ahora: new Date('2026-10-01T10:00:00Z') });
    await assert.rejects(travelpayouts.obtener(ctx), /Ninguna consulta a Travelpayouts/);
    assert.equal(peticiones.filter((u) => u.includes('prices_for_dates')).length, 1);
    assert.match(logs.join('\n'), /revisa el secreto TRAVELPAYOUTS_TOKEN/);
    assert.deepEqual(travelpayouts.requiere, ['TRAVELPAYOUTS_TOKEN']);
  });
});
