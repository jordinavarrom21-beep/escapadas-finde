/**
 * Configuración rota o a medias: falla con un mensaje claro (ajustes) o avisa sin parar el
 * escaneo (secretos opcionales y email), y nunca enseña el valor de un secreto.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { esUrlPublica, validarAjustes } from '../src/ajustes.js';
import { guardarJson } from '../src/almacen.js';
import { diagnostico } from '../src/diagnostico.js';
import { FUENTES } from '../src/fuentes/index.js';

const AJUSTES = JSON.parse(readFileSync(new URL('../config/ajustes.json', import.meta.url), 'utf8'));
const con = (cambios) => validarAjustes({ ...AJUSTES, ...cambios });

describe('ajustes rotos', () => {
  it('la configuración del repositorio es válida', () => {
    assert.deepEqual(validarAjustes(AJUSTES), []);
  });
  it('panelUrl: dirección completa con dominio (https), o localhost para probar', () => {
    for (const mala of ['https://', 'https://sindominio', 'ftp://escapadasfinde.com', 'escapadasfinde.com', 'http://escapadasfinde.com/']) {
      assert.ok(con({ panelUrl: mala }).some((p) => p.startsWith('panelUrl')), mala);
    }
    for (const buena of ['https://escapadasfinde.com/', 'https://www.ejemplo.es', 'http://localhost:8080/', null]) {
      assert.deepEqual(con({ panelUrl: buena }), [], String(buena));
    }
    assert.equal(esUrlPublica(undefined), false);
  });
  it('origen en (0, 0) y aeropuertos que no son IATA', () => {
    assert.ok(con({ origen: { nombre: 'X', lat: 0, lon: 0 } }).some((p) => p.includes('(0, 0)')));
    const vuelos = { ...AJUSTES.vuelos, aeropuertos: ['BCN', 'bcn', 'MADRID'] };
    assert.ok(con({ vuelos }).some((p) => p.includes('«bcn», «MADRID» no son códigos IATA')));
  });
});

describe('copias seguras de los datos', () => {
  it('si no se puede escribir, el archivo bueno se queda como estaba y no queda .tmp', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'almacen-'));
    try {
      const ruta = path.join(carpeta, 'estado.json');
      guardarJson(ruta, { bueno: true });
      const circular = {};
      circular.yo = circular;
      assert.throws(() => guardarJson(ruta, circular));
      assert.deepEqual(JSON.parse(readFileSync(ruta, 'utf8')), { bueno: true });
      assert.deepEqual(readdirSync(carpeta).sort(), ['estado.json']);
      guardarJson(ruta, { bueno: 2 });
      assert.deepEqual(JSON.parse(readFileSync(`${ruta}.bak`, 'utf8')), { bueno: true }, 'la copia es la versión anterior');
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});

describe('diagnóstico', () => {
  it('dice qué falta sin parar nada y sin enseñar el valor de ningún secreto', () => {
    const env = { GMAIL_USER: 'yo@gmail.com', GMAIL_APP_PASSWORD: 'clave-secreta', TICKETMASTER_KEY: 'otra-secreta' };
    const { lineas, avisos } = diagnostico({ ajustes: AJUSTES, fuentes: FUENTES, env });
    const texto = lineas.join('\n');
    assert.match(texto, /falta EMAIL_TO/);
    assert.match(texto, /TICKETMASTER_KEY: puesto/);
    assert.match(texto, /AWIN_API_TOKEN: no puesto/);
    assert.doesNotMatch(texto, /clave-secreta|otra-secreta/);
    assert.deepEqual(avisos, ['Emails desactivados: la cuenta Gmail está a medias, falta EMAIL_TO']);
    assert.deepEqual(diagnostico({ ajustes: AJUSTES, fuentes: FUENTES, env: {} }).avisos, [], 'sin email no es un error');
  });
});
