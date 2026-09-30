/**
 * Un test por cada fallo que encontró la auditoría en el flujo y los enriquecedores.
 * Todos fallan sin su arreglo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Cache } from '../src/cache.js';
import { escanear, revisarLectura } from '../src/core/scan-pipeline.js';
import { estadoInicial } from '../src/almacen.js';
import { procesarEmails } from '../src/emails/decidir.js';
import { geolocalizar } from '../src/enriquecer/geo.js';
import { anadirTiempo, periodoViaje } from '../src/enriquecer/tiempo.js';
import { registrarPrecios } from '../src/historial.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, AJUSTES, crearCtx, oferta } from './ayudas.js';

const DIA_MS = 86_400_000;
const sinRed = { json: async () => [], texto: async () => '', esperar: async () => {} };
const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {} };
const fuente = (id, obtener) => ({ id, nombre: id, web: `https://${id}.es`, modo: 'html', requiere: [], urls: [`https://${id}.es/`], obtener });
const correr = (estado, fuentes, extra = {}) => escanear({
  ajustes: { ...AJUSTES, fuentes: {} }, estado, fuentes, http: sinRed, ahora: AHORA, env: {}, modulos,
  opciones: { sinEmails: true, forzar: true }, log: () => {}, ...extra,
});

describe('auditoría: flujo del escaneo', () => {
  test('una lectura vacía con «reemplazar» no borra el catálogo: la fuente pasa a error', async () => {
    const estado = estadoInicial();
    for (const n of [1, 2]) estado.ofertas[`campings:${n}`] = oferta({ id: `campings:${n}`, fuente: 'campings', vistaUltima: AHORA.toISOString() });
    estado.fuentes.campings = { estado: 'ok', total: 2 };
    await correr(estado, [fuente('campings', async () => ({ ofertas: [], reemplazar: true }))]);
    assert.equal(estado.fuentes.campings.estado, 'error');
    assert.match(estado.fuentes.campings.error, /0 ofertas \(la última vez 2\)/);
    assert.deepEqual(Object.keys(estado.ofertas).sort(), ['campings:1', 'campings:2']);
  });

  test('si una web cambia y el lector trae muchas menos ofertas, avisa y no borra las demás de golpe', async () => {
    const estado = estadoInicial();
    for (let n = 1; n <= 40; n++) estado.ofertas[`sitio:${n}`] = oferta({ id: `sitio:${n}`, fuente: 'sitio', precio: 50, vistaUltima: AHORA.toISOString() });
    estado.fuentes.sitio = { estado: 'ok', total: 40, referencia: { total: 40, conPrecio: 1 } };
    const tres = [1, 2, 3].map((n) => oferta({ id: `sitio:${n}`, fuente: 'sitio', precio: 45 }));
    const { salida } = await correr(estado, [fuente('sitio', async () => ({ ofertas: tres, reemplazar: true }))]);
    assert.equal(estado.fuentes.sitio.estado, 'ok');
    assert.match(estado.fuentes.sitio.aviso, /Solo 3 ofertas \(lo normal son unas 40\)[^]*¿Ha cambiado la web\?/);
    assert.equal(Object.keys(estado.ofertas).length, 40, 'no se borra nada de golpe');
    assert.equal(estado.ofertas['sitio:1'].precio, 45, 'lo que sí trae se actualiza');
    assert.deepEqual(estado.fuentes.sitio.referencia, { total: 40, conPrecio: 1 }, 'lo normal no baja por una lectura rara');
    assert.match(salida.ofertas.fuentes.find((f) => f.id === 'sitio').aviso, /Solo 3 ofertas/);
  });

  test('avisa si casi ninguna oferta trae precio; una bajada normal o un aviso de hace una semana no', () => {
    const conPrecio = (n, precio) => Array.from({ length: n }, (_, i) => ({ id: `s:${i}`, precio: i < precio ? 10 : null }));
    const normal = { total: 40, conPrecio: 0.9 };
    const sinPrecio = revisarLectura({ ofertas: conPrecio(40, 4), reemplazar: true }, { referencia: normal }, AHORA);
    assert.match(sinPrecio.aviso, /Solo el 10 % trae precio \(lo normal es el 90 %\)/);
    assert.equal(sinPrecio.reemplazar, true, 'con las ofertas completas se puede reemplazar');
    const pocas = revisarLectura({ ofertas: conPrecio(30, 30), reemplazar: true }, { referencia: normal }, AHORA);
    assert.deepEqual([pocas.aviso, pocas.referencia], [null, { total: 30, conPrecio: 1 }], '30 de 40 es normal');
    const haceSemana = new Date(AHORA.getTime() - 8 * DIA_MS).toISOString();
    const aceptada = revisarLectura({ ofertas: conPrecio(5, 5), reemplazar: true }, { referencia: normal, desdeAviso: haceSemana }, AHORA);
    assert.deepEqual([aceptada.aviso, aceptada.referencia.total, aceptada.reemplazar], [null, 5, true], 'tras una semana es lo normal');
    assert.equal(revisarLectura({ ofertas: conPrecio(1, 1), reemplazar: true }, { total: 4 }, AHORA).aviso, null, 'con pocas no se compara');
  });

  test('un error después de «falta configurar» enseña el error, no lo que faltaba', async () => {
    const estado = estadoInicial();
    estado.fuentes.x = { estado: 'desactivada', motivo: 'Falta configurar: GMAIL_USER', falta: ['GMAIL_USER'] };
    await correr(estado, [fuente('x', async () => { throw new Error('IMAP rechaza la contraseña'); })]);
    assert.equal(estado.fuentes.x.estado, 'error');
    assert.deepEqual(estado.fuentes.x.falta, []);
  });

  test('«Ofertas» de cada fuente en el panel son las que se enseñan, no las de la última lectura', async () => {
    const estado = estadoInicial();
    for (const n of [1, 2, 3]) estado.ofertas[`feed:${n}`] = oferta({ id: `feed:${n}`, fuente: 'feed', vistaUltima: AHORA.toISOString() });
    const { salida } = await correr(estado, [fuente('feed', async () => ({ ofertas: [oferta({ id: 'feed:1', fuente: 'feed' })] }))]);
    const f = salida.ofertas.fuentes.find((x) => x.id === 'feed');
    assert.deepEqual([f.total, f.leidas], [3, 1]);
  });

  test('la caché olvida al día el tiempo y la agenda (llevan la fecha en la clave) y guarda el resto', () => {
    const cache = new Cache();
    const hace2dias = AHORA.getTime() - 2 * DIA_MS;
    cache.guardar('tiempo:41.4,2.2:2026-09-16', { maxC: 25 }, hace2dias);
    cache.guardar('eventos:2026-09-15', [], AHORA.getTime() - 3 * DIA_MS);
    cache.guardar('geo:girona', { lat: 41.98, lon: 2.82 }, hace2dias);
    cache.podar(200 * DIA_MS, AHORA.getTime(), { 'tiempo:': DIA_MS, 'eventos:': 2 * DIA_MS });
    assert.deepEqual(Object.keys(cache.exportar()), ['geo:girona']);
  });
});

describe('auditoría: historial de precios', () => {
  test('un precio que nunca ha cambiado no es mínimo histórico; uno que ha bajado, sí', () => {
    const historial = {
      'prueba:plana': [['2026-09-08', 100], ['2026-09-16', 100], ['2026-09-17', 100]],
      'prueba:bajada': [['2026-09-08', 115], ['2026-09-16', 120], ['2026-09-17', 110]],
    };
    const plana = oferta({ id: 'prueba:plana', precio: 100 });
    const bajada = oferta({ id: 'prueba:bajada', precio: 100 });
    registrarPrecios(historial, [plana, bajada], AHORA);
    assert.equal(plana.minimoHistorico, false);
    assert.equal(bajada.minimoHistorico, true);
  });

  test('no anota un precio de hoy para una oferta que hoy no se ha leído', () => {
    const historial = { 'prueba:vieja': [['2026-09-16', 90]] };
    const vieja = oferta({ id: 'prueba:vieja', precio: 90, vistaUltima: new Date(AHORA.getTime() - 2 * DIA_MS).toISOString() });
    const leida = oferta({ id: 'prueba:leida', precio: 50, vistaUltima: AHORA.toISOString() });
    registrarPrecios(historial, [vieja, leida], AHORA);
    assert.deepEqual(historial['prueba:vieja'], [['2026-09-16', 90]]);
    assert.deepEqual(historial['prueba:leida'], [['2026-09-18', 50]]);
  });
});

describe('auditoría: vigilados', () => {
  const vigilados = [{ nombre: 'Cadaqués', texto: 'cadaques' }];
  const base = { ajustes: AJUSTES, vigilados, findes: findesProximos(2, AHORA), puentes: [], fuentes: [], panelUrl: 'https://x', log: () => {} };
  const casa = oferta({ id: 'feed:1', fuente: 'feed', titulo: 'Casa en Cadaqués', precio: 120 });

  test('si la oferta falta una ejecución y vuelve igual de precio, no se repite el aviso', async () => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    const enviados = [];
    const enviar = async (m) => { enviados.push(m.asunto); };
    const jueves = (h) => new Date(`2026-09-17T${h}:00:00Z`);
    await procesarEmails({ ...base, ofertas: [casa], estado, enviar, ahora: jueves('08') });
    await procesarEmails({ ...base, ofertas: [], estado, enviar, ahora: jueves('10') });
    await procesarEmails({ ...base, ofertas: [casa], estado, enviar, ahora: new Date('2026-09-19T10:00:00Z') });
    assert.equal(enviados.filter((a) => a.startsWith('⭐')).length, 1);
  });

  test('tras 30 días sin verla sí se olvida', async () => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    await procesarEmails({ ...base, ofertas: [casa], estado, enviar: async () => {}, ahora: AHORA });
    await procesarEmails({ ...base, ofertas: [], estado, enviar: async () => {}, ahora: new Date(AHORA.getTime() + 31 * DIA_MS) });
    assert.deepEqual(estado.emails.vigilados, {});
  });
});

describe('auditoría: tiempo, eventos y geolocalización', () => {
  const findes = findesProximos(3, AHORA);

  test('una estancia entre semana usa sus fechas, no las del finde siguiente', () => {
    const lunes = oferta({ fechas: { salida: '2026-09-21', vuelta: '2026-09-23' } });
    assert.deepEqual(periodoViaje(lunes, { findes, puentes: [] }), { desde: '2026-09-21', hasta: '2026-09-23' });
    const sinFechas = oferta();
    assert.equal(periodoViaje(sinFechas, { findes, puentes: [] }).desde, findes[0].viernes);
  });

  test('el tiempo de la ejecución anterior se borra (podría ser de un finde pasado)', async () => {
    const { ctx } = crearCtx();
    ctx.findes = findes;
    const vieja = oferta({ lugar: { nombre: 'Sitges', lat: 41.23, lon: 1.8 }, tiempo: { dia: '2026-09-12', maxC: 30 } });
    ctx.http.json = async () => { throw new Error('Open-Meteo caído'); };
    await anadirTiempo([vieja], ctx);
    assert.equal(vieja.tiempo, null);
  });

  test('una coordenada caducada sirve de respaldo si Nominatim falla', async () => {
    const { ctx } = crearCtx();
    ctx.cache.guardar('geo:olot, girona', { lat: 42.18, lon: 2.49 }, AHORA.getTime() - 100 * DIA_MS);
    ctx.http.json = async () => { throw new Error('HTTP 429'); };
    const o = oferta({ lugar: { nombre: 'Olot', region: 'Girona', lat: null, lon: null } });
    await geolocalizar([o], ctx);
    assert.deepEqual([o.lugar.lat, o.lugar.lon], [42.18, 2.49]);
  });
});

describe('auditoría: la portada avisa de las webs con problemas', () => {
  test('las que llevan 12 h fallando o leen mucho menos de lo normal; un fallo suelto no', async () => {
    const { webConProblemas } = await import('../site/js/vistas.js');
    const hace = (horas) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();
    const fuentes = [
      { id: 'a', estado: 'error', desdeError: hace(20) },
      { id: 'b', estado: 'error', desdeError: hace(1) },
      { id: 'c', estado: 'ok', aviso: 'Solo 3 ofertas' },
      { id: 'd', estado: 'ok' },
      { id: 'e', estado: 'bloqueada' },
    ];
    assert.deepEqual(webConProblemas(fuentes, AHORA).map((f) => f.id), ['a', 'c']);
  });
});
