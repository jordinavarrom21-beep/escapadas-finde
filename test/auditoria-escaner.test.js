/**
 * Auditoría de octubre de 2026: un test por cada fallo del escáner que se ha corregido.
 * Todos fallan sin su arreglo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Cache } from '../src/cache.js';
import { aplicarAfiliacion } from '../src/afiliacion.js';
import { estadoInicial } from '../src/almacen.js';
import { escanear } from '../src/core/scan-pipeline.js';
import { alertaChollazos } from '../src/emails/plantillas.js';
import { fechasDeTexto } from '../src/enriquecer/fechas-texto.js';
import { puntuar } from '../src/enriquecer/puntuacion.js';
import { guardarTrasFallo } from '../src/escanear.js';
import { completarOferta, validarOferta } from '../src/modelo.js';
import { bloquePortada } from '../src/paginas.js';
import { fuentesConProblemas } from '../scripts/salud-fuentes.js';
import { AHORA, AJUSTES, oferta } from './ayudas.js';

const sinRed = { json: async () => [], texto: async () => '', esperar: async () => {} };
const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {} };
const fuente = (id, obtener) => ({ id, nombre: id, web: `https://${id}.es`, modo: 'html', requiere: [], urls: [`https://${id}.es/`], obtener });
const correr = (estado, fuentes) => escanear({
  ajustes: { ...AJUSTES, fuentes: {} }, estado, fuentes, http: sinRed, ahora: AHORA, env: {}, modulos,
  opciones: { sinEmails: true, forzar: true }, log: () => {},
});

describe('auditoría de octubre: escaneo', () => {
  test('si el escaneo se rompe a medias, se guardan el estado y la caché (el gasto de Apify) igualmente', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fallo-'));
    try {
      const ruta = (clave) => path.join(dir, `${clave}.json`);
      const cache = new Cache({ 'apify:gasto:2026-10': { t: 1, v: 120 } });
      guardarTrasFallo({ estado: { ofertas: {}, emails: { enviados: ['aviso-1'] } }, cache }, ruta);
      assert.deepEqual(JSON.parse(readFileSync(ruta('cache'), 'utf8')), { 'apify:gasto:2026-10': { t: 1, v: 120 } });
      assert.deepEqual(JSON.parse(readFileSync(ruta('estado'), 'utf8')).emails.enviados, ['aviso-1']);

      // Si uno no se puede escribir, el otro se guarda igual y se avisa.
      rmSync(ruta('cache'));
      const avisos = [];
      guardarTrasFallo({ estado: { roto: 1n }, cache }, ruta, (m) => avisos.push(m));
      assert.match(avisos.join('\n'), /No se ha podido guardar data\/estado\.json tras el fallo/);
      assert.ok(readFileSync(ruta('cache'), 'utf8').includes('apify:gasto'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('una oferta guardada con una lista a null o undefined se arregla en vez de romper el escaneo entero', () => {
    const o = completarOferta({ id: 'x:1', fuente: 'x', titulo: 'Casa', url: 'https://x.es/1', etiquetas: undefined, enlaces: null, fechas: { salida: undefined } });
    for (const campo of ['temas', 'etiquetas', 'enlaces', 'equivalentes', 'eventos']) assert.deepEqual(o[campo], [], campo);
    assert.equal(o.fechas.salida, null);
    assert.ok(validarOferta({ ...o, etiquetas: 'spa' }).includes('etiquetas debe ser una lista'));
  });

  test('0 ofertas con «reemplazar»: protege lo guardado aunque no se sepa el total de antes…', async () => {
    const estado = estadoInicial();
    for (const n of [1, 2]) estado.ofertas[`campings:${n}`] = oferta({ id: `campings:${n}`, fuente: 'campings', vistaUltima: AHORA.toISOString() });
    estado.fuentes.campings = { estado: 'ok' };
    await correr(estado, [fuente('campings', async () => ({ ofertas: [], reemplazar: true }))]);
    assert.equal(estado.fuentes.campings.estado, 'error');
    assert.deepEqual(Object.keys(estado.ofertas).sort(), ['campings:1', 'campings:2']);
  });

  test('…y, sin nada guardado que proteger, una web que se ha quedado sin ofertas vuelve a «ok»', async () => {
    const estado = estadoInicial();
    estado.fuentes.campings = { estado: 'error', total: 2, error: '0 ofertas (la última vez 2): no se borra lo guardado (¿ha cambiado la web?)' };
    await correr(estado, [fuente('campings', async () => ({ ofertas: [], reemplazar: true }))]);
    assert.equal(estado.fuentes.campings.estado, 'ok');
  });

  test('las fechas del texto: sin año, una ya empezada es de este año; con año, ese; y un día que no existe, ninguna', () => {
    const hoy = '2026-10-14';
    assert.deepEqual(fechasDeTexto('Escapada del 13 al 15 de octubre', hoy), { salida: '2026-10-13', vuelta: '2026-10-15' });
    assert.deepEqual(fechasDeTexto('Del 28 al 30 de diciembre de 2027', hoy), { salida: '2027-12-28', vuelta: '2027-12-30' });
    assert.deepEqual(fechasDeTexto('Del 30 de diciembre al 2 de enero de 2027', hoy), { salida: '2026-12-30', vuelta: '2027-01-02' });
    assert.deepEqual(fechasDeTexto('Del 6 al 8 de febrero', hoy), { salida: '2027-02-06', vuelta: '2027-02-08' });
    assert.equal(fechasDeTexto('Del 30 de febrero al 2 de marzo', hoy), null);
    assert.equal(fechasDeTexto('Del 29 al 31 de noviembre', hoy), null);
  });

  test('una bajada por noche se compara con el precio por noche (20 € de 100 €, no de 260 €)', () => {
    const porNoche = oferta({ precio: 240, unidad: 'total', noches: 3, bajada: 20, historialPorNoche: true });
    const total = oferta({ precio: 240, unidad: 'total', noches: 3, bajada: 20 });
    puntuar([porNoche, total], AJUSTES, { ahora: AHORA });
    assert.equal(porNoche.notaDetalle.partes.bajada, 10, '20 / (80 + 20) = 20 % → 10 puntos');
    assert.equal(total.notaDetalle.partes.bajada, 3.8, '20 / (240 + 20) = 7,7 % → 3,8 puntos');
  });

  test('el email de chollazos dice la bajada en su unidad: «/noche» si se sigue por noche', () => {
    const o = oferta({ precio: 240, unidad: 'total', noches: 3, bajada: 20, historialPorNoche: true, chollazo: true });
    const { html, texto } = alertaChollazos({ ofertas: [o], panelUrl: 'https://escapadasfinde.com/' });
    assert.match(`${html}\n${texto}`, /ha bajado 20[^\n<]*€\/noche/);
  });

  test('las fechas que se publican son las de Madrid (a las 00:30 ya es el día siguiente)', () => {
    // Martes 13 de octubre, 22:30 UTC = miércoles 14, 00:30 en Madrid.
    const html = bloquePortada({ generado: '2026-10-13T22:30:00Z', ofertas: [], fuentes: [], origen: { nombre: 'Barcelona' } }, []);
    assert.match(html, /Datos del mié 14 oct/);
  });

  test('un patrocinio «hasta» un día acaba a la medianoche de Madrid, no a la de UTC', () => {
    const o = () => oferta({ id: 'prueba:patrocinada' });
    const pagos = [{ ofertaId: 'prueba:patrocinada', anunciante: 'Hotel Mar', hasta: '2026-10-14' }];
    assert.deepEqual(aplicarAfiliacion(o(), { patrocinadas: pagos, ahora: new Date('2026-10-14T21:30:00Z') }).patrocinada, { anunciante: 'Hotel Mar' }, '23:30 en Madrid');
    assert.equal(aplicarAfiliacion(o(), { patrocinadas: pagos, ahora: new Date('2026-10-14T22:30:00Z') }).patrocinada, null, '00:30 del 15 en Madrid');
  });

  test('el aviso de una fuente desactivada no cuenta como problema (como en el panel)', () => {
    const viejo = '2026-10-01T00:00:00Z';
    const estado = (estadoFuente) => ({ fuentes: { sitio: { estado: estadoFuente, aviso: 'Solo 3 ofertas', desdeAviso: viejo } } });
    const ahora = new Date('2026-10-14T00:00:00Z');
    assert.deepEqual(fuentesConProblemas(estado('desactivada'), { ahora }), []);
    assert.equal(fuentesConProblemas(estado('ok'), { ahora })[0]?.tipo, 'aviso');
  });
});
