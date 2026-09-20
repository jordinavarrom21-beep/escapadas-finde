/** Estado persistente: versión, migraciones, validación, copias de seguridad, fusión y poda. */
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  VERSION_ESTADO, cargarEstado, estadoInicial, fusionar, guardarJson, migrarEstado, podar, validarEstado,
} from '../src/almacen.js';
import { AHORA, oferta } from './ayudas.js';

const CARPETA = mkdtempSync(path.join(tmpdir(), 'escapadas-almacen-'));
after(() => rmSync(CARPETA, { recursive: true, force: true }));

let contador = 0;
const rutaNueva = () => path.join(CARPETA, `estado-${contador++}.json`);
const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

describe('migración del estado', () => {
  /** Dos migraciones de mentira para probar el mecanismo (hoy no hay ninguna de verdad). */
  const MIGRACIONES = {
    3: (estado) => ({ ...estado, pasos: [...estado.pasos, 3] }),
    2: (estado) => ({ ...estado, pasos: [...estado.pasos, 2] }),
  };

  test('el estado inicial ya está en la última versión', () => {
    assert.equal(estadoInicial().version, VERSION_ESTADO);
    assert.deepEqual(migrarEstado(estadoInicial()), estadoInicial());
  });

  test('aplica en orden las migraciones que faltan', () => {
    assert.deepEqual(migrarEstado({ version: 1, pasos: [] }, MIGRACIONES), { version: 3, pasos: [2, 3] });
  });

  test('no repite las migraciones ya aplicadas', () => {
    assert.deepEqual(migrarEstado({ version: 2, pasos: [] }, MIGRACIONES), { version: 3, pasos: [3] });
  });

  test('un estado guardado sin version se da por la 1', () => {
    assert.deepEqual(migrarEstado({ pasos: [] }, MIGRACIONES), { version: 3, pasos: [2, 3] });
    assert.equal(migrarEstado({ ofertas: {} }).version, 1);
  });

  test('no modifica el estado recibido', () => {
    const original = { version: 1, pasos: [] };
    migrarEstado(original, MIGRACIONES);
    assert.deepEqual(original, { version: 1, pasos: [] });
  });
});

describe('validación del estado', () => {
  test('el estado inicial es válido', () => {
    assert.deepEqual(validarEstado(estadoInicial()), []);
  });

  test('ofertas y fuentes tienen que ser objetos', () => {
    const problemas = validarEstado({ ...estadoInicial(), ofertas: [], fuentes: null });
    assert.equal(problemas.length, 2);
    assert.match(problemas.join(' '), /ofertas debe ser un objeto/);
    assert.match(problemas.join(' '), /fuentes debe ser un objeto/);
  });

  test('emails tiene que traer sus campos', () => {
    const sinEmails = validarEstado({ ...estadoInicial(), emails: undefined });
    assert.deepEqual(sinEmails, ['emails debe ser un objeto']);

    const emails = { ...estadoInicial().emails, inicializado: 'sí', alertados: [], enviosHoy: null };
    const problemas = validarEstado({ ...estadoInicial(), emails });
    assert.match(problemas.join(' '), /emails\.inicializado/);
    assert.match(problemas.join(' '), /emails\.alertados/);
    assert.match(problemas.join(' '), /emails\.enviosHoy/);
  });

  test('avisa de un estado de una versión más nueva y de lo que no es un objeto', () => {
    assert.match(validarEstado({ ...estadoInicial(), version: VERSION_ESTADO + 1 })[0], /versión más nueva/);
    assert.match(validarEstado({ ...estadoInicial(), version: 0 })[0], /version no válida/);
    assert.deepEqual(validarEstado(null), ['el estado no es un objeto']);
  });
});

describe('cargarEstado', () => {
  const cargarConAvisos = (ruta) => {
    const avisos = [];
    const estado = cargarEstado(ruta, { log: (mensaje) => avisos.push(mensaje) });
    return { estado, avisos };
  };

  test('sin archivo empieza de cero y no avisa de nada', () => {
    const { estado, avisos } = cargarConAvisos(rutaNueva());
    assert.deepEqual(estado, estadoInicial());
    assert.deepEqual(avisos, []);
  });

  test('carga y migra un estado guardado', () => {
    const ruta = rutaNueva();
    const estado = estadoInicial();
    fusionar(estado, 'prueba', { ofertas: [oferta()] }, AHORA);
    delete estado.version; // guardado antes de que el estado llevara versión
    guardarJson(ruta, estado);

    const cargado = cargarEstado(ruta);
    assert.equal(cargado.version, VERSION_ESTADO);
    assert.deepEqual(Object.keys(cargado.ofertas), Object.keys(estado.ofertas));
  });

  test('con el JSON roto avisa y empieza de cero', () => {
    const ruta = rutaNueva();
    writeFileSync(ruta, '{"ofertas": {sin cerrar');
    const { estado, avisos } = cargarConAvisos(ruta);
    assert.deepEqual(estado, estadoInicial());
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /no se puede leer/);
    assert.match(avisos[0], /\.bak/);
  });

  test('con un estado no válido avisa y empieza de cero', () => {
    const ruta = rutaNueva();
    writeFileSync(ruta, JSON.stringify({ version: 1, ofertas: [], fuentes: {} }));
    const { estado, avisos } = cargarConAvisos(ruta);
    assert.deepEqual(estado, estadoInicial());
    assert.match(avisos[0], /estado no válido/);
    assert.match(avisos[0], /ofertas debe ser un objeto/);
  });
});

describe('guardarJson', () => {
  test('la primera escritura no deja copia y no quedan temporales', () => {
    const ruta = path.join(CARPETA, 'nuevo', 'datos.json');
    guardarJson(ruta, { a: 1 });
    assert.deepEqual(leer(ruta), { a: 1 });
    assert.deepEqual(readdirSync(path.dirname(ruta)), ['datos.json']);
  });

  test('guarda en .bak lo anterior y solo conserva la última copia', () => {
    const ruta = rutaNueva();
    guardarJson(ruta, { paso: 1 });
    assert.equal(existsSync(`${ruta}.bak`), false);

    guardarJson(ruta, { paso: 2 });
    assert.deepEqual(leer(`${ruta}.bak`), { paso: 1 });

    guardarJson(ruta, { paso: 3 });
    assert.deepEqual(leer(ruta), { paso: 3 });
    assert.deepEqual(leer(`${ruta}.bak`), { paso: 2 });
  });

  test('la copia permite recuperar un estado que se ha corrompido', () => {
    const ruta = rutaNueva();
    const estado = estadoInicial();
    fusionar(estado, 'prueba', { ofertas: [oferta()] }, AHORA);
    guardarJson(ruta, estado);
    guardarJson(ruta, estado); // la copia se crea al sustituir un archivo que ya existía
    writeFileSync(ruta, 'basura');

    assert.deepEqual(cargarEstado(ruta, { log: () => {} }), estadoInicial());
    assert.deepEqual(validarEstado(leer(`${ruta}.bak`)), []);
  });
});

describe('fusionar', () => {
  test('conserva vistaPrimera y actualiza vistaUltima', () => {
    const estado = estadoInicial();
    const original = oferta({ fuente: 'f', precio: 100 });
    fusionar(estado, 'f', { ofertas: [original] }, AHORA);
    const despues = new Date(AHORA.getTime() + 3_600_000);
    const resultado = fusionar(estado, 'f', { ofertas: [{ ...original, precio: 80 }] }, despues);

    assert.deepEqual(resultado, { nuevas: 0, total: 1, borradas: 0 });
    const guardada = estado.ofertas[original.id];
    assert.equal(guardada.precio, 80);
    assert.equal(guardada.vistaPrimera, AHORA.toISOString());
    assert.equal(guardada.vistaUltima, despues.toISOString());
  });

  test('con reemplazar borra las ofertas de la fuente que ya no aparecen', () => {
    const estado = estadoInicial();
    const [a, b] = [oferta({ fuente: 'f' }), oferta({ fuente: 'f' })];
    const ajena = oferta({ fuente: 'otra' });
    fusionar(estado, 'f', { ofertas: [a, b] }, AHORA);
    fusionar(estado, 'otra', { ofertas: [ajena] }, AHORA);

    const resultado = fusionar(estado, 'f', { ofertas: [a], reemplazar: true }, AHORA);
    assert.deepEqual(resultado, { nuevas: 0, total: 1, borradas: 1 });
    assert.deepEqual(Object.keys(estado.ofertas).sort(), [a.id, ajena.id].sort());
  });

  test('reemplazar con función solo borra lo que devuelve true', () => {
    const estado = estadoInicial();
    const [ida, vuelta] = [oferta({ fuente: 'f', etiquetas: ['consulta-ok'] }), oferta({ fuente: 'f', etiquetas: [] })];
    fusionar(estado, 'f', { ofertas: [ida, vuelta] }, AHORA);

    const resultado = fusionar(estado, 'f', { ofertas: [], reemplazar: (o) => o.etiquetas.includes('consulta-ok') }, AHORA);
    assert.equal(resultado.borradas, 1);
    assert.deepEqual(Object.keys(estado.ofertas), [vuelta.id]);
  });

  test('cuenta las nuevas de cada fusión', () => {
    const estado = estadoInicial();
    const primera = oferta({ fuente: 'f' });
    assert.equal(fusionar(estado, 'f', { ofertas: [primera] }, AHORA).nuevas, 1);
    assert.equal(fusionar(estado, 'f', { ofertas: [primera, oferta({ fuente: 'f' })] }, AHORA).nuevas, 1);
  });
});

describe('podar', () => {
  test('quita caducadas, vuelos ya salidos y olvidadas, y deja el resto', () => {
    const estado = estadoInicial();
    const viva = oferta();
    const caducada = oferta({ caduca: '2026-09-17T23:00:00Z' });
    const porCaducar = oferta({ caduca: '2026-09-30T23:00:00Z' });
    const yaSalio = oferta({ tipo: 'vuelo', fechas: { salida: '2026-09-17T10:00:00' } });
    const saleEsteFinde = oferta({ tipo: 'vuelo', fechas: { salida: '2026-09-18T19:00:00' } });
    fusionar(estado, 'prueba', { ofertas: [viva, caducada, porCaducar, yaSalio, saleEsteFinde] }, AHORA);

    const olvidada = oferta();
    fusionar(estado, 'prueba', { ofertas: [olvidada] }, new Date('2026-09-01T00:00:00Z'));

    assert.equal(podar(estado, AHORA, { retencionDias: 10 }), 3);
    assert.deepEqual(Object.keys(estado.ofertas).sort(), [viva.id, porCaducar.id, saleEsteFinde.id].sort());
  });

  test('una retención más larga conserva las olvidadas', () => {
    const estado = estadoInicial();
    const antigua = oferta();
    fusionar(estado, 'prueba', { ofertas: [antigua] }, new Date('2026-09-01T00:00:00Z'));
    assert.equal(podar(estado, AHORA, { retencionDias: 30 }), 0);
    assert.deepEqual(Object.keys(estado.ofertas), [antigua.id]);
  });
});
