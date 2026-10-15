import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MODULOS, codigoSalida, escanear, leerDatos, leerOpciones, textoDelFallo, urlPanel } from '../src/escanear.js';
import { ErrorHttp } from '../src/util/http.js';
import * as nucleo from '../src/core/scan-pipeline.js';
import { FUENTES } from '../src/fuentes/index.js';
import { estadoInicial } from '../src/almacen.js';
import { AHORA, AJUSTES, oferta } from './ayudas.js';

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

  test('una fuente que no acaba en su tiempo queda en error, con lo guardado, y las demás siguen', async () => {
    const fuente = (id, obtener, extra = {}) => ({ id, nombre: id, web: `https://${id}.es`, modo: 'feed', requiere: [], urls: [`https://${id}.es/feed`], obtener, ...extra });
    // Una web que se queda a medias: ni contesta ni falla.
    const lenta = fuente('lenta', () => new Promise(() => {}), { limiteMin: 0.002 });
    const rapida = fuente('rapida', async () => ({ ofertas: [oferta({ id: 'rapida:1', fuente: 'rapida' })] }));
    const estado = estadoInicial();
    estado.ofertas['lenta:1'] = oferta({ id: 'lenta:1', fuente: 'lenta' });
    const { estado: final, informe } = await escanear({
      ajustes: { ...AJUSTES, fuentes: {} }, estado, fuentes: [lenta, rapida], http: sinRed, ahora: AHORA, env: {}, modulos,
      opciones: { sinEmails: true }, log: () => {},
    });
    assert.equal(final.fuentes.lenta.estado, 'error');
    assert.match(final.fuentes.lenta.error, /^No ha terminado en 0\.002 minutos/);
    assert.ok(final.ofertas['lenta:1'], 'conserva sus ofertas');
    assert.equal(final.fuentes.rapida.estado, 'ok');
    assert.deepEqual(informe.cortadas, ['lenta']);
  });

  test('ninguna fuente tiene más tiempo que el que deja el job de 20 minutos (vigilar.yml)', () => {
    for (const f of FUENTES) assert.ok((f.limiteMin ?? nucleo.LIMITE_FUENTE_MIN) <= 12, f.id);
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

  test('si se rompe, el registro dice qué ha pasado sin la URL ni la respuesta de la web', () => {
    const http = new ErrorHttp(401, 'https://app.ticketmaster.com/discovery/v2/events.json?apikey=SECRETO');
    http.cuerpo = '{"fault":"clave SECRETO no válida"}';
    const texto = textoDelFallo(new Error('Fallo al leer la agenda', { cause: http }));
    assert.match(texto, /^Error: Fallo al leer la agenda/);
    assert.match(texto, /Causa: ErrorHttp: HTTP 401 .*app\.ticketmaster\.com/);
    assert.match(texto, /escanear\.test\.js/, 'con la pila, para saber dónde');
    assert.doesNotMatch(texto, /SECRETO/);
    assert.equal(textoDelFallo('texto suelto'), 'texto suelto');
  });
});
