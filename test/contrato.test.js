/**
 * Invariantes de docs/CONTRATOS.md: el modelo «Oferta», la ficha de cada fuente y la
 * configuración. Son los contratos que dan por hechos todos los módulos.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALOJAMIENTOS, REGIMENES, TEMAS, TIPOS, TRANSPORTES, UNIDADES, completarOferta, crearOferta, validarOferta,
} from '../src/modelo.js';
import { FUENTES } from '../src/fuentes/index.js';
import { cargarAjustes, validarAjustes } from '../src/ajustes.js';
import { AJUSTES } from './ayudas.js';

const RUTA_AJUSTES = fileURLToPath(new URL('../config/ajustes.json', import.meta.url));

/** Oferta mínima válida; cada test rompe un solo campo. */
const base = (campos = {}) => ({
  id: 'prueba:1', fuente: 'prueba', titulo: 'Escapada al Montseny', url: 'https://ejemplo.es/oferta', ...campos,
});
const problemas = (campos) => validarOferta(completarOferta(base(campos))).join('; ');

/** Valor que no está en el catálogo, aunque el catálogo crezca. */
function fueraDelCatalogo(catalogo) {
  const valor = `${catalogo[0]}-que-no-existe`;
  assert.ok(!catalogo.includes(valor), `«${valor}» ya no sirve como valor inválido`);
  return valor;
}
const IDS_TEMAS = TEMAS.map((tema) => tema.id);

describe('modelo: oferta válida', () => {
  test('crearOferta rellena los valores por defecto', () => {
    const oferta = crearOferta(base({ precio: 120, unidad: 'pp' }));
    assert.equal(oferta.tipo, 'escapada');
    assert.deepEqual(oferta.temas, []);
    assert.deepEqual(oferta.fechas, { salida: null, vuelta: null, findeId: null, puenteId: null });
    assert.equal(oferta.precioNoche, null);
    assert.deepEqual(validarOferta(oferta), []);
  });

  test('acepta lo que el contrato permite dejar vacío', () => {
    const oferta = crearOferta(base({ precio: null, unidad: null, lugar: { nombre: 'Girona', lat: null, lon: null } }));
    assert.deepEqual(validarOferta(oferta), []);
  });
});

describe('modelo: campos obligatorios', () => {
  test('el id tiene que empezar por «fuente:»', () => {
    assert.throws(() => crearOferta(base({ id: 'otra:1' })), /id debe empezar/);
    assert.throws(() => crearOferta(base({ id: '1' })), /id debe empezar/);
    assert.match(problemas({ fuente: '' }), /falta fuente/);
  });

  test('el título no puede estar vacío', () => {
    assert.throws(() => crearOferta(base({ titulo: '   ' })), /falta título/);
  });

  test('la url tiene que ser http(s)', () => {
    assert.throws(() => crearOferta(base({ url: '/ofertas/1' })), /url no válida/);
    assert.throws(() => crearOferta(base({ url: 'ftp://ejemplo.es/1' })), /url no válida/);
  });

  test('el tipo tiene que ser uno de los del catálogo', () => {
    assert.throws(() => crearOferta(base({ tipo: fueraDelCatalogo(TIPOS) })), /tipo no válido/);
    for (const tipo of TIPOS) assert.deepEqual(validarOferta(crearOferta(base({ tipo }))), []);
  });
});

describe('modelo: precio y unidades', () => {
  test('el precio no puede ser negativo ni NaN', () => {
    assert.throws(() => crearOferta(base({ precio: -1 })), /precio no válido/);
    assert.throws(() => crearOferta(base({ precio: Number.NaN })), /precio no válido/);
    assert.throws(() => crearOferta(base({ precio: '120' })), /precio no válido/);
    assert.deepEqual(validarOferta(crearOferta(base({ precio: 0 }))), []);
  });

  test('unidad y régimen solo admiten los valores conocidos', () => {
    assert.throws(() => crearOferta(base({ unidad: fueraDelCatalogo(UNIDADES) })), /unidad no válida/);
    assert.throws(() => crearOferta(base({ regimen: fueraDelCatalogo(REGIMENES) })), /régimen no válido/);
    for (const unidad of UNIDADES) assert.deepEqual(validarOferta(crearOferta(base({ precio: 50, unidad }))), []);
  });
});

describe('modelo: catálogos', () => {
  test('los temas repetidos se quitan y los desconocidos fallan', () => {
    const [primero, segundo] = IDS_TEMAS;
    const oferta = crearOferta(base({ temas: [primero, primero, segundo] }));
    assert.deepEqual(oferta.temas, [primero, segundo]);
    assert.throws(() => crearOferta(base({ temas: [primero, fueraDelCatalogo(IDS_TEMAS)] })), /temas no válidos/);
    assert.throws(() => crearOferta(base({ temas: primero })), /temas no válidos/);
  });

  test('todos los temas del catálogo valen como tema de una oferta', () => {
    assert.deepEqual(validarOferta(crearOferta(base({ temas: IDS_TEMAS }))), []);
  });

  test('transporte y alojamiento solo admiten los valores conocidos', () => {
    assert.throws(() => crearOferta(base({ transporte: fueraDelCatalogo(TRANSPORTES) })), /transporte no válido/);
    assert.throws(() => crearOferta(base({ alojamiento: fueraDelCatalogo(ALOJAMIENTOS) })), /alojamiento no válido/);
    for (const transporte of TRANSPORTES) assert.deepEqual(validarOferta(crearOferta(base({ transporte }))), []);
    for (const alojamiento of ALOJAMIENTOS) assert.deepEqual(validarOferta(crearOferta(base({ alojamiento }))), []);
  });
});

describe('modelo: fechas y lugar', () => {
  test('publicada y caduca tienen que ser fechas ISO o null', () => {
    assert.throws(() => crearOferta(base({ publicada: 'ayer' })), /publicada no es una fecha ISO/);
    assert.throws(() => crearOferta(base({ caduca: '31/12/2026' })), /caduca no es una fecha ISO/);
    assert.deepEqual(validarOferta(crearOferta(base({ publicada: '2026-09-18T08:00:00Z', caduca: null }))), []);
  });

  test('las coordenadas del lugar tienen que ser números', () => {
    assert.throws(() => crearOferta(base({ lugar: { nombre: 'Girona', lat: '41.98', lon: 2.82 } })), /coordenadas no válidas/);
    assert.throws(() => crearOferta(base({ lugar: { nombre: 'Girona', lat: 41.98, lon: Number.NaN } })), /coordenadas no válidas/);
  });

  test('validarOferta devuelve todos los problemas juntos', () => {
    const rota = { id: 'x', fuente: 'prueba', titulo: '', url: 'no', tipo: fueraDelCatalogo(TIPOS) };
    const lista = validarOferta(completarOferta(rota));
    assert.equal(lista.length, 4);
    assert.match(lista.join('; '), /id debe empezar.+falta título.+url no válida.+tipo no válido/);
  });
});

describe('modelo: completarOferta', () => {
  test('rellena los campos nuevos de una oferta guardada sin validarla', () => {
    const guardada = { id: 'prueba:1', fuente: 'prueba', titulo: 'Antigua', url: 'https://ejemplo.es/1', temas: ['spa'] };
    const completada = completarOferta(guardada);
    assert.deepEqual(completada.eventos, []);
    assert.equal(completada.tiempo, null);
    assert.equal(completada.referencia, null);
    assert.equal(completada.cocheEstimado, false);
    assert.deepEqual(completada.temas, ['spa']);
    assert.deepEqual(completada.fechas, { salida: null, vuelta: null, findeId: null, puenteId: null });
  });

  test('no valida nada: acepta una oferta imposible', () => {
    const tipo = fueraDelCatalogo(TIPOS);
    const rota = completarOferta({ tipo, precio: -5 });
    assert.equal(rota.tipo, tipo);
    assert.ok(validarOferta(rota).length > 0);
  });

  test('conserva las fechas que ya traía', () => {
    const completada = completarOferta({ fechas: { salida: '2026-10-02T19:00:00' } });
    assert.equal(completada.fechas.salida, '2026-10-02T19:00:00');
    assert.equal(completada.fechas.puenteId, null);
  });
});

describe('contrato de las fuentes', () => {
  const MODOS = ['feed', 'api', 'html', 'navegador', 'afiliado', 'buzon'];
  const esUrl = (url) => typeof url === 'string' && /^https?:\/\//.test(url);

  test('los ids son únicos', () => {
    const ids = FUENTES.map((f) => f.id);
    assert.deepEqual(ids, [...new Set(ids)]);
  });

  for (const fuente of FUENTES) {
    test(`${fuente.id} cumple la ficha de la fuente`, () => {
      assert.match(fuente.id, /^[a-z0-9]+$/, 'el id va en minúsculas y sin espacios');
      assert.ok(fuente.nombre?.trim(), 'falta el nombre para el panel');
      assert.ok(esUrl(fuente.web), `web no válida: ${fuente.web}`);
      assert.ok(MODOS.includes(fuente.modo), `modo no válido: ${fuente.modo}`);
      assert.ok(Array.isArray(fuente.requiere) && fuente.requiere.every((v) => typeof v === 'string'),
        'requiere debe ser una lista de variables de entorno');
      assert.ok(Array.isArray(fuente.urls), 'urls debe ser una lista');
      assert.ok(fuente.urls.every(esUrl), `urls debe llevar URLs absolutas: ${fuente.urls}`);
      assert.equal(typeof fuente.obtener, 'function', 'obtener debe ser una función');
      // Sin urls no se puede comprobar robots.txt; solo el buzón se libra (lee por IMAP).
      if (!fuente.urls.length) assert.equal(fuente.modo, 'buzon', 'una fuente web tiene que declarar sus urls');
    });
  }

  test('cada fuente configurada en ajustes.json existe', () => {
    const ids = new Set(FUENTES.map((f) => f.id));
    const desconocidas = Object.keys(AJUSTES.fuentes).filter((id) => !ids.has(id));
    assert.deepEqual(desconocidas, []);
  });
});

describe('contrato de la configuración', () => {
  const sin = (seccion, campos) => ({ ...AJUSTES, [seccion]: { ...AJUSTES[seccion], ...campos } });

  test('config/ajustes.json es válida', () => {
    assert.deepEqual(validarAjustes(AJUSTES), []);
    assert.equal(cargarAjustes(RUTA_AJUSTES).origen.nombre, AJUSTES.origen.nombre);
  });

  test('el origen necesita nombre y coordenadas numéricas', () => {
    assert.match(validarAjustes(sin('origen', { lat: '41.4' })).join('; '), /origen\.lat/);
    assert.match(validarAjustes(sin('origen', { nombre: '' })).join('; '), /origen\.nombre/);
    assert.equal(validarAjustes({ ...AJUSTES, origen: null }).filter((problema) => problema.startsWith('origen')).length, 1);
  });

  test('los números que usa el escaneo tienen que ser números', () => {
    assert.match(validarAjustes({ ...AJUSTES, retencionDias: '10' }).join('; '), /retencionDias/);
    assert.match(validarAjustes(sin('vuelos', { findes: 2.5 })).join('; '), /vuelos\.findes/);
    assert.match(validarAjustes(sin('coche', { consumoL100km: 0 })).join('; '), /coche\.consumoL100km/);
    assert.match(validarAjustes({ ...AJUSTES, viajeros: 0 }).join('; '), /viajeros/);
  });

  test('emails necesita resumen y chollazos completos', () => {
    const emails = { ...AJUSTES.emails, resumen: { activo: true, diaSemana: 9, hora: 8 }, chollazos: undefined };
    const lista = validarAjustes({ ...AJUSTES, emails }).join('; ');
    assert.match(lista, /emails\.resumen\.diaSemana/);
    assert.match(lista, /emails\.chollazos/);
    assert.match(validarAjustes({ ...AJUSTES, emails: null }).join('; '), /emails debe ser un objeto/);
  });

  test('fuentes es un objeto de configuraciones, no una lista', () => {
    assert.match(validarAjustes({ ...AJUSTES, fuentes: [] }).join('; '), /fuentes debe ser un objeto/);
    assert.match(validarAjustes(sin('fuentes', { ouigo: { intervaloMin: -5 } })).join('; '), /fuentes\.ouigo\.intervaloMin/);
    assert.match(validarAjustes(sin('fuentes', { ouigo: { activa: 'sí' } })).join('; '), /fuentes\.ouigo\.activa/);
  });

  test('cargarAjustes falla pronto y explica todos los problemas', (t) => {
    assert.throws(() => cargarAjustes('config/no-existe.json'), /No se puede leer la configuración/);

    const carpeta = mkdtempSync(path.join(tmpdir(), 'escapadas-ajustes-'));
    t.after(() => rmSync(carpeta, { recursive: true, force: true }));
    const ruta = path.join(carpeta, 'ajustes.json');
    writeFileSync(ruta, JSON.stringify({ ...AJUSTES, viajeros: 0, retencionDias: null }));
    assert.throws(() => cargarAjustes(ruta), (error) => {
      assert.match(error.message, /Configuración no válida/);
      assert.match(error.message, /retencionDias/);
      assert.match(error.message, /viajeros/);
      return true;
    });
  });
});
