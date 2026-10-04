/**
 * Agendas nuevas con muestras reales (4 oct 2026): Comunitat Valenciana (IVC), Zaragoza y
 * Málaga. Mismo formato que las demás: {nombre, desde, hasta, lat, lon, url, municipio, tipo, precio}.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PROVEEDORES, evento, leerCsv, malaga, noEsUnPlan, valenciana, zaragoza } from '../src/enriquecer/agendas.js';
import { anadirEventos } from '../src/enriquecer/eventos.js';
import { findesProximos } from '../src/util/fechas.js';
import { crearCtx, leerFixtureJson, oferta } from './ayudas.js';

const GVA = leerFixtureJson('eventos-gva.json');
const ZARAGOZA = leerFixtureJson('eventos-zaragoza.json');
const MALAGA = readFileSync(new URL('./fixtures/eventos-malaga.csv', import.meta.url), 'utf8');
const [DESDE, HASTA] = ['2026-10-04', '2026-11-03'];

describe('Comunitat Valenciana (IVC)', () => {
  test('rehace cada evento de sus campos sueltos, con tipo, sitio y precio; fuera los de otras fechas y sin coordenadas', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => GVA });
    const eventos = await valenciana.descargar(ctx, DESDE, HASTA);
    assert.match(peticiones[0], /^https:\/\/dadesobertes\.gva\.es\/dataset\/.+\.json$/);
    assert.equal(eventos.length, 3);
    assert.deepEqual(eventos.map((e) => e.tipo).sort(), ['cine', 'escena', 'musica']);
    for (const e of eventos) {
      assert.ok(e.desde >= DESDE && e.desde <= HASTA && Number.isFinite(e.lat) && Number.isFinite(e.lon) && e.municipio, JSON.stringify(e));
    }
  });
  test('si cambia el formato, falla claro', async () => {
    const { ctx } = crearCtx({ respuestas: () => ({ error: 'x' }) });
    await assert.rejects(valenciana.descargar(ctx, DESDE, HASTA), /respuesta inesperada de dadesobertes\.gva\.es/);
  });
});

describe('Zaragoza', () => {
  test('pide el rango de fechas, en WGS84; cada evento con su sitio, tipo y precio; sin cursos ni formación', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => ZARAGOZA });
    const eventos = await zaragoza.descargar(ctx, DESDE, HASTA);
    const u = new URL(peticiones[0]);
    assert.equal(u.searchParams.get('srsname'), 'wgs84');
    assert.equal(u.searchParams.get('q'), `startDate=le=${HASTA}T23:59:59Z;endDate=ge=${DESDE}T00:00:00Z`);
    assert.equal(peticiones.length, 1, 'una página basta: no pide más');
    assert.ok(eventos.length >= 5);
    assert.ok(eventos.every((e) => e.lat > 41 && e.lat < 42 && e.lon > -1.2 && e.lon < -0.6), 'en Zaragoza');
    assert.ok(eventos.some((e) => e.tipo === 'musica') && eventos.some((e) => e.tipo === 'escena') && eventos.some((e) => e.tipo === 'cine'));
    assert.ok(eventos.every((e) => /^https:\/\/www\.zaragoza\.es\//.test(e.url)));
    assert.ok(eventos.some((e) => e.precio === 'Gratis' || /€$/.test(e.precio ?? '')));
  });
});

describe('Málaga', () => {
  test('CSV con comillas y saltos de línea dentro de los campos', () => {
    const filas = leerCsv('"A","B"\r\n"uno, dos","tres\r\ncuatro"\r\n"cinco ""seis""",7\r\n');
    assert.deepEqual(filas, [{ A: 'uno, dos', B: 'tres\r\ncuatro' }, { A: 'cinco "seis"', B: '7' }]);
  });
  test('la agenda del año, en el centro de Málaga, con tipo; sin los cursos y talleres', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => MALAGA });
    const eventos = await malaga.descargar(ctx, DESDE, HASTA);
    assert.deepEqual(peticiones, ['https://datosabiertos.malaga.eu/recursos/cultura/agenda/2026.csv']);
    assert.ok(eventos.length >= 5);
    assert.ok(eventos.every((e) => e.municipio === 'Málaga' && e.lat === 36.7202));
    const cursos = leerCsv(MALAGA).filter((f) => f.CATEGORIA === 'Cursos y talleres').map((f) => f.NOMBRE.trim());
    assert.ok(cursos.length > 0, 'la muestra trae algún curso');
    assert.ok(!eventos.some((e) => cursos.includes(e.nombre)), 'los cursos y talleres no son un plan de escapada');
    assert.ok(eventos.some((e) => e.tipo === 'fiestas') && eventos.some((e) => e.tipo === 'escena'));
    assert.ok(eventos.every((e) => e.url === null || /^https:\/\//.test(e.url)), 'los enlaces sin «https://» se completan');
  });
  test('a caballo entre dos años, pide también la del siguiente (y si aún no existe, sigue)', async () => {
    const { ctx, peticiones } = crearCtx({
      respuestas: (u) => {
        if (u.endsWith('2027.csv')) throw Object.assign(new Error('HTTP 404'), { estado: 404 });
        return MALAGA;
      },
    });
    await malaga.descargar(ctx, '2026-12-20', '2027-01-19');
    assert.deepEqual(peticiones.map((u) => u.slice(-8)), ['2026.csv', '2027.csv']);
  });
});

describe('eventos cerca de cada oferta con las agendas nuevas', () => {
  test('una escapada en Zaragoza recibe los de su agenda; solo se pide la de su zona', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: (u) => (u.includes('zaragoza.es') ? ZARAGOZA : (() => { throw new Error(`no debería pedir ${u}`); })()) });
    ctx.findes = findesProximos(10, new Date('2026-10-04T10:00:00Z'));
    ctx.ahora = new Date('2026-10-04T10:00:00Z');
    const o = oferta({ lugar: { nombre: 'Zaragoza', lat: 41.6488, lon: -0.8891 }, fechas: { salida: '2026-10-04', vuelta: '2026-10-05' } });
    await anadirEventos([o], ctx);
    assert.ok(peticiones.every((u) => u.includes('zaragoza.es')));
    assert.ok(o.eventos.length > 0 && o.eventos.every((e) => e.km <= 25));
  });
  test('las tres están en la lista de proveedores', () => {
    assert.ok(['valenciana', 'zaragoza', 'malaga'].every((id) => PROVEEDORES.some((p) => p.id === id)));
  });
});

describe('lo que publican las agendas y no es un plan', () => {
  // Nombres reales de las agendas del IVC y de Málaga (4 oct 2026).
  test('fuera abonos, entrenamientos para profesionales y funciones o visitas para escuelas', () => {
    for (const nombre of [
      'ABONAMENT A LA CARTA ARNICHES', 'GRAN ABONAMENT ARNICHES', 'ABONO DE OTOÑO 26', 'ABONO · PROGRAMACIÓN TEATRO RIALTO DE ENERO A ABRIL',
      'ENTRENAMIENTOS DE CONTEMPORÁNEO APDCV CON DÉBORA RUIZ', 'ENTRENAMIENTOS DE TÉCNICA CLÁSICA PARA PROFESIONALES',
      'XVII CICLO DE CONCIERTOS DIDÁCTICOS PARA ESCOLARES 2026 "UN VIAJE AL MUSICAL"', 'Visita Dinamizada para Escuelas de Español.',
      'Campanya escolar de teatre',
    ]) assert.ok(noEsUnPlan(nombre), nombre);
  });
  test('lo demás se queda, aunque hable de abonos o de vacaciones escolares', () => {
    for (const nombre of [
      'LOS GOLFOS', 'Concierto de la Banda Municipal', 'Teatro familiar en vacaciones escolares', 'Fiesta del abono verde',
      'Exposició «La casa ibera»', 'Taller infantil de cerámica',
    ]) assert.ok(!noEsUnPlan(nombre), nombre);
  });
  test('el evento sale con el nombre en texto plano y sin los que no son un plan', () => {
    const base = { desde: '2026-10-10', lat: 36.72, lon: -4.42 };
    assert.equal(evento({ ...base, nombre: 'Proyección de Self Portrait de Marina Abramovi&#263;.' }).nombre, 'Proyección de Self Portrait de Marina Abramović.');
    assert.equal(evento({ ...base, nombre: '<b>  Noche de jazz  </b>' }).nombre, 'Noche de jazz');
    assert.equal(evento({ ...base, nombre: 'ABONO A LA CARTA RIALTO' }), null);
  });
});
