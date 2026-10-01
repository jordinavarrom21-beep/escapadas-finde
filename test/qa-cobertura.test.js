/**
 * QA: casos límite de lo que menos cubrían las pruebas (memoria del navegador, rutas por
 * carretera, periodos y encaje, motivos de la nota y tiempos en coche). Cada `describe`
 * prepara su propio almacenamiento falso: ninguna prueba depende de otra.
 */
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as local from '../site/js/local.js';
import { LOTE_RUTAS, PAUSA_RUTAS_MS, clavePunto, destinosSinRuta, pedirRutas } from '../site/js/rutas.js';
import { conPeriodo, encajeEnRango, leerFiltrosComunes, periodoDeParams, rangoDe, salidaPuente } from '../site/js/filtros.js';
import { MAXIMOS, motivoPrincipal, motivosNota } from '../site/js/nota.js';
import { minutosEnCoche } from '../site/js/geo.js';

// ── Almacenamiento falso ─────────────────────────────────────────────────────

/** localStorage/sessionStorage en memoria; `roto` hace que lancen como en modo privado. */
function almacen({ roto = false } = {}) {
  const datos = new Map();
  const fallar = () => { throw new DOMException('QuotaExceededError'); };
  return {
    datos,
    getItem: roto ? fallar : (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: roto ? fallar : (k, v) => datos.set(k, String(v)),
  };
}

let originales;
beforeEach(() => { originales = [globalThis.localStorage, globalThis.sessionStorage]; });
afterEach(() => { [globalThis.localStorage, globalThis.sessionStorage] = originales; });

const usar = (opciones) => {
  globalThis.localStorage = almacen(opciones);
  globalThis.sessionStorage = almacen(opciones);
  return globalThis.localStorage.datos;
};

describe('local.js: sin almacenamiento (modo privado, cuota llena)', () => {
  it('ninguna lectura ni escritura lanza: se devuelven los valores por defecto', () => {
    usar({ roto: true });
    assert.deepEqual([...local.cargarFavoritos()], []);
    assert.deepEqual(local.cargarBusquedas(), []);
    assert.equal(local.cargarFiltros('escapadas'), null);
    assert.equal(local.cargarSalida(), null);
    assert.equal(local.cargarPeriodo(), null);
    assert.equal(local.cargarRutas('41.979,2.821').size, 0);
    assert.doesNotThrow(() => {
      local.guardarFavoritos(new Set(['a']));
      local.guardarFiltros('escapadas', { temas: 'spa' });
      local.guardarRutas('x', new Map([['a', { min: 1, km: 1 }]]));
      local.guardarPeriodo({ cuando: 'finde' });
    });
    assert.equal(local.esPropietarioGuardado(), false);
  });

  it('la visita anterior sin almacenamiento es null y no rompe', () => {
    usar({ roto: true });
    assert.equal(local.tomarVisitaAnterior(new Date('2026-10-01T10:00:00Z')), null);
  });
});

describe('local.js: datos corruptos o manipulados', () => {
  it('JSON roto o de otro tipo no se cuela', () => {
    const d = usar();
    d.set('escapadas:favoritos', '{no es json');
    d.set('escapadas:descartadas', '{"a":1}');
    d.set('escapadas:busquedas', '"texto"');
    assert.deepEqual([...local.cargarFavoritos()], []);
    assert.deepEqual([...local.cargarDescartadas()], []);
    assert.deepEqual(local.cargarBusquedas(), []);
  });

  it('marcas propias: solo estados conocidos', () => {
    const d = usar();
    d.set('escapadas:misEstados', JSON.stringify({ a: 'reservada', b: 'no-disponible', c: 'hackeada', d: 5 }));
    assert.deepEqual([...local.cargarMisEstados()], [['a', 'reservada'], ['b', 'no-disponible']]);
    d.set('escapadas:misEstados', '["a"]');
    assert.equal(local.cargarMisEstados().size, 0, 'una lista no es un mapa de estados');
  });

  it('comparar: como mucho tres y solo textos', () => {
    const d = usar();
    d.set('escapadas:comparar', JSON.stringify(['a', 2, 'b', null, 'c', 'd']));
    assert.deepEqual([...local.cargarComparar()], ['a', 'b', 'c']);
    assert.equal(local.MAX_COMPARAR, 3);
  });

  it('filtros: solo valores de texto no vacíos; sin nada útil, null', () => {
    const d = usar();
    d.set('escapadas:filtros', JSON.stringify({ escapadas: { temas: 'spa', max: 90, q: '', x: { y: 1 } }, vuelos: ['a'] }));
    assert.deepEqual(local.cargarFiltros('escapadas'), { temas: 'spa' });
    assert.equal(local.cargarFiltros('vuelos'), null);
    assert.equal(local.cargarFiltros('inexistente'), null);
  });

  it('guardar filtros vacíos olvida los de esa vista y respeta las demás', () => {
    usar();
    local.guardarFiltros('escapadas', { temas: 'spa' });
    local.guardarFiltros('vuelos', { aero: 'BCN' });
    local.guardarFiltros('escapadas', {});
    assert.equal(local.cargarFiltros('escapadas'), null);
    assert.deepEqual(local.cargarFiltros('vuelos'), { aero: 'BCN' });
  });

  it('periodo: un «cuando» con caracteres raros o fechas mal formadas se limpia', () => {
    const d = usar();
    d.set('escapadas:periodo', JSON.stringify({ cuando: '<script>', desde: '2026-13-99x', hasta: 7 }));
    assert.deepEqual(local.cargarPeriodo(), { cuando: '', desde: '', hasta: '' });
    d.set('escapadas:periodo', JSON.stringify({ cuando: '2026-10-10', desde: '2026-10-09', hasta: '2026-10-12' }));
    assert.deepEqual(local.cargarPeriodo(), { cuando: '2026-10-10', desde: '2026-10-09', hasta: '2026-10-12' });
    d.set('escapadas:periodo', 'null');
    assert.equal(local.cargarPeriodo(), null);
  });
});

describe('local.js: búsquedas guardadas', () => {
  it('mismo nombre reemplaza (no duplica) y la última va primero', () => {
    usar();
    local.guardarBusqueda({ nombre: 'Spa', vista: 'escapadas', hash: '#/escapadas?temas=spa' }, new Date('2026-10-01T10:00:00Z'));
    local.guardarBusqueda({ nombre: 'Rural', vista: 'escapadas', hash: '#/escapadas?temas=rural' });
    const lista = local.guardarBusqueda({ nombre: 'Spa', vista: 'escapadas', hash: '#/escapadas?temas=spa&h=2' });
    assert.deepEqual(lista.map((b) => b.nombre), ['Spa', 'Rural']);
    assert.equal(lista[0].hash, '#/escapadas?temas=spa&h=2');
  });

  it('no guarda más de 12: la más antigua se pierde', () => {
    usar();
    for (let i = 0; i < 14; i++) local.guardarBusqueda({ nombre: `b${i}`, vista: 'escapadas', hash: `#/escapadas?q=${i}` });
    const lista = local.cargarBusquedas();
    assert.equal(lista.length, 12);
    assert.equal(lista[0].nombre, 'b13');
    assert.ok(!lista.some((b) => b.nombre === 'b0' || b.nombre === 'b1'));
  });

  it('marcar como vista solo cambia esa; borrar una que no existe no toca nada', () => {
    usar();
    local.guardarBusqueda({ nombre: 'A', vista: 'escapadas', hash: '#/escapadas' }, new Date('2026-09-01T00:00:00Z'));
    local.guardarBusqueda({ nombre: 'B', vista: 'vuelos', hash: '#/vuelos' }, new Date('2026-09-01T00:00:00Z'));
    local.marcarBusquedaVista('A', new Date('2026-10-01T00:00:00Z'));
    const [b, a] = local.cargarBusquedas();
    assert.equal(a.visto, '2026-10-01T00:00:00.000Z');
    assert.equal(b.visto, '2026-09-01T00:00:00.000Z');
    assert.equal(local.borrarBusqueda('Z').length, 2);
    assert.deepEqual(local.borrarBusqueda('A').map((x) => x.nombre), ['B']);
  });
});

describe('local.js: visita anterior', () => {
  it('la primera vez null; recargar en la misma sesión devuelve la misma referencia', () => {
    usar();
    assert.equal(local.tomarVisitaAnterior(new Date('2026-10-01T10:00:00Z')), null);
    assert.equal(local.tomarVisitaAnterior(new Date('2026-10-01T11:00:00Z')), null, 'misma sesión: sigue sin anterior');
    globalThis.sessionStorage = almacen(); // sesión nueva, mismo localStorage
    assert.equal(local.tomarVisitaAnterior(new Date('2026-10-02T10:00:00Z')), '2026-10-01T10:00:00.000Z');
  });
});

describe('local.js: copia de seguridad', () => {
  it('ida y vuelta: lo exportado se recupera igual en otro navegador', () => {
    usar();
    local.guardarFavoritos(new Set(['a', 'b']));
    local.guardarFiltros('escapadas', { temas: 'spa' });
    local.guardarPropietario(true);
    const copia = local.exportarGuardados(new Date('2026-10-01T00:00:00Z'));
    assert.equal(copia.formato, 'escapadas-finde/guardados');
    assert.ok(!('escapadas:propietario' in copia.datos), 'el modo propietario no viaja en la copia');
    usar();
    assert.ok(local.importarGuardados(JSON.parse(JSON.stringify(copia))) >= 2);
    assert.deepEqual([...local.cargarFavoritos()], ['a', 'b']);
    assert.deepEqual(local.cargarFiltros('escapadas'), { temas: 'spa' });
    assert.equal(local.esPropietarioGuardado(), false);
  });

  it('rechaza lo que no es una copia y no escribe claves ajenas ni valores que no son texto', () => {
    const d = usar();
    for (const malo of [null, {}, { formato: 'otro', datos: {} }, { formato: 'escapadas-finde/guardados' }, { formato: 'escapadas-finde/guardados', datos: 'x' }]) {
      assert.throws(() => local.importarGuardados(malo), /no es una copia/);
    }
    const n = local.importarGuardados({ formato: 'escapadas-finde/guardados', datos: { 'escapadas:propietario': '1', 'otra:clave': 'x', 'escapadas:favoritos': ['no', 'texto'] } });
    assert.equal(n, 0);
    assert.equal(d.size, 0);
  });
});

describe('local.js: rutas por carretera guardadas', () => {
  const HOY = new Date('2026-10-01T10:00:00Z');
  it('solo valen para la misma salida y menos de 30 días', () => {
    usar();
    local.guardarRutas('41.979,2.821', new Map([['a', { min: 10, km: 12 }]]), HOY);
    assert.equal(local.cargarRutas('41.979,2.821', new Date('2026-10-30T09:00:00Z')).size, 1);
    assert.equal(local.cargarRutas('41.979,2.821', new Date('2026-10-31T10:00:01Z')).size, 0);
    assert.equal(local.cargarRutas('41.980,2.821', HOY).size, 0);
  });

  it('una fecha ilegible o rutas sin números se descartan', () => {
    const d = usar();
    d.set('escapadas:rutas', JSON.stringify({ desde: 'x', fecha: 'ayer', rutas: { a: { min: 1, km: 1 } } }));
    assert.equal(local.cargarRutas('x', HOY).size, 0);
    d.set('escapadas:rutas', JSON.stringify({ desde: 'x', fecha: HOY.toISOString(), rutas: { a: { min: 1, km: 1 }, b: { min: 'x', km: 1 }, c: null } }));
    assert.deepEqual([...local.cargarRutas('x', HOY).keys()], ['a']);
  });
});

// ── Rutas por carretera (OSRM) ───────────────────────────────────────────────

describe('rutas.js', () => {
  const SALIDA = { lat: 41.9794, lon: 2.8214 };
  const destinos = (n) => new Map(Array.from({ length: n }, (_, i) => [`d${i}`, { lat: 41 + i / 100, lon: 1 }]));
  const osrm = (url) => {
    const n = url.split('?')[0].split(';').length - 1;
    return { code: 'Ok', durations: [[0, ...Array(n).fill(600)]], distances: [[0, ...Array(n).fill(10_000)]] };
  };

  it('exactamente un lote: una petición y ninguna pausa; uno más: dos peticiones y una pausa', async () => {
    for (const [n, peticiones, pausas] of [[LOTE_RUTAS, 1, 0], [LOTE_RUTAS + 1, 2, 1]]) {
      const pedidas = []; const esperas = [];
      await pedirRutas(SALIDA, destinos(n), { pedir: async (u) => { pedidas.push(u); return osrm(u); }, esperar: async (ms) => esperas.push(ms) });
      assert.equal(pedidas.length, peticiones, `${n} destinos`);
      assert.deepEqual(esperas, Array(pausas).fill(PAUSA_RUTAS_MS));
    }
  });

  it('sin destinos no pide nada', async () => {
    let pedidas = 0;
    const r = await pedirRutas(SALIDA, new Map(), { pedir: async () => { pedidas++; return {}; } });
    assert.equal(pedidas, 0);
    assert.equal(r.size, 0);
  });

  it('respuestas con error, vacías o con huecos no inventan rutas', async () => {
    // Un error que aun así trae números («NoRoute» con tabla a medias) tampoco vale.
    for (const respuesta of [{ code: 'TooBig' }, { code: 'NoRoute', durations: [[0, 600]], distances: [[0, 10_000]] }, null, { code: 'Ok' }, { code: 'Ok', durations: [[0, null]], distances: [[0, 5000]] }]) {
      const r = await pedirRutas(SALIDA, destinos(1), { pedir: async () => respuesta });
      assert.equal(r.size, 0, JSON.stringify(respuesta));
    }
  });

  it('si falla un lote, los demás siguen', async () => {
    let n = 0;
    const r = await pedirRutas(SALIDA, destinos(LOTE_RUTAS + 3), { pedir: async (u) => { n += 1; if (n === 1) throw new Error('503'); return osrm(u); } });
    assert.equal(r.size, 3);
  });

  it('convierte segundos a minutos y metros a km redondeando', async () => {
    const r = await pedirRutas(SALIDA, destinos(1), { pedir: async () => ({ code: 'Ok', durations: [[0, 5430]], distances: [[0, 163_499]] }) });
    assert.deepEqual(r.get('d0'), { min: 91, km: 163 });
  });

  it('las coordenadas van como lon,lat con 5 decimales y la salida primero', async () => {
    let url = '';
    await pedirRutas({ lat: '41.97941234', lon: 2.8 }, new Map([['a', { lat: 41.1, lon: 1.25 }]]), { pedir: async (u) => { url = u; return osrm(u); } });
    assert.match(url, /driving\/2\.80000,41\.97941;1\.25000,41\.10000\?/);
  });

  it('la clave de un punto redondea a unos 100 m y acepta textos numéricos', () => {
    assert.equal(clavePunto({ lat: '41.97949', lon: 2.82141 }), '41.979,2.821');
    assert.equal(clavePunto({ lat: 41.97912, lon: 2.82118 }), clavePunto({ lat: 41.97938, lon: 2.82136 }), 'a unos 30 m, el mismo sitio');
    assert.notEqual(clavePunto({ lat: 41.979, lon: 2.821 }), clavePunto({ lat: 41.981, lon: 2.821 }), 'a 200 m, otro');
  });

  it('no pide destinos sin tiempo en coche, sin coordenadas o a más de 1.200 km', () => {
    const ofertas = [
      { id: 'cerca', lugar: { lat: 41.1, lon: 1.2 } },
      { id: 'lejos', lugar: { lat: 52.5, lon: 13.4 } },
      { id: 'isla', lugar: { lat: 39.6, lon: 2.6 } },
      { id: 'sin', lugar: { nombre: 'X' } },
    ];
    const distancias = new Map([['cerca', { minutos: 90 }], ['lejos', { minutos: 900 }], ['isla', { minutos: null }], ['sin', { minutos: 10 }]]);
    assert.deepEqual([...destinosSinRuta(ofertas, distancias, SALIDA).keys()], ['41.100,1.200']);
  });
});

// ── Periodos y encaje ────────────────────────────────────────────────────────

describe('periodos y encaje (casos límite)', () => {
  const PUENTE = { id: 'p', desde: '2026-12-05', hasta: '2026-12-08' };
  const ctx = { finde: null, findes: [], puente: PUENTE, puentes: [PUENTE] };
  const viaje = (salida, vuelta) => ({ fechas: { salida, vuelta } });

  it('«este finde» sin findes conocidos o un id que no existe: sin periodo', () => {
    assert.equal(rangoDe('finde', ctx), null);
    assert.equal(rangoDe('2030-01-01', ctx), null);
    assert.equal(rangoDe(undefined, ctx), null);
  });

  it('sin «salidas», el puente empieza el día anterior a su primer día libre', () => {
    assert.equal(salidaPuente(PUENTE), '2026-12-04');
    assert.equal(salidaPuente({ ...PUENTE, salidas: [] }), '2026-12-04', 'una lista vacía no deja el puente sin salida');
  });

  it('se sale por los dos lados a la vez y con varios días, y lo dice en plural', () => {
    const r = rangoDe('p', ctx);
    assert.deepEqual(encajeEnRango(viaje('2026-12-01', '2026-12-10'), r), { cabe: false, motivos: ['sale 3 días antes', 'vuelve 2 días después'] });
  });

  it('sin vuelta cuenta la salida; las horas no cambian el día', () => {
    const r = rangoDe('p', ctx);
    assert.equal(encajeEnRango({ fechas: { salida: '2026-12-08T23:59:00' } }, r).cabe, true);
    assert.equal(encajeEnRango({ fechas: { salida: '2026-12-09T00:00:00' } }, r).cabe, false);
  });

  it('los bordes del periodo cuentan como dentro', () => {
    const r = rangoDe('p', ctx);
    assert.equal(encajeEnRango(viaje('2026-12-04', '2026-12-08'), r).cabe, true);
  });

  it('fechas: inválidas se ignoran y al revés se ordenan', () => {
    assert.deepEqual([leerFiltrosComunes({ desde: '2026-12-08', hasta: '2026-12-04' }).desde, leerFiltrosComunes({ desde: '2026-12-08', hasta: '2026-12-04' }).hasta], ['2026-12-04', '2026-12-08']);
    assert.equal(leerFiltrosComunes({ desde: '8/12/2026' }).desde, '');
    assert.equal(leerFiltrosComunes({ desde: '2026-12-08', hasta: 'mañana' }).hasta, '');
  });

  it('conPeriodo no toca vistas sin fechas ni inventa parámetros vacíos', () => {
    const params = { q: 'spa' };
    assert.equal(conPeriodo('calendario', params, { cuando: 'finde', desde: '', hasta: '' }), params);
    assert.deepEqual(conPeriodo('escapadas', { q: 'spa', cuando: 'finde' }, { cuando: '', desde: '', hasta: '' }), { q: 'spa' });
    assert.equal(conPeriodo('escapadas', params, null), params);
    assert.deepEqual(conPeriodo('vuelos', {}, { cuando: 'puente', desde: '', hasta: '' }, {}), {}, 'sin puente conocido, Vuelos se queda sin finde');
    assert.deepEqual(periodoDeParams('vuelos', { cuando: 'x', finde: 'y' }), { cuando: 'y', desde: '', hasta: '' });
  });
});

// ── Motivos de la nota ───────────────────────────────────────────────────────

describe('nota.js', () => {
  const AHORA = new Date('2026-10-01T12:00:00Z');
  const con = (partes, extra = {}) => ({ notaDetalle: { partes, ...extra.detalle }, ...extra });

  it('sin desglose: nada que explicar; evitada: lo dice antes que nada', () => {
    assert.deepEqual(motivosNota({}), []);
    assert.equal(motivoPrincipal({}), null);
    assert.equal(motivoPrincipal(con({ precio: 40 }, { detalle: { evitada: true } })), 'Al fondo: es de algo que pides evitar');
  });

  it('ordena de más a menos puntos y usa el máximo de cada parte', () => {
    const m = motivosNota(con({ novedad: 4, precio: 30, opiniones: 8 }, { vistaPrimera: '2026-10-01T06:00:00Z', valoracion: { nota: 9.1, n: 120 } }), AHORA);
    assert.deepEqual(m.map((x) => x.clave), ['precio', 'opiniones', 'novedad']);
    assert.equal(m[0].maximo, MAXIMOS.precio);
    assert.match(m[2].texto, /Acaba de aparecer/);
    assert.match(m[1].texto, /Los clientes le dan un 9,1 \(120 opiniones\)/);
  });

  it('un precio que destaca (≥ la mitad del máximo) manda aunque otra parte sume más', () => {
    const o = con({ precio: 23, senales: 10, comodidad: 4 }, { detalle: { comparacion: { parecidas: 10, masCaras: 9, grupo: 'noche' } }, etiquetas: ['error-tarifa', 'temperatura:350'], cocheMin: 75 });
    assert.equal(motivoPrincipal(o, AHORA), 'Más barata que el 90 % de 10 escapadas parecidas · publicada como error de tarifa, muy votada en Chollometro (350°)');
  });

  it('el precio sale aunque no sume puntos si hay con qué comparar', () => {
    const o = con({ fechas: 0 }, { detalle: { comparacion: { parecidas: 4, masCaras: 1, grupo: 'vuelo' } } });
    const m = motivosNota(o, AHORA);
    assert.ok(m.some((x) => x.clave === 'precio' && /Precio normal: 3 de 4 vuelos son más baratas/.test(x.texto)));
    assert.equal(motivoPrincipal(o, AHORA), m[0].texto, 'sin nada que sume, el primero');
  });

  it('una parte desconocida no rompe: se enseña su clave', () => {
    assert.deepEqual(motivosNota(con({ rara: 2 }), AHORA)[0], { clave: 'rara', puntos: 2, maximo: 2, texto: 'rara' });
  });
});

// ── Tiempo en coche ──────────────────────────────────────────────────────────

describe('geo.js: minutos en coche', () => {
  const ORIGEN = { lat: 41.3874, lon: 2.1686 };
  it('desde el origen usa el tiempo real del escaneo; a menos de 2 km del origen, también', () => {
    const o = { lugar: { lat: 41.98, lon: 2.82 }, cocheMin: 83 };
    assert.equal(minutosEnCoche(o, null, ORIGEN), 83);
    assert.equal(minutosEnCoche(o, { lat: 41.39, lon: 2.17 }, ORIGEN), 83);
  });
  it('sin coordenadas, en avión, en ferry o un vuelo: no hay tiempo en coche', () => {
    assert.equal(minutosEnCoche({ lugar: { nombre: 'X' } }, null, ORIGEN), null);
    assert.equal(minutosEnCoche({ lugar: { lat: 41, lon: 1 }, transporte: 'avion' }, null, ORIGEN), null);
    assert.equal(minutosEnCoche({ lugar: { lat: 41, lon: 1 }, transporte: 'ferry' }, null, ORIGEN), null);
    assert.equal(minutosEnCoche({ tipo: 'vuelo', lugar: { lat: 41, lon: 1 } }, null, ORIGEN), null);
  });
  it('entre Canarias y Baleares tampoco, aunque los dos sean islas', () => {
    assert.equal(minutosEnCoche({ lugar: { lat: 28.1, lon: -15.4 } }, { lat: 39.57, lon: 2.65 }, ORIGEN), null);
  });
});
