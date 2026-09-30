/**
 * Un test por cada fallo que encontró la auditoría de arquitectura (y el latente de
 * duplicados que encontró la de tests).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validarAjustes } from '../src/ajustes.js';
import { estadoInicial } from '../src/almacen.js';
import { escanear } from '../src/core/scan-pipeline.js';
import { marcarEquivalentes } from '../src/enriquecer/duplicados.js';
import { obtenerFestivos } from '../src/enriquecer/festivos.js';
import { esEvitada, precioPorPersonaNoche, puntuar } from '../src/enriquecer/puntuacion.js';
import { AHORA, AJUSTES, crearCtx, oferta } from './ayudas.js';

const sinRed = { json: async () => [], texto: async () => '', esperar: async () => {} };
const modulos = { obtenerFestivos: async () => [], geolocalizar: async () => {}, calcularCoche: async () => {} };
const fuente = (id, obtener) => ({ id, nombre: id, web: `https://${id}.es`, modo: 'html', requiere: [], urls: [`https://${id}.es/`], obtener });

describe('auditoría: el workflow no despliega un panel sin datos', () => {
  const workflow = readFileSync(new URL('../.github/workflows/vigilar.yml', import.meta.url), 'utf8');

  it('versionar, configurar, subir y desplegar Pages exigen que exista site/data/ofertas.json', () => {
    for (const paso of ['Versionar la caché del panel', 'actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages']) {
      const i = workflow.indexOf(paso);
      assert.ok(i > 0, paso);
      const bloque = workflow.slice(Math.max(0, i - 200), i + 300);
      assert.match(bloque, /hashFiles\('site\/data\/ofertas\.json'\) != ''/, paso);
    }
  });

  it('revisión continua: lanza «Vigilar ofertas» a menudo, se relanza y nunca solapa dos escaneos', () => {
    const relevo = readFileSync(new URL('../.github/workflows/relevo.yml', import.meta.url), 'utf8');
    assert.match(relevo, /gh workflow run vigilar\.yml/);
    assert.match(relevo, /gh workflow run relevo\.yml/, 'se pasa el relevo antes de acabar');
    assert.match(relevo, /group: relevo\s+cancel-in-progress: true/, 'un solo relevo vivo');
    assert.match(workflow, /group: vigilar\s+cancel-in-progress: false/, 'los escaneos van en cola, no se pisan');
    const minutos = Number(relevo.match(/DURANTE_MIN: (\d+)/)[1]) + Number(relevo.match(/CADA_MIN: (\d+)/)[1]);
    assert.ok(minutos < Number(relevo.match(/timeout-minutes: (\d+)/)[1]), 'termina (y pasa el relevo) antes del límite de tiempo');
  });

  it('guardar los datos no falla si no hay carpeta data', () => {
    assert.match(workflow, /\[ -d data \] \|\| \{ echo 'No hay datos que guardar'; exit 0; \}/);
  });
});

describe('auditoría: viajeros', () => {
  it('reparte los precios por alojamiento y los totales entre los viajeros de los ajustes', () => {
    const casa = oferta({ tipo: 'hotel', precio: 120, unidad: 'noche' });
    assert.equal(precioPorPersonaNoche(casa), 60, 'por defecto, 2');
    assert.equal(precioPorPersonaNoche(casa, 4), 30);
    assert.equal(precioPorPersonaNoche(oferta({ precio: 300, unidad: 'total', noches: 2 }), 3), 50);
  });

  it('el escaneo usa ajustes.viajeros y se lo pasa al panel', async () => {
    const estado = estadoInicial();
    const casa = oferta({ id: 'feed:1', fuente: 'feed', tipo: 'hotel', precio: 120, unidad: 'noche' });
    const { salida } = await escanear({
      ajustes: { ...AJUSTES, fuentes: {}, viajeros: 4 }, estado, fuentes: [fuente('feed', async () => ({ ofertas: [casa] }))],
      http: sinRed, ahora: AHORA, env: {}, modulos, opciones: { sinEmails: true, forzar: true }, log: () => {},
    });
    assert.equal(salida.ofertas.viajeros, 4);
    assert.equal(salida.ofertas.ofertas[0].precioNoche, 30);
  });
});

describe('auditoría: una fuente que publica con el id de otra', () => {
  it('da error en vez de dejar que el «reemplazar» de la otra le borre las ofertas', async () => {
    const estado = estadoInicial();
    const copiada = fuente('nueva', async () => ({ ofertas: [oferta({ id: 'vieja:1', fuente: 'vieja' })] }));
    await escanear({
      ajustes: { ...AJUSTES, fuentes: {} }, estado, fuentes: [copiada], http: sinRed, ahora: AHORA, env: {}, modulos,
      opciones: { sinEmails: true, forzar: true }, log: () => {},
    });
    assert.equal(estado.fuentes.nueva.estado, 'error');
    assert.match(estado.fuentes.nueva.error, /1 ofertas con fuente «vieja» en vez de «nueva»/);
    assert.deepEqual(Object.keys(estado.ofertas), []);
  });
});

describe('auditoría: preferencias de los ajustes', () => {
  const ajustes = { ...AJUSTES, preferencias: { temasFavoritos: ['spa'], evitarTemas: ['parques'], evitarDestinos: ['Andorra'] } };

  it('lo que se quiere evitar baja a 0 y nunca es chollazo; lo favorito sube', () => {
    const andorra = oferta({ titulo: 'Hotel', precio: 10, unidad: 'pp/noche', lugar: { nombre: 'Soldeu', pais: 'Andorra' } });
    const parque = oferta({ titulo: 'PortAventura', precio: 10, unidad: 'pp/noche', temas: ['parques'] });
    const spa = oferta({ titulo: 'Spa', precio: 60, unidad: 'pp/noche', temas: ['spa'] });
    const normal = oferta({ titulo: 'Casa', precio: 60, unidad: 'pp/noche', temas: ['rural'] });
    puntuar([andorra, parque, spa, normal], ajustes, { ahora: AHORA });
    assert.deepEqual([andorra.puntuacion, andorra.chollazo, parque.puntuacion, parque.chollazo], [0, false, 0, false]);
    assert.ok(Math.abs(spa.puntuacion - normal.puntuacion - 10) <= 1, 'lo favorito suma 10 (±1 por el redondeo)');
    assert.ok(esEvitada(oferta({ lugar: { nombre: 'Canillo', comunidad: null, pais: 'andorra' } }), ajustes.preferencias));
  });

  it('sin preferencias no cambia nada', () => {
    const a = oferta({ precio: 60, unidad: 'pp/noche', temas: ['spa'] });
    const b = oferta({ precio: 60, unidad: 'pp/noche', temas: ['spa'] });
    puntuar([a], { ...AJUSTES, preferencias: undefined }, { ahora: AHORA });
    puntuar([b], AJUSTES, { ahora: AHORA });
    assert.equal(a.puntuacion, b.puntuacion);
  });
});

describe('auditoría: festivos locales que se repiten cada año', () => {
  it('«MM-DD» vale para todos los años del horizonte; «AAAA-MM-DD», solo para el suyo', async () => {
    const { ctx } = crearCtx({ respuestas: () => [] });
    ctx.ajustes = { ...AJUSTES, puentes: { comunidad: 'ES-CT', festivosLocales: [{ fecha: '09-24', nombre: 'La Mercè' }, { fecha: '2027-06-24', nombre: 'Sant Joan' }] } };
    const festivos = await obtenerFestivos(ctx, [2026, 2027]);
    const locales = festivos.filter((f) => f.ambito === 'local').map((f) => f.fecha);
    assert.deepEqual(locales, ['2026-09-24', '2027-06-24', '2027-09-24']);
  });

  it('la validación acepta «MM-DD» y rechaza fechas imposibles', () => {
    const conLocales = (festivosLocales) => validarAjustes({ ...AJUSTES, puentes: { comunidad: 'ES-CT', festivosLocales } });
    assert.deepEqual(conLocales([{ fecha: '09-24', nombre: 'La Mercè' }]), []);
    assert.equal(conLocales([{ fecha: '13-40', nombre: 'Nada' }]).length, 1);
  });
});

describe('auditoría: duplicados de la misma web con una tercera web', () => {
  it('la hermana de la misma web no se esconde como duplicada; la de la otra web, sí', () => {
    const lugar = { nombre: 'Besalú', region: 'Girona', pais: 'España' };
    const estandar = oferta({ fuente: 'rusticae', titulo: 'Hotel Mas Bassó', tipo: 'hotel', precio: 100, unidad: 'noche', lugar });
    const suite = oferta({ fuente: 'rusticae', titulo: 'Hotel Mas Bassó', tipo: 'hotel', precio: 160, unidad: 'noche', lugar });
    const otraWeb = oferta({ fuente: 'weekendesk', titulo: 'Hotel Mas Bassó', tipo: 'hotel', precio: 130, unidad: 'noche', lugar });
    marcarEquivalentes([estandar, suite, otraWeb]);
    assert.deepEqual(suite.etiquetas, []);
    assert.deepEqual(otraWeb.etiquetas, ['duplicada']);
    assert.deepEqual(estandar.equivalentes.map((e) => e.fuente), ['weekendesk']);
  });
});
