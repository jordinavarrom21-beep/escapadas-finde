import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { cargarJson, estadoInicial, fusionar, guardarJson, podar } from '../src/almacen.js';
import { compactar, registrarPrecios, seriesPara } from '../src/historial.js';
import { coincide } from '../src/vigilados.js';
import { procesarEmails } from '../src/emails/decidir.js';
import { alertaFuentes, precioLegible, resumenSemanal } from '../src/emails/plantillas.js';
import { escanear, urlPanel } from '../src/escanear.js';
import { ErrorRobots } from '../src/util/robots.js';
import { findesProximos } from '../src/util/fechas.js';
import { AHORA, AJUSTES, oferta } from './ayudas.js';

const HORA = 3_600_000;
const enHoras = (horas) => new Date(AHORA.getTime() + horas * HORA);

describe('almacén', () => {
  test('fusionar conserva vistaPrimera y reemplaza según la fuente', () => {
    const estado = estadoInicial();
    const a = oferta({ fuente: 'f' });
    const b = oferta({ fuente: 'f' });
    fusionar(estado, 'f', { ofertas: [a, b] }, AHORA);
    const despues = enHoras(1);
    const resultado = fusionar(estado, 'f', { ofertas: [{ ...a, precio: 10 }], reemplazar: true }, despues);
    assert.deepEqual(resultado, { nuevas: 0, total: 1, borradas: 1 });
    assert.equal(estado.ofertas[a.id].vistaPrimera, AHORA.toISOString());
    assert.equal(estado.ofertas[a.id].vistaUltima, despues.toISOString());
    assert.equal(estado.ofertas[b.id], undefined);
  });

  test('reemplazar con función limita lo que se borra', () => {
    const estado = estadoInicial();
    const [x, y] = [oferta({ fuente: 'f', etiquetas: ['x'] }), oferta({ fuente: 'f', etiquetas: ['y'] })];
    fusionar(estado, 'f', { ofertas: [x, y] }, AHORA);
    fusionar(estado, 'f', { ofertas: [], reemplazar: (o) => o.etiquetas.includes('x') }, AHORA);
    assert.deepEqual(Object.keys(estado.ofertas), [y.id]);
  });

  test('podar quita caducadas, vuelos pasados y olvidadas', () => {
    const estado = estadoInicial();
    const viva = oferta();
    const caducada = oferta({ caduca: '2026-09-01T00:00:00Z' });
    const pasada = oferta({ fechas: { salida: '2026-09-17T10:00:00' } });
    fusionar(estado, 'prueba', { ofertas: [viva, caducada, pasada] }, AHORA);
    const olvidada = oferta();
    fusionar(estado, 'prueba', { ofertas: [olvidada] }, new Date('2026-09-01T00:00:00Z'));
    assert.equal(podar(estado, AHORA, { retencionDias: 10 }), 3);
    assert.deepEqual(Object.keys(estado.ofertas), [viva.id]);
  });

  test('guardarJson escribe de forma atómica y cargarJson usa el valor por defecto', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'escapadas-'));
    const ruta = path.join(carpeta, 'sub', 'datos.json');
    assert.deepEqual(cargarJson(ruta, { vacio: true }), { vacio: true });
    guardarJson(ruta, { a: 1 });
    assert.deepEqual(JSON.parse(readFileSync(ruta, 'utf8')), { a: 1 });
    assert.deepEqual(readdirSync(path.dirname(ruta)), ['datos.json']);
  });
});

describe('historial', () => {
  test('mínimo del día, bajada y mínimo histórico', () => {
    const historial = { 'prueba:h': [['2026-09-15', 80], ['2026-09-16', 70]] };
    const o = oferta({ id: 'prueba:h', precio: 65 });
    registrarPrecios(historial, [o], AHORA);
    registrarPrecios(historial, [{ ...o, precio: 90 }], AHORA);
    assert.deepEqual(historial['prueba:h'].at(-1), ['2026-09-18', 65]);
    assert.equal(o.bajada, 15);
    assert.equal(o.minimoHistorico, true);
    assert.deepEqual(Object.keys(seriesPara(historial, ['prueba:h', 'otra'])), ['prueba:h']);
  });

  test('compactar quita puntos viejos y series de ofertas desaparecidas', () => {
    const historial = { viva: [['2026-01-01', 10], ['2026-09-10', 9]], muerta: [['2026-07-01', 5]] };
    compactar(historial, AHORA, { maxDias: 120, idsVivos: ['viva'] });
    assert.deepEqual(historial, { viva: [['2026-09-10', 9]] });
  });
});

describe('vigilados', () => {
  const oporto = oferta({ tipo: 'vuelo', titulo: 'Oporto', precio: 45, lugar: { nombre: 'Oporto', iata: 'OPO' }, vuelo: { origen: 'BCN', destino: 'OPO' } });
  const spa = oferta({ titulo: 'Spa en Girona', temas: ['spa'], precio: 60, cocheMin: 90, lugar: { nombre: 'Girona', lat: 41.98, lon: 2.82 } });

  test('texto sin tildes, tipo, aeropuerto y precio', () => {
    assert.equal(coincide(oporto, { nombre: 'x', texto: 'OPORTO', tipo: 'vuelo', aeropuerto: 'BCN', precioMax: 60 }), true);
    assert.equal(coincide(oporto, { nombre: 'x', texto: 'oporto', precioMax: 40 }), false);
    assert.equal(coincide(oporto, { nombre: 'x', aeropuerto: 'GRO' }), false);
  });

  test('tema, tiempo en coche y cercanía', () => {
    assert.equal(coincide(spa, { nombre: 'x', tema: 'spa', cocheMaxMin: 120 }), true);
    assert.equal(coincide(spa, { nombre: 'x', cocheMaxMin: 60 }), false);
    assert.equal(coincide(spa, { nombre: 'x', cerca: { lat: 41.9, lon: 2.8, radioKm: 20 } }), true);
    assert.equal(coincide(spa, { nombre: 'x', puente: true }), false);
  });
});

describe('emails', () => {
  const findes = findesProximos(2, AHORA);
  const vuelo = oferta({ tipo: 'vuelo', titulo: 'Oporto', precio: 25, unidad: 'i/v', descripcion: 'BCN → OPO', vuelo: { origen: 'BCN', destino: 'OPO', horarioIdeal: true }, fechas: { salida: '2026-09-18T19:00:00', vuelta: '2026-09-20T20:00:00', findeId: findes[0].id }, vistaPrimera: AHORA.toISOString() });
  const escapada = oferta({ titulo: 'Casa rural en el Montseny', precio: 120, unidad: 'pp', noches: 2, temas: ['rural'], cocheMin: 75, lugar: { nombre: 'Montseny' }, puntuacion: 60, vistaPrimera: AHORA.toISOString() });
  const base = { ofertas: [vuelo, escapada], ajustes: AJUSTES, findes, puentes: [], fuentes: [], panelUrl: 'https://jordi.github.io/escapadas-finde/', log: () => {} };

  test('plantillas sin huecos ni valores rotos', () => {
    const { asunto, html, texto } = resumenSemanal({ ...base, ahora: AHORA });
    assert.match(asunto, /^Tu finde 18–20 sep: vuelos desde 25,00\s€ y 1 escapada$/);
    for (const contenido of [html, texto]) assert.doesNotMatch(contenido, /undefined|NaN|null/);
    assert.match(html, /horario ideal/);
    assert.match(html, /1 h 15 min/);
    assert.equal(precioLegible(escapada), '120,00 € por persona');
    const aviso = alertaFuentes({ fuentes: [{ nombre: 'Web X', error: 'HTTP 500', desdeError: enHoras(-30).toISOString() }], panelUrl: base.panelUrl, ahora: AHORA });
    assert.match(aviso.html, /Web X: falla desde hace 30 h \(HTTP 500\)/);
  });

  test('sin transporte no hace nada ni toca el estado', async () => {
    const estado = estadoInicial();
    assert.deepEqual(await procesarEmails({ ...base, estado, enviar: null, ahora: AHORA }), { enviados: [], errores: [] });
    assert.equal(estado.emails.inicializado, false);
  });

  test('primera ejecución: resumen del viernes sí, alertas de lo que ya había no', async () => {
    const estado = estadoInicial();
    const enviados = [];
    const enviar = async (m) => { enviados.push(m.asunto); };
    const viernes8 = new Date('2026-09-18T06:05:00Z');
    await procesarEmails({ ...base, estado, enviar, ahora: viernes8 });
    assert.equal(enviados.length, 1);
    assert.match(enviados[0], /^Tu finde/);
    assert.ok(estado.emails.alertados[vuelo.id]);
    await procesarEmails({ ...base, estado, enviar, ahora: new Date('2026-09-18T07:00:00Z') });
    assert.equal(enviados.length, 1, 'el resumen no se repite el mismo viernes');
  });

  test('chollazos nuevos y vigilados que bajan, con límite diario', async () => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    const enviados = [];
    const enviar = async (m) => { enviados.push(m.asunto); };
    const jueves = new Date('2026-09-17T10:00:00Z');
    const vigilados = [{ nombre: 'Oporto', texto: 'oporto', precioMax: 60 }];
    await procesarEmails({ ...base, estado, enviar, vigilados, ahora: jueves });
    assert.deepEqual(enviados.map((asunto) => [...asunto][0]), ['⭐', '🔥']);
    await procesarEmails({ ...base, estado, enviar, vigilados, ahora: jueves });
    assert.equal(enviados.length, 2, 'no repite avisos');
    const masBarato = { ...vuelo, precio: 20 };
    await procesarEmails({ ...base, ofertas: [masBarato, escapada], estado, enviar, vigilados, ahora: jueves });
    assert.equal(enviados.length, 3, 'avisa de la bajada');
    estado.emails.enviosHoy.n = AJUSTES.emails.chollazos.maxPorDia;
    const nuevo = oferta({ tipo: 'vuelo', precio: 19, unidad: 'i/v' });
    await procesarEmails({ ...base, ofertas: [nuevo], estado, enviar, ahora: jueves });
    assert.equal(enviados.length, 3, 'respeta el límite diario');
  });

  test('fuentes caídas: solo las de error, pasado el umbral y una vez al día', async () => {
    const estado = estadoInicial();
    estado.emails.inicializado = true;
    const enviados = [];
    const jueves = new Date('2026-09-17T10:00:00Z');
    const haceHoras = (horas) => new Date(jueves.getTime() - horas * HORA).toISOString();
    const fuentes = [
      { id: 'a', nombre: 'A', estado: 'error', error: 'HTTP 500', desdeError: haceHoras(30) },
      { id: 'b', nombre: 'B', estado: 'bloqueada', desdeError: null },
      { id: 'c', nombre: 'C', estado: 'error', error: 'x', desdeError: haceHoras(2) },
    ];
    const args = { ...base, ofertas: [], estado, fuentes, enviar: async (m) => enviados.push(m.asunto), ahora: jueves };
    await procesarEmails(args);
    await procesarEmails(args);
    assert.deepEqual(enviados, ['⚠️ A no funciona']);
  });
});

describe('escanear', () => {
  const sinRed = { json: async () => [], texto: async () => '', esperar: async () => {} };
  const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {} };
  const fuente = (id, obtener, extra = {}) => ({ id, nombre: id.toUpperCase(), web: `https://${id}.es`, modo: 'feed', requiere: [], urls: [`https://${id}.es/feed`], obtener, ...extra });
  const ajustes = { ...AJUSTES, fuentes: {} };

  test('estados de las fuentes, orden por puntuación y datos del panel', async () => {
    const buena = fuente('buena', async () => ({ ofertas: [oferta({ fuente: 'buena', precio: 90, unidad: 'pp', noches: 2 }), oferta({ fuente: 'buena', precio: 30, unidad: 'pp', noches: 2 })] }));
    const mala = fuente('mala', async () => { throw new Error('HTTP 500 en mala.es'); });
    const conSecreto = fuente('secreta', async () => ({ ofertas: [] }), { requiere: ['TOKEN_SECRETO'] });
    const vetada = fuente('vetada', async () => ({ ofertas: [] }));
    const http = { ...sinRed, texto: async (url) => (url.startsWith('https://vetada.es') ? 'User-agent: *\nDisallow: /' : '') };

    const { salida, estado, informe } = await escanear({
      ajustes, fuentes: [buena, mala, conSecreto, vetada], http, ahora: AHORA, env: {}, modulos, opciones: { sinEmails: true }, log: () => {},
    });
    const porId = Object.fromEntries(salida.ofertas.fuentes.map((f) => [f.id, f]));
    assert.equal(porId.buena.estado, 'ok');
    assert.equal(porId.buena.nuevas, 2);
    assert.equal(porId.mala.estado, 'error');
    assert.equal(porId.mala.desdeError, AHORA.toISOString());
    assert.equal(porId.secreta.estado, 'desactivada');
    assert.deepEqual(porId.secreta.falta, ['TOKEN_SECRETO']);
    assert.equal(porId.vetada.estado, 'bloqueada');
    assert.match(porId.vetada.motivo, /robots\.txt no permite/);
    const puntuaciones = salida.ofertas.ofertas.map((o) => o.puntuacion);
    assert.deepEqual(puntuaciones, [...puntuaciones].sort((a, b) => b - a));
    assert.equal(salida.ofertas.ofertas[0].precio, 30);
    assert.equal(informe.total, 2);
    assert.equal(estado.fuentes.mala.estado, 'error');
  });

  test('respeta intervalos; --forzar y --solo los ignoran', async () => {
    let llamadas = 0;
    const f = fuente('f', async () => { llamadas++; return { ofertas: [] }; });
    const estado = estadoInicial();
    const comun = { ajustes: { ...ajustes, fuentes: { f: { intervaloMin: 60 } } }, fuentes: [f], http: sinRed, estado, env: {}, modulos, log: () => {} };
    await escanear({ ...comun, ahora: AHORA, opciones: { sinEmails: true } });
    await escanear({ ...comun, ahora: enHoras(0.5), opciones: { sinEmails: true } });
    assert.equal(llamadas, 1);
    await escanear({ ...comun, ahora: enHoras(0.5), opciones: { sinEmails: true, forzar: true } });
    await escanear({ ...comun, ahora: enHoras(0.6), opciones: { sinEmails: true, solo: 'f' } });
    await escanear({ ...comun, ahora: enHoras(0.7), opciones: { sinEmails: true, solo: 'otra' } });
    assert.equal(llamadas, 3);
  });

  test('fuente desactivada en ajustes y sin urls', async () => {
    const off = fuente('off', async () => { throw new Error('no debería ejecutarse'); });
    const sinUrls = fuente('sinurls', async () => ({ ofertas: [] }), { urls: [] });
    const { salida } = await escanear({
      ajustes: { ...ajustes, fuentes: { off: { activa: false, motivo: 'Probando' } } },
      fuentes: [off, sinUrls], http: sinRed, ahora: AHORA, env: {}, modulos, opciones: { sinEmails: true }, log: () => {},
    });
    assert.deepEqual(salida.ofertas.fuentes.map((f) => [f.estado, f.motivo ?? f.error]), [
      ['desactivada', 'Probando'],
      ['error', 'La fuente no declara sus urls: no se puede comprobar robots.txt'],
    ]);
  });

  test('urlPanel', () => {
    assert.equal(urlPanel({ panelUrl: null }, { GITHUB_REPOSITORY: 'jordi/escapadas-finde' }), 'https://jordi.github.io/escapadas-finde/');
    assert.equal(urlPanel({ panelUrl: 'https://x.es/' }, {}), 'https://x.es/');
    assert.equal(urlPanel({ panelUrl: null }, {}), null);
    assert.ok(new ErrorRobots(['/x']) instanceof Error);
  });
});
