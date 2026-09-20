import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULOS, escanear, urlPanel } from '../src/escanear.js';
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
