import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MODULOS, codigoSalida, escanear, leerDatos, leerOpciones, urlPanel } from '../src/escanear.js';
import * as nucleo from '../src/core/scan-pipeline.js';
import { AHORA, AJUSTES } from './ayudas.js';

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const sinRed = { json: async () => [], texto: async () => '', esperar: async () => {} };
const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {} };

describe('escanear (CLI)', () => {
  test('reexporta el núcleo para quien lo importaba desde aquí', () => {
    assert.equal(escanear, nucleo.escanear);
    assert.equal(urlPanel, nucleo.urlPanel);
    assert.equal(MODULOS, nucleo.MODULOS);
  });

  test('ejecuta las fuentes respetando ajustes.maxFuentesEnParalelo', async () => {
    let activas = 0;
    let pico = 0;
    const fuente = (id) => ({
      id, nombre: id.toUpperCase(), web: `https://${id}.es`, modo: 'feed', requiere: [], urls: [`https://${id}.es/feed`],
      async obtener() {
        activas += 1;
        pico = Math.max(pico, activas);
        await esperar(5);
        activas -= 1;
        return { ofertas: [] };
      },
    });
    const fuentes = ['a', 'b', 'c', 'd', 'e'].map(fuente);
    const { salida } = await escanear({
      ajustes: { ...AJUSTES, fuentes: {}, maxFuentesEnParalelo: 2 },
      fuentes, http: sinRed, ahora: AHORA, env: {}, modulos, opciones: { sinEmails: true }, log: () => {},
    });
    assert.equal(pico, 2);
    assert.deepEqual(salida.ofertas.fuentes.map((f) => f.estado), ['ok', 'ok', 'ok', 'ok', 'ok']);
  });
});

describe('escanear (CLI): argumentos, datos y código de salida', () => {
  test('lee las opciones y rechaza lo que no entiende en vez de escanearlo todo', () => {
    assert.deepEqual(leerOpciones([]), { forzar: false, sinEmails: false, diagnostico: false, solo: null });
    assert.equal(leerOpciones(['--diagnostico']).diagnostico, true);
    assert.deepEqual(leerOpciones(['--forzar', '--sin-emails', '--solo=ryanair'], ['ryanair']), { forzar: true, sinEmails: true, diagnostico: false, solo: 'ryanair' });
    assert.throws(() => leerOpciones(['--solo', 'ryanair']), /Argumento no válido: --solo ryanair/);
    assert.throws(() => leerOpciones(['--forzr']), /Argumento no válido: --forzr/);
    assert.throws(() => leerOpciones(['--solo=rynair'], ['ryanair', 'volotea']), /No hay ninguna fuente «rynair»/);
  });

  test('datos rotos: la copia .bak y, si tampoco, el valor por defecto (sin compartirlo)', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'escanear-'));
    const avisos = [];
    const avisar = (m) => avisos.push(m);
    const ruta = path.join(carpeta, 'historial.json');
    assert.deepEqual(leerDatos(ruta, { vacio: true }, avisar), { vacio: true }, 'si no existe, el valor por defecto sin avisar');
    assert.deepEqual(avisos, []);
    writeFileSync(ruta, '{"a": [["2026-09-18", 40]]}');
    assert.deepEqual(leerDatos(ruta, {}, avisar), { a: [['2026-09-18', 40]] });
    writeFileSync(ruta, '{"a": [["2026-09-18"');
    writeFileSync(`${ruta}.bak`, '{"a": []}');
    assert.deepEqual(leerDatos(ruta, {}, avisar), { a: [] });
    assert.match(avisos.at(-1), /copia anterior \(\.bak\)/);
    writeFileSync(`${ruta}.bak`, 'no es json');
    const porDefecto = { n: [] };
    const leido = leerDatos(ruta, porDefecto, avisar);
    assert.deepEqual(leido, porDefecto);
    assert.notEqual(leido, porDefecto, 'una copia: el escaneo no puede modificar el valor por defecto');
    assert.match(avisos.at(-1), /se empieza de cero/);
  });

  test('código 1 solo si han fallado todas las fuentes que se han ejecutado en esta pasada', () => {
    const ahora = '2026-09-18T08:00:00.000Z';
    const antes = '2026-09-18T06:00:00.000Z';
    const f = (estado, ultimoIntento = ahora) => ({ estado, ultimoIntento });
    assert.equal(codigoSalida({ fuentes: [f('error'), f('error')] }, ahora), 1);
    assert.equal(codigoSalida({ fuentes: [f('error'), f('ok')] }, ahora), 0);
    assert.equal(codigoSalida({ fuentes: [f('error'), f('ok', antes)] }, ahora), 1, 'una «ok» de otra pasada no lo esconde');
    assert.equal(codigoSalida({ fuentes: [f('ok', antes), f('desactivada')] }, ahora), 0, 'si no se ha ejecutado ninguna, no es un fallo');
  });
});
