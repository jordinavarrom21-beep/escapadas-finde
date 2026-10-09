/**
 * Agendas por zona (src/enriquecer/agendas.js): Euskadi, Castilla y León, Madrid y
 * Ticketmaster. Las respuestas son extractos reales de cada portal (test/fixtures/eventos-*.json),
 * salvo Ticketmaster, que necesita clave y se simula con su formato documentado.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { castillaLeon, euskadi, evento, madrid, ticketmaster, tipoEvento } from '../src/enriquecer/agendas.js';
import { anadirEventos } from '../src/enriquecer/eventos.js';
import { fechaLocal, findesProximos } from '../src/util/fechas.js';
import { AHORA, crearCtx, leerFixtureJson, oferta } from './ayudas.js';

const EUSKADI = leerFixtureJson('eventos-euskadi.json');
const JCYL = leerFixtureJson('eventos-jcyl.json');
const MADRID = leerFixtureJson('eventos-madrid.json');
const DESDE = '2026-09-18';
const HASTA = '2026-10-18';

describe('tipo de evento', () => {
  test('por la categoría de la fuente o, si no dice, por el nombre', () => {
    assert.equal(tipoEvento('agenda:categories/concerts,agenda:categories/infantil'), 'musica');
    assert.equal(tipoEvento('agenda:categories/fires-i-mercats'), 'ferias');
    assert.equal(tipoEvento('Fiestas de Salinas de Añana'), 'fiestas');
    assert.equal(tipoEvento('Mercado Medieval de Cieza'), 'ferias');
    assert.equal(tipoEvento('Festival de Jazz de Vitoria'), 'festivales', 'un festival de música es un festival');
    assert.equal(tipoEvento('Cuentacuentos para los más pequeños'), 'familia');
    assert.equal(tipoEvento('Northern Cellos'), 'otros');
    assert.equal(tipoEvento(null, undefined, ''), 'otros');
  });

  test('un evento sin lo imprescindible, cancelado o con fin antes del inicio', () => {
    assert.equal(evento({ nombre: '(CANCELADO) Bewitched', desde: '2026-10-01', lat: 43, lon: -3 }), null);
    assert.equal(evento({ nombre: 'Aplazado: concierto', desde: '2026-10-01', lat: 43, lon: -3 }), null);
    assert.equal(evento({ nombre: 'Sin sitio', desde: '2026-10-01', lat: '', lon: -3 }), null, 'una coordenada vacía no es 0');
    assert.equal(evento({ nombre: 'Sin fecha', desde: 'pronto', lat: 43, lon: -3 }), null);
    assert.equal(evento({ nombre: '  ', desde: '2026-10-01', lat: 43, lon: -3 }), null);
    const e = evento({ nombre: ' Fiesta   mayor ', desde: '2026-10-05T00:00:00Z', hasta: '2026-10-01', lat: '43.1', lon: '-3.2' });
    assert.deepEqual([e.nombre, e.desde, e.hasta, e.lat, e.lon, e.tipo], ['Fiesta mayor', '2026-10-05', '2026-10-05', 43.1, -3.2, 'otros']);
  });
});

describe('Euskadi (Kulturklik)', () => {
  test('tipos de la fuente, sin cancelados y con el enlace del evento', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => EUSKADI });
    const eventos = await euskadi.descargar(ctx, DESDE, HASTA);
    assert.match(peticiones[0], /api\.euskadi\.eus\/culture\/events\/v1\.0\/events\/upcoming\?_elements=200&_page=1$/);
    assert.ok(!eventos.some((e) => /CANCELADO/.test(e.nombre)), 'los cancelados no salen');
    const fiestas = eventos.find((e) => e.municipio === 'Añana');
    assert.equal(fiestas.tipo, 'fiestas');
    const bilbao = eventos.find((e) => e.nombre === 'COLECTIVO PANAMERA');
    assert.deepEqual([bilbao.tipo, bilbao.precio, bilbao.url], ['musica', '25 / 27 €', 'http://www.kafeantzokia.eus']);
    assert.equal(eventos.find((e) => /Zinemaldia/.test(e.nombre)).tipo, 'cine');
  });

  test('pide más páginas mientras no pase de la fecha límite (vienen por fecha)', async () => {
    const pagina = (n, fecha) => ({ totalPages: 9, items: [{ ...EUSKADI.items[2], id: String(n), nameEs: `Concierto ${n}`, startDate: `${fecha}T00:00:00Z`, endDate: `${fecha}T00:00:00Z` }] });
    const { ctx, peticiones, esperas } = crearCtx({ respuestas: (u) => (u.endsWith('_page=1') ? pagina(1, '2026-09-20') : u.endsWith('_page=2') ? pagina(2, '2026-10-10') : pagina(3, '2026-10-25')) });
    const eventos = await euskadi.descargar(ctx, DESDE, HASTA);
    assert.equal(peticiones.length, 3, 'la tercera página ya pasa de la fecha y no hay cuarta');
    assert.deepEqual(esperas, [1000, 1000]);
    assert.deepEqual(eventos.map((e) => e.nombre), ['Concierto 1', 'Concierto 2'], 'lo de después de la ventana no se queda');
  });

  test('una respuesta que no es la esperada es un error (lo recoge eventos.js)', async () => {
    const { ctx } = crearCtx({ respuestas: () => ({ error: 'x' }) });
    await assert.rejects(() => euskadi.descargar(ctx, DESDE, HASTA), /respuesta inesperada de Kulturklik/);
  });

  test('cubre Euskadi y Navarra, no Madrid', () => {
    assert.ok(euskadi.zona({ lat: 43.263, lon: -2.935 }), 'Bilbao');
    assert.ok(euskadi.zona({ lat: 42.812, lon: -1.645 }), 'Pamplona');
    assert.ok(!euskadi.zona({ lat: 40.416, lon: -3.703 }), 'Madrid');
  });
});

describe('Castilla y León', () => {
  test('filtra por fechas en el portal, quita las comillas del título y guarda el pueblo', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => JCYL });
    const eventos = await castillaLeon.descargar(ctx, DESDE, HASTA);
    const u = new URL(peticiones[0]);
    assert.match(u.searchParams.get('where'), /fecha_inicio <= date'2026-10-18' AND \(fecha_fin >= date'2026-09-18'/);
    assert.equal(peticiones.length, 1, 'menos de 100 resultados: una sola página');
    const agreda = eventos.find((e) => e.municipio === 'Ágreda');
    assert.equal(agreda.nombre, 'Animalado');
    assert.equal(agreda.tipo, 'familia', 'para público infantil');
    assert.ok(eventos.every((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon)));
  });
});

describe('Madrid', () => {
  test('tipos de la agenda municipal y solo lo que cae en la ventana', async () => {
    const { ctx } = crearCtx({ respuestas: () => MADRID });
    const eventos = await madrid.descargar(ctx, DESDE, HASTA);
    assert.ok(!eventos.some((e) => e.nombre.startsWith('19ª edición Mi Primer Festival')), 'empieza en noviembre: fuera');
    const expo = eventos.find((e) => e.nombre.startsWith('25 años del Museo'));
    assert.deepEqual([expo.tipo, expo.desde, expo.hasta, expo.municipio], ['exposiciones', '2026-07-21', '2027-01-31', 'Madrid']);
  });
});

describe('Ticketmaster', () => {
  const RESPUESTA = {
    page: { totalPages: 1 },
    _embedded: {
      events: [
        { name: 'Festival Jardín de las Delicias', url: 'https://www.ticketmaster.es/event/1', dates: { start: { localDate: '2026-10-03' } }, classifications: [{ segment: { name: 'Music' }, genre: { name: 'Pop' } }], priceRanges: [{ min: 49.5 }], _embedded: { venues: [{ city: { name: 'Madrid' }, location: { latitude: '40.39', longitude: '-3.70' } }] } },
        { name: 'Real Madrid - Valencia CF', url: 'https://www.ticketmaster.es/event/2', dates: { start: { localDate: '2026-10-04' } }, classifications: [{ segment: { name: 'Sports' } }], _embedded: { venues: [{ city: { name: 'Madrid' }, location: { latitude: '40.45', longitude: '-3.69' } }] } },
        // Universe: entradas diarias a un monumento, no un evento. Fuera.
        { name: 'CATEDRAL DE CORIA', url: 'https://www.universe.com/events/catedral-de-coria-tickets-ABC?ref=ticketmaster', dates: { start: { localDate: '2026-10-04' } }, classifications: [{ segment: { name: 'Miscellaneous' } }], _embedded: { venues: [{ city: { name: 'Coria' }, location: { latitude: '39.98', longitude: '-6.53' } }] } },
        { name: 'Sin recinto', dates: { start: { localDate: '2026-10-04' } } },
      ],
    },
  };

  test('sin clave no se usa', () => {
    assert.equal(ticketmaster.activo({ env: {} }), false);
    assert.equal(ticketmaster.activo({ env: { TICKETMASTER_KEY: 'x' } }), true);
  });

  test('con clave: España, por fechas, y cada evento con su tipo, sitio y precio', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => RESPUESTA });
    ctx.env = { TICKETMASTER_KEY: 'clave-de-prueba' };
    const eventos = await ticketmaster.descargar(ctx, DESDE, HASTA);
    const u = new URL(peticiones[0]);
    assert.deepEqual([u.searchParams.get('countryCode'), u.searchParams.get('startDateTime'), u.searchParams.get('endDateTime'), u.searchParams.get('apikey')], ['ES', '2026-09-18T00:00:00Z', '2026-10-18T23:59:59Z', 'clave-de-prueba']);
    assert.equal(u.searchParams.get('source'), null, 'sin «source=ticketmaster»: para España devolvía 0 eventos');
    // Una búsqueda por categoría: así Universe («Miscellaneous») no gasta el cupo de 1.000.
    assert.deepEqual(peticiones.map((x) => new URL(x).searchParams.get('segmentName')), ['Music', 'Arts & Theatre', 'Family', 'Sports', 'Film']);
    assert.equal(peticiones.length, 5, 'una página por categoría: no pide más');
    assert.deepEqual(eventos.slice(0, 2).map((e) => [e.tipo, e.precio, e.municipio]), [['festivales', 'desde 50 €', 'Madrid'], ['deporte', null, 'Madrid']]);
    assert.ok(eventos.every((e) => !/universe\.com/.test(e.url ?? '')), 'los de Universe no entran aunque llegaran');
  });
});

describe('eventos cerca de cada oferta, por zona', () => {
  const BILBAO = { nombre: 'Bilbao', lat: 43.263, lon: -2.935 };
  const contexto = (respuestas) => {
    const c = crearCtx({ respuestas });
    c.ctx.findes = findesProximos(10, AHORA);
    return c;
  };

  test('una escapada en Bilbao recibe los de Kulturklik de esos días, con tipo y distancia', async () => {
    const { ctx, peticiones } = contexto((u) => (u.includes('api.euskadi.eus') ? EUSKADI : (() => { throw new Error(`no debería pedir ${u}`); })()));
    const o = oferta({ lugar: BILBAO, fechas: { salida: '2026-10-01', vuelta: '2026-10-03' } });
    await anadirEventos([o], ctx);
    assert.ok(peticiones.every((u) => u.includes('api.euskadi.eus')), 'solo la agenda de su zona');
    const nombres = o.eventos.map((e) => e.nombre);
    assert.ok(nombres.includes('COLECTIVO PANAMERA'));
    assert.deepEqual([...new Set(o.eventos.map((e) => e.municipio))].sort(), ['Bilbao', 'Getxo'], 'ni Donostia (a 80 km) ni el concierto cancelado de Portugalete');
    assert.ok(o.eventos.every((e) => e.km <= 25), 'nada de Donostia (a 80 km)');
    assert.ok(o.eventos.find((e) => e.nombre === 'COLECTIVO PANAMERA').precio, 'con su precio');
  });

  test('si una agenda falla, las ofertas de esa zona se quedan sin eventos y el escaneo sigue', async () => {
    const { ctx, logs } = contexto(() => { throw new Error('HTTP 503'); });
    const o = oferta({ lugar: BILBAO, fechas: { salida: '2026-10-01', vuelta: '2026-10-03' } });
    await anadirEventos([o], ctx);
    assert.deepEqual(o.eventos, []);
    assert.match(logs.join('\n'), /Kulturklik \(Euskadi\) no disponible \(HTTP 503\): esta vez sin eventos de esa zona/);
  });

  test('Ticketmaster solo se pide con clave', async () => {
    const valencia = oferta({ lugar: { nombre: 'Cáceres', lat: 39.475, lon: -6.372 }, fechas: { salida: '2026-10-01', vuelta: '2026-10-03' } });
    const sin = contexto(() => ({}));
    await anadirEventos([valencia], sin.ctx);
    assert.equal(sin.peticiones.length, 0);
    const con = contexto(() => ({ page: { totalPages: 1 }, _embedded: { events: [] } }));
    con.ctx.env = { TICKETMASTER_KEY: 'x' };
    await anadirEventos([valencia], con.ctx);
    assert.ok(con.peticiones.some((u) => u.includes('app.ticketmaster.com')));
  });

  test('lo guardado por la versión anterior se vuelve a pedir; si falla, vale y sin tipo se saca del nombre', async () => {
    const valencia = oferta({ lugar: { nombre: 'Valencia', lat: 39.47, lon: -0.38 }, fechas: { salida: '2026-10-01', vuelta: '2026-10-03' } });
    const viejo = { nombre: 'Concierto de jazz en el puerto', desde: '2026-10-02', hasta: '2026-10-02', lat: 39.46, lon: -0.33, url: null, municipio: 'Valencia' };
    const fallo = contexto(() => { throw new Error('HTTP 503'); });
    fallo.ctx.env = { TICKETMASTER_KEY: 'x' };
    fallo.ctx.cache.guardar('eventos:ticketmaster', { desde: fechaLocal(AHORA), eventos: [viejo] }, AHORA.getTime());
    await anadirEventos([valencia], fallo.ctx);
    assert.ok(fallo.peticiones.some((u) => u.includes('app.ticketmaster.com')), 'versión 1 guardada: se vuelve a pedir');
    assert.deepEqual(valencia.eventos.map((e) => [e.nombre, e.tipo]), [['Concierto de jazz en el puerto', 'musica']]);
  });
});

describe('panel: filtro y etiqueta de eventos', async () => {
  const { buscarEscapadas, filtrosActivos, leerFiltrosEscapadas } = await import('../site/js/filtros.js');
  const { insigniaEvento, eventos } = await import('../site/js/plantillas.js');
  const base = { tipo: 'hotel', temas: [], puntuacion: 50, precio: 90, etiquetas: [], lugar: { nombre: 'X' }, fechas: { salida: '2026-10-02', vuelta: '2026-10-04' } };
  const ofertas = [
    { ...base, id: 'concierto', eventos: [{ nombre: 'Coro', tipo: 'musica', km: 3, fecha: '2026-10-03' }] },
    { ...base, id: 'expo', eventos: [{ nombre: 'Museo', tipo: 'exposiciones', km: 1, fecha: '2026-10-03' }] },
    { ...base, id: 'nada', eventos: [] },
  ];
  const ids = (p) => buscarEscapadas(ofertas, leerFiltrosEscapadas(p), { origen: { lat: 41.39, lon: 2.17 } }).ofertas.map((o) => o.id).sort();

  test('«con eventos cerca» y por tipo; un tipo inventado no filtra', () => {
    assert.deepEqual(ids({ evtipo: 'todos' }), ['concierto', 'expo']);
    assert.deepEqual(ids({ evtipo: 'musica' }), ['concierto']);
    assert.deepEqual(ids({ evtipo: '<script>' }), ['concierto', 'expo', 'nada']);
    assert.deepEqual(filtrosActivos('escapadas', { evtipo: 'musica' }).map((c) => c.texto), ['Con conciertos cerca']);
  });

  test('la tarjeta prefiere un concierto a una exposición y cuenta los demás; la ficha los da todos', () => {
    const o = { ...base, id: 'x', eventos: [{ nombre: 'Museo', tipo: 'exposiciones', km: 0.3, fecha: '2026-10-03' }, { nombre: 'Coro', tipo: 'musica', km: 3.4, fecha: '2026-10-03' }] };
    assert.match(insigniaEvento(o), /title="Coro · sáb 3 oct · 2 eventos cerca esos días">[^]*Concierto a 3 km el sáb 3 oct \(\+1 plan\)</);
    // Con su municipio, dónde; al lado del alojamiento, su nombre.
    const conMunicipio = { ...o, eventos: [{ ...o.eventos[1], municipio: 'Girona' }, o.eventos[0]] };
    assert.match(insigniaEvento(conMunicipio), />Concierto en Girona el sáb 3 oct \(\+1 plan\)</);
    const alLado = { ...o, eventos: [{ ...o.eventos[1], km: 0.4 }] };
    assert.match(insigniaEvento(alLado), />Concierto en X el sáb 3 oct</);
    assert.equal((eventos(o, { conEnlace: true }).match(/<li class="evento/g) ?? []).length, 2);
    assert.equal(insigniaEvento({ ...o, fechas: {} }), '', 'fechas flexibles sin buscar: nada en la tarjeta');
  });
});
