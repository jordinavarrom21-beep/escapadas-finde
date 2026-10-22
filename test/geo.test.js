import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calcularCosteCoche, geolocalizar } from '../src/enriquecer/geo.js';
import { AJUSTES, crearCtx, oferta } from './ayudas.js';

const PROVINCIAS = [
  { IDPovincia: '08', IDCCAA: '09', Provincia: 'BARCELONA', CCAA: 'Cataluña' },
  { IDPovincia: '17', IDCCAA: '09', Provincia: 'GIRONA', CCAA: 'Cataluña' },
];
const ESTACIONES = {
  ResultadoConsulta: 'OK',
  ListaEESSPrecio: [
    { Municipio: 'Abrera', 'Precio Gasolina 95 E5': '1,889', 'Precio Gasoleo A': '1,909' },
    { Municipio: 'Barcelona', 'Precio Gasolina 95 E5': '1,909', 'Precio Gasoleo A': '1,879' },
    { Municipio: 'Vic', 'Precio Gasolina 95 E5': '', 'Precio Gasoleo A': '1,859' },
  ],
};

/** Red simulada del Ministerio: listado de provincias y estaciones de Barcelona. */
function ministerio(url) {
  if (url.endsWith('Listados/Provincias/')) return PROVINCIAS;
  if (url.endsWith('FiltroProvincia/08')) return ESTACIONES;
  throw new Error(`url inesperada: ${url}`);
}

describe('geo: calcularCosteCoche', () => {
  it('usa el precio medio de la provincia del origen y cachea un día', async () => {
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: ministerio });
    const girona = oferta({ cocheKm: 100, lugar: { nombre: 'Girona' } });
    await calcularCosteCoche([girona], ctx);

    // (1,889 + 1,909) / 2 = 1,899 €/l · 2 × 100 km × 6,5 l/100 km = 13 l
    assert.deepEqual(girona.costeCoche, { eur: 24.7, litros: 13 });
    assert.equal(ctx.cache.obtener('carburante:barcelona:gasolina95'), 1.899);
    assert.equal(ctx.cache.obtener('carburante:provincias').length, 2);
    assert.equal(peticiones.length, 2);
    assert.deepEqual(esperas, [1000], 'se espaciaron las dos peticiones');

    const otra = oferta({ cocheKm: 50 });
    await calcularCosteCoche([otra], ctx);
    assert.deepEqual(otra.costeCoche, { eur: 12.3, litros: 6.5 });
    assert.equal(peticiones.length, 2, 'la segunda vuelta sale de la caché');
  });

  it('si el Ministerio falla, usa el precio de los ajustes', async () => {
    const { ctx, logs } = crearCtx();
    const o = oferta({ cocheKm: 100 });
    await calcularCosteCoche([o], ctx);

    assert.deepEqual(o.costeCoche, { eur: 20.2, litros: 13 }, '13 l a 1,55 €/l');
    assert.match(logs[0], /No se ha podido consultar el precio del carburante/);
    assert.equal(ctx.cache.obtener('carburante:barcelona:gasolina95'), undefined);
  });

  it('si el origen no aparece como provincia, tampoco pide las estaciones', async () => {
    const ajustes = { ...AJUSTES, origen: { ...AJUSTES.origen, nombre: 'Sabadell' } };
    const { ctx, peticiones, logs } = crearCtx({ ajustes, respuestas: ministerio });
    const o = oferta({ cocheKm: 100 });
    await calcularCosteCoche([o], ctx);

    assert.deepEqual(o.costeCoche, { eur: 20.2, litros: 13 });
    assert.equal(peticiones.length, 1);
    assert.match(logs[0], /«Sabadell» no aparece como provincia/);
  });

  it('con otro carburante mira el campo que toca', async () => {
    const ajustes = { ...AJUSTES, coche: { ...AJUSTES.coche, carburante: 'gasoleo' } };
    const { ctx } = crearCtx({ ajustes, respuestas: ministerio });
    await calcularCosteCoche([oferta({ cocheKm: 10 })], ctx);

    // (1,909 + 1,879 + 1,859) / 3
    assert.equal(ctx.cache.obtener('carburante:barcelona:gasoleo'), 1.882);
  });

  it('las que ya incluyen tren, bus, avión o ferry no tienen coste de coche', async () => {
    const { ctx } = crearCtx();
    const [bus, tren, ferry, avion, coche, sinTransporte] = ['bus', 'tren', 'ferry', 'avion', 'coche', null]
      .map((transporte) => oferta({ cocheKm: 100, transporte }));
    await calcularCosteCoche([bus, tren, ferry, avion, coche, sinTransporte], ctx);

    for (const o of [bus, tren, ferry, avion]) assert.equal(o.costeCoche, null, o.transporte);
    assert.deepEqual(coche.costeCoche, { eur: 20.2, litros: 13 });
    assert.deepEqual(sinTransporte.costeCoche, { eur: 20.2, litros: 13 });
  });

  it('sin ofertas con kilómetros no se pide nada y el coste queda vacío', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: ministerio });
    const vuelo = oferta({ tipo: 'vuelo', costeCoche: { eur: 99, litros: 99 } });
    await calcularCosteCoche([vuelo], ctx);

    assert.equal(vuelo.costeCoche, null);
    assert.deepEqual(peticiones, []);
  });
});

describe('geo: precio del litro para el panel', () => {
  it('calcularCosteCoche devuelve el precio usado, o null si no había nada que calcular', async () => {
    const { ctx } = crearCtx({ respuestas: ministerio });
    assert.equal(await calcularCosteCoche([oferta({ cocheKm: 100 })], ctx), 1.899);
    assert.equal(await calcularCosteCoche([oferta({ tipo: 'vuelo' })], ctx), null);
  });
});

describe('geo: provincia de las ofertas que traen coordenadas y no la dicen', () => {
  const comaRuga = () => oferta({ lugar: { nombre: 'Coma-Ruga', region: 'Cataluña', pais: 'España', codigoPais: 'ES', comunidad: 'Cataluña', provincia: null, lat: 41.1816, lon: 1.523 } });

  it('se pregunta a Nominatim por el punto, una vez, y entra en la guía de su provincia', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => ({ address: { country_code: 'es', province: 'Tarragona', state: 'Cataluña' } }) });
    const [a, b] = [comaRuga(), comaRuga()];
    await geolocalizar([a, b], ctx);
    assert.equal(a.lugar.provincia, 'Tarragona');
    assert.equal(b.lugar.provincia, 'Tarragona');
    assert.equal(peticiones.length, 1, 'el mismo punto, una sola consulta');
    assert.match(peticiones[0], /\/reverse\?.*&lat=41\.1816&lon=1\.523$/);
    // La siguiente ejecución sale de la caché.
    const otra = crearCtx({ cache: ctx.cache, respuestas: () => { throw new Error('sin red'); } });
    const c = comaRuga();
    await geolocalizar([c], otra.ctx);
    assert.equal(c.lugar.provincia, 'Tarragona');
  });

  it('si la provincia no cuadra con la comunidad que dice la web, no se toca', async () => {
    const { ctx } = crearCtx({ respuestas: () => ({ address: { country_code: 'es', province: 'Huesca', state: 'Aragón' } }) });
    const o = comaRuga();
    await geolocalizar([o], ctx);
    assert.equal(o.lugar.provincia, null);
  });

  it('un fallo de la red no rompe el escaneo ni se guarda', async () => {
    const { ctx, logs } = crearCtx({ respuestas: () => { throw new Error('HTTP 429'); } });
    const o = comaRuga();
    await geolocalizar([o], ctx);
    assert.equal(o.lugar.provincia, null);
    assert.equal(ctx.cache.obtener('provincia:41.182,1.523'), undefined);
    assert.ok(logs.some((l) => l.includes('Coma-Ruga')));
  });
});
