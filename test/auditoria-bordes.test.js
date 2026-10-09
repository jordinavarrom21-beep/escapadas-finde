/**
 * Auditoría de los tests: lo que la suite no llegaba a comprobar. Recorridos de varias
 * ejecuciones seguidas (una fuente que sigue caída, el calendario de los emails), un
 * escaneo con los enriquecedores de verdad, las dos copias de las fechas (panel y
 * escáner) y las constantes probadas justo en su borde, no lejos de él.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Cache } from '../src/cache.js';
import { estadoInicial } from '../src/almacen.js';
import { escanear } from '../src/core/scan-pipeline.js';
import { procesarEmails } from '../src/emails/decidir.js';
import { obtenerFestivos } from '../src/enriquecer/festivos.js';
import { puntuar } from '../src/enriquecer/puntuacion.js';
import { MINIMO_GRUPO, calcularReferencia } from '../src/enriquecer/referencia.js';
import { compactar } from '../src/historial.js';
import * as back from '../src/util/fechas.js';
import * as panel from '../site/js/fechas.js';
import { AHORA, AJUSTES, crearCtx, leerFixtureJson, oferta } from './ayudas.js';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const enHoras = (h) => new Date(AHORA.getTime() + h * HORA);
const haceDias = (d) => new Date(AHORA.getTime() - d * DIA).toISOString();
const sinRed = { json: async () => [], texto: async () => '', esperar: async () => {} };
const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {} };
const fuente = (id, obtener) => ({
  id, nombre: id.toUpperCase(), web: `https://${id}.es`, modo: 'feed', requiere: [], urls: [`https://${id}.es/feed`], obtener,
});

describe('auditoría: una fuente que sigue caída, de principio a fin', () => {
  test('conserva desdeError del primer fallo y a las 24 h avisa una sola vez', async () => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    const enviados = [];
    const comun = {
      ajustes: { ...AJUSTES, fuentes: {} }, estado, http: sinRed, env: {}, log: () => {}, opciones: { forzar: true },
      fuentes: [fuente('caida', async () => { throw new Error('HTTP 500'); })],
      modulos: { ...modulos, crearTransporte: () => ({}), enviarEmail: async (_t, m) => { enviados.push(m.asunto); } },
    };
    await escanear({ ...comun, ahora: AHORA });
    assert.deepEqual(enviados.filter((a) => a.startsWith('⚠️')), [], 'a la primera no se avisa');
    await escanear({ ...comun, ahora: enHoras(25) });
    assert.equal(estado.fuentes.caida.desdeError, AHORA.toISOString(), 'desde el primer fallo, no desde el último');
    await escanear({ ...comun, ahora: enHoras(26) });
    assert.deepEqual(enviados.filter((a) => a.startsWith('⚠️')), ['⚠️ CAIDA no funciona'], 'una vez, no en cada ejecución');
  });
});

describe('auditoría: el calendario de los emails, en hora de Madrid', () => {
  const base = { ajustes: AJUSTES, vigilados: [], findes: back.findesProximos(2, AHORA), puentes: [], fuentes: [], panelUrl: 'https://x', log: () => {} };
  const chollo = (id) => oferta({ id: `f:${id}`, fuente: 'f', tipo: 'vuelo', precio: 19, unidad: 'i/v' });
  const correr = async (estado, ahora, ofertas) => {
    const enviados = [];
    await procesarEmails({ ...base, ofertas, estado, ahora, enviar: async (m) => { enviados.push(m.asunto); } });
    return enviados;
  };
  const conTopeLleno = (fecha) => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    estado.emails.resumenEnviado = '2026-09-18';
    estado.emails.enviosHoy = { fecha, n: AJUSTES.emails.chollazos.maxPorDia };
    return estado;
  };
  const alertas = (enviados) => enviados.filter((a) => a.startsWith('🔥')).length;

  test('con el tope del día lleno no sale nada más ese día', async () => {
    assert.equal(alertas(await correr(conTopeLleno('2026-09-17'), new Date('2026-09-17T10:00:00Z'), [chollo(0)])), 0);
  });

  test('el tope se reinicia al día siguiente', async () => {
    assert.equal(alertas(await correr(conTopeLleno('2026-09-16'), new Date('2026-09-17T10:00:00Z'), [chollo(1)])), 1);
  });

  test('el día cambia a medianoche de Madrid, no de UTC', async () => {
    // 21:30 UTC del jueves 17 son las 23:30 en Madrid: sigue siendo jueves.
    assert.equal(alertas(await correr(conTopeLleno('2026-09-17'), new Date('2026-09-17T21:30:00Z'), [chollo(2)])), 0);
    // 22:30 UTC del jueves 17 son las 00:30 del viernes 18 en Madrid: ya es otro día.
    assert.equal(alertas(await correr(conTopeLleno('2026-09-17'), new Date('2026-09-17T22:30:00Z'), [chollo(3)])), 1);
  });

  test('si no llega la ejecución de las 8, el resumen sale en la primera del viernes después', async () => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    const madrugada = await correr(estado, new Date('2026-09-17T23:30:00Z'), []); // viernes 01:30 en Madrid
    assert.ok(!madrugada.some((a) => a.startsWith('Tu finde')), 'antes de la hora, no');
    const tarde = await correr(estado, new Date('2026-09-18T13:00:00Z'), []); // viernes 15:00 en Madrid
    assert.ok(tarde.some((a) => a.startsWith('Tu finde')), 'a las 15:00 sí, porque aún no había salido');
    const noche = await correr(estado, new Date('2026-09-18T19:00:00Z'), []);
    assert.ok(!noche.some((a) => a.startsWith('Tu finde')), 'y solo una vez');
  });
});

describe('auditoría: un escaneo con los enriquecedores de verdad', () => {
  test('precio imposible fuera de la referencia, duplicados, vigilados, historial, caché y festivos del año siguiente', async () => {
    const lugar = { nombre: 'Besalú', region: 'Girona', pais: 'España' };
    // Las justas para que el grupo preciso (escapada:spa:girona) tenga mediana.
    const nombres = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince']
      .slice(0, MINIMO_GRUPO).map((n) => `Can ${n}`);
    const hotel = (fuenteId, id, titulo, precio) => oferta({
      id: `${fuenteId}:${id}`, fuente: fuenteId, tipo: 'hotel', unidad: 'pp/noche', temas: ['spa'], titulo, precio, lugar,
    });
    const a = fuente('a', async () => ({
      ofertas: nombres.map((nombre, i) => hotel('a', i, `Hotel ${nombre} Mas`, 60 + i * 5)).concat(hotel('a', 'mal', 'Hotel Imposible Mas', 2)),
    }));
    const b = fuente('b', async () => ({ ofertas: [hotel('b', 'uno', 'Can Uno Mas 4*', 65)] }));
    const ahora = new Date('2026-10-01T08:00:00Z');
    const cache = new Cache({ 'tiempo:x:2026-09-01': { t: ahora.getTime() - 5 * DIA, v: {} } });
    const historial = { 'viejo:1': [['2026-06-01', 10]] };
    let anios = null;
    const { salida } = await escanear({
      ajustes: { ...AJUSTES, fuentes: {} }, fuentes: [a, b], http: sinRed, env: {}, log: () => {}, cache, historial,
      ahora, opciones: { sinEmails: true, forzar: true },
      vigilados: [{ nombre: 'Besalú', texto: 'besalu' }],
      modulos: { ...modulos, obtenerFestivos: async (_ctx, lista) => { anios = lista; return []; } },
    });
    const porId = new Map(salida.ofertas.ofertas.map((o) => [o.id, o]));
    const mala = porId.get('a:mal');
    assert.equal(mala.precio, null, 'revisarPrecios está enganchado');
    assert.ok(mala.etiquetas.includes('precio-dudoso'));
    assert.equal(mala.referencia, null);
    assert.equal(porId.get('a:0').referencia.n, MINIMO_GRUPO + 1, 'revisarPrecios va antes: el precio de 2 € no entra en la mediana');
    assert.ok(porId.get('b:uno').etiquetas.includes('duplicada'), 'marcarEquivalentes está enganchado');
    assert.equal(salida.vigilados.vigilados[0].coincidencias.length, MINIMO_GRUPO + 1, 'la copia duplicada (b:uno) no avisa dos veces');
    assert.equal(historial['viejo:1'], undefined, 'compactar está enganchado');
    assert.deepEqual(Object.keys(cache.exportar()).filter((k) => k.startsWith('tiempo:x')), [], 'la caché se poda');
    assert.deepEqual(anios, [2026, 2027], 'a 120 días vista hacen falta los festivos del año que viene');
  });
});

describe('auditoría: las fechas del panel y las del escáner cuadran', () => {
  test('mismo día y mismos findes durante dos años, con cambios de hora y medianoches', () => {
    const desde = Date.parse('2026-09-01T00:00:00Z');
    // Paso de 7 h 13 min: cae a todas las horas del día y en los dos cambios de hora.
    for (let t = desde; t < desde + 730 * DIA; t += 7 * HORA + 13 * MINUTO) {
      const d = new Date(t);
      assert.equal(panel.fechaLocal(d), back.fechaLocal(d), d.toISOString());
      assert.deepEqual(panel.findesProximos(2, d), back.findesProximos(2, d), d.toISOString());
    }
  });

  test('el sábado y el domingo el finde en curso sigue siendo el primero (también en el panel)', () => {
    assert.equal(panel.findesProximos(1, new Date('2026-10-03T21:00:00Z'))[0].id, '2026-10-02'); // sábado 23:00
    assert.equal(panel.findesProximos(1, new Date('2026-10-04T21:59:00Z'))[0].id, '2026-10-02'); // domingo 23:59
    assert.equal(panel.findesProximos(1, new Date('2026-10-04T22:00:00Z'))[0].id, '2026-10-09'); // lunes 00:00
    assert.equal(panel.findesProximos(1, new Date('2026-10-25T12:00:00Z'))[0].id, '2026-10-23'); // domingo del cambio de hora
  });
});

describe('auditoría: puntuación en sus casos límite', () => {
  test('empates, oferta sola en su grupo y tope sin precio', () => {
    const [x, y, z] = [30, 30, 90].map((precio) => oferta({ tipo: 'vuelo', unidad: 'i/v', precio }));
    const sola = oferta({ tipo: 'paquete', unidad: 'total', precio: 500 });
    const sinPrecio = oferta({
      etiquetas: ['error-tarifa'], minimoHistorico: true, descuento: 60, vistaPrimera: AHORA.toISOString(),
      cocheMin: 60, fechas: { puenteId: 'p' },
    });
    puntuar([x, y, z, sola, sinPrecio], AJUSTES, { ahora: AHORA });
    assert.equal(x.puntuacion, y.puntuacion, 'el mismo precio, los mismos puntos');
    assert.equal(x.puntuacion, 34, 'los dos empatados cogen la posición media del empate (33,75), no la primera');
    assert.equal(z.puntuacion, 0);
    assert.equal(sola.puntuacion, 23, 'sola en su grupo: la mitad del peso del precio (22,5)');
    assert.equal(sinPrecio.puntuacion, 50, 'con todas las señales, sin precio se queda en 50');
  });

  test('las opiniones suben la nota: más cuanto mejor la nota y cuantas más opiniones', () => {
    const base = { tipo: 'actividad', precio: 0, unidad: 'pp' };
    const [sin, floja, buena, buenaPocas, excelente] = [null, { nota: 6, n: 500 }, { nota: 9, n: 300 }, { nota: 9, n: 1 }, { nota: 9.8, n: 1200 }]
      .map((valoracion) => oferta({ ...base, valoracion }));
    puntuar([sin, floja, buena, buenaPocas, excelente], AJUSTES, { ahora: AHORA });
    const notas = [sin, floja, buena, buenaPocas, excelente].map((o) => o.puntuacion);
    assert.equal(new Set(notas).size > 1, true, 'gratis todos, pero no la misma nota');
    assert.equal(floja.puntuacion, sin.puntuacion, 'un 6 no suma');
    assert.ok(excelente.puntuacion > buena.puntuacion && buena.puntuacion > buenaPocas.puntuacion && buenaPocas.puntuacion > sin.puntuacion);
    assert.ok(excelente.puntuacion - sin.puntuacion <= 10, 'como mucho 10 puntos');
  });

  test('novedad de 24 a 72 h, coche entre 2 y 3 h y el finde que viene', () => {
    const base = { tipo: 'hotel', unidad: 'pp/noche', precio: 50 };
    const [reciente, deAyer, vieja] = [1, 48, 80].map((horas) => oferta({ ...base, vistaPrimera: enHoras(-horas).toISOString() }));
    const [cerca, medio, lejos] = [120, 180, 181].map((cocheMin) => oferta({ ...base, cocheMin }));
    const [esteFinde, otroFinde] = ['2026-09-18', '2026-09-25'].map((findeId) => oferta({ ...base, fechas: { findeId, salida: findeId } }));
    // Con fechas flexibles vale para cualquier finde: no suma por «el finde que viene» ni por un puente.
    const flexible = oferta({ ...base, fechas: { findeId: '2026-09-18', puenteId: 'pilar' } });
    const todas = [reciente, deAyer, vieja, cerca, medio, lejos, esteFinde, otroFinde, flexible];
    puntuar(todas, AJUSTES, { ahora: AHORA, findeActual: '2026-09-18' });
    // Todas cuestan lo mismo: empate en la posición media = 22,5 de precio, más lo suyo
    // (22,5 se redondea a 23: la diferencia con 25 es 2).
    const precio = vieja.puntuacion;
    assert.equal(precio, 23);
    assert.deepEqual([reciente, deAyer].map((o) => o.puntuacion - precio), [10, 5]);
    assert.deepEqual([cerca, medio, lejos].map((o) => o.puntuacion - precio), [5, 2, 0]);
    assert.deepEqual([esteFinde, otroFinde, flexible].map((o) => o.puntuacion - precio), [5, 0, 0]);
  });
});

describe('auditoría: las constantes probadas en su borde', () => {
  test('con un intervalo de 60 min, a los 54 min ya toca (margen 0,8 para un cron irregular) y a los 45, no', async () => {
    let llamadas = 0;
    const f = fuente('f', async () => { llamadas++; return { ofertas: [] }; });
    const estado = estadoInicial();
    const comun = { ajustes: { ...AJUSTES, fuentes: { f: { intervaloMin: 60 } } }, fuentes: [f], http: sinRed, estado, env: {}, modulos, log: () => {} };
    await escanear({ ...comun, ahora: AHORA, opciones: { sinEmails: true } });
    await escanear({ ...comun, ahora: enHoras(0.75), opciones: { sinEmails: true } });
    assert.equal(llamadas, 1, 'a los 45 min todavía no');
    await escanear({ ...comun, ahora: enHoras(0.9), opciones: { sinEmails: true } });
    assert.equal(llamadas, 2, 'a los 54 min sí');
  });

  test('historial: una oferta que falta conserva su serie 30 días y a los 31 se borra', () => {
    const hoy = back.fechaLocal(AHORA);
    const historial = {
      reciente: [[back.sumarDias(hoy, -30), 40]],
      vieja: [[back.sumarDias(hoy, -31), 40]],
      viva: [[back.sumarDias(hoy, -100), 40]],
    };
    compactar(historial, AHORA, { idsVivos: ['viva'] });
    assert.deepEqual(Object.keys(historial).sort(), ['reciente', 'viva']);
  });

  test('alertados: el aviso de una oferta que ha desaparecido se recuerda 30 días', async () => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    estado.emails.resumenEnviado = '2026-09-18';
    estado.emails.alertados = { 'f:hace10': haceDias(10), 'f:hace29': haceDias(29), 'f:hace31': haceDias(31) };
    await procesarEmails({
      ajustes: AJUSTES, vigilados: [], findes: back.findesProximos(2, AHORA), puentes: [], fuentes: [], panelUrl: 'https://x',
      log: () => {}, ofertas: [], estado, ahora: AHORA, enviar: async () => {},
    });
    assert.deepEqual(Object.keys(estado.emails.alertados).sort(), ['f:hace10', 'f:hace29']);
  });

  test(`referencia: con ${MINIMO_GRUPO - 1} ofertas parecidas no hay mediana; con ${MINIMO_GRUPO}, sí`, () => {
    const lugar = { nombre: 'Girona', region: 'Girona', pais: 'España' };
    const noche = (precio) => oferta({ tipo: 'escapada', temas: ['spa'], lugar, precio, unidad: 'pp/noche' });
    const precios = (n) => Array.from({ length: n }, (_, i) => 40 + i * 5);
    const pocas = precios(MINIMO_GRUPO - 1).map(noche);
    calcularReferencia(pocas);
    assert.ok(pocas.every((o) => o.referencia === null));
    const justas = precios(MINIMO_GRUPO).map(noche);
    calcularReferencia(justas);
    assert.ok(justas.every((o) => o.referencia?.n === MINIMO_GRUPO));
  });

  test('festivos: con Nager.at caído se usan los guardados aunque tengan más de 7 días', async () => {
    const guardados = leerFixtureJson('festivos-nager-2026-ES.json');
    const cache = new Cache({ 'festivos:2026': { t: AHORA.getTime() - 8 * DIA, v: guardados } });
    const { ctx, logs } = crearCtx({ cache, respuestas: () => { throw new Error('HTTP 503'); } });
    ctx.ajustes = { ...AJUSTES, puentes: { comunidad: 'ES-CT', festivosLocales: [] } };
    const festivos = await obtenerFestivos(ctx, [2026]);
    assert.ok(festivos.some((f) => f.fecha === '2026-12-08'), 'usa los guardados');
    assert.ok(logs.some((m) => /festivos de 2026/.test(m)), 'y deja constancia');
  });

  test('caché: justo en maxEdad vale; un milisegundo después, no', () => {
    const cache = new Cache();
    cache.guardar('k', 1, 1000);
    assert.equal(cache.obtener('k', 500, 1500), 1);
    assert.equal(cache.obtener('k', 500, 1501), undefined);
  });
});
