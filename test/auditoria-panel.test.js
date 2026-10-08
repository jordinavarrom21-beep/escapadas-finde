/**
 * Un test por cada fallo que encontró la auditoría en el panel (la parte que se puede
 * probar sin navegador; el resto se ha comprobado en el navegador).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { criterioVigilado, filtrosActivos, filtrosVigentes, leerFiltrosEscapadas, medirDistancias } from '../site/js/filtros.js';
import { vistaEscapadas, vistaFinde } from '../site/js/vistas.js';

const datos = JSON.parse(readFileSync(new URL('./fixtures/panel/ofertas.json', import.meta.url), 'utf8'));
const estado = (extra = {}) => ({
  datos, historial: {}, vigilados: [], ahora: new Date('2026-09-18T08:00:00Z'), hoy: '2026-09-18',
  findes: datos.findes, puente: datos.puentes[0], favoritos: new Set(), descartadas: new Set(), busquedas: [],
  salto: 0, referencia: null, paginas: new Map(), ubicacion: {}, temas: new Map(datos.temas.map((t) => [t.id, t])),
  fuentes: new Map(datos.fuentes.map((f) => [f.id, f.nombre])), porId: new Map(datos.ofertas.map((o) => [o.id, o])),
  distanciasOrigen: medirDistancias(datos.ofertas, null, datos.origen), ...extra,
});

describe('auditoría: la memoria de filtros no deja la vista vacía', () => {
  const contexto = {
    hoy: '2026-10-05',
    findes: [{ id: '2026-10-09', domingo: '2026-10-11' }],
    puentes: [{ id: '2026-10-10', hasta: '2026-10-12' }, { id: '2026-09-11', hasta: '2026-09-13' }],
  };

  it('quita el finde o el puente que ya han pasado y deja los que siguen', () => {
    assert.deepEqual(filtrosVigentes({ cuando: '2026-10-02', temas: 'spa' }, contexto), { temas: 'spa' });
    assert.deepEqual(filtrosVigentes({ cuando: '2026-09-11' }, contexto), {});
    assert.deepEqual(filtrosVigentes({ cuando: '2026-10-10' }, contexto), { cuando: '2026-10-10' });
    assert.deepEqual(filtrosVigentes({ cuando: 'finde', finde: '2026-10-09' }, contexto), { cuando: 'finde', finde: '2026-10-09' });
  });

  it('quita las fechas pasadas y acerca a hoy un «desde» que ya pasó', () => {
    assert.deepEqual(filtrosVigentes({ desde: '2026-09-20', hasta: '2026-09-20' }, contexto), {});
    assert.deepEqual(filtrosVigentes({ desde: '2026-09-20', hasta: '2026-10-20' }, contexto), { desde: '2026-10-05', hasta: '2026-10-20' });
  });
});

describe('auditoría: descartadas', () => {
  it('se ocultan por defecto (la ✕ ya no depende de un filtro que se olvidaba)', () => {
    assert.equal(leerFiltrosEscapadas({}).sinDescartadas, true);
    assert.equal(leerFiltrosEscapadas({ sindesc: '0' }).sinDescartadas, false);
    assert.deepEqual(filtrosActivos('escapadas', { sindesc: '0' }).map((c) => c.texto), ['Con las descartadas y las no disponibles']);
    assert.deepEqual(filtrosActivos('escapadas', { sindesc: '1' }), []);
  });

  it('en el Inicio tampoco vuelven (antes salían en Chollazos)', () => {
    const id = vistaFinde(estado()).match(/<li class="idea" style="[^"]*">[^]*?data-ficha="([^"]+)"/)?.[1];
    assert.ok(id, 'el Inicio enseña alguna escapada');
    const html = vistaFinde(estado({ descartadas: new Set([id]) }));
    const filas = [...html.matchAll(/<li class="idea" style="[^"]*">[^]*?data-ficha="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(filas.length && !filas.includes(id));
  });
});

describe('auditoría: «Copiar como vigilado» con un puente o un finde concretos', () => {
  it('los ids reales son fechas y se copian como «finde»; «este finde», como «proximo»', () => {
    assert.deepEqual(criterioVigilado('x', leerFiltrosEscapadas({ cuando: '2026-10-10' })).finde, '2026-10-10');
    assert.equal(criterioVigilado('x', leerFiltrosEscapadas({ cuando: 'puente' })).puente, true);
    // «Este finde» se mueve cada semana: se guarda como «el próximo», no con una fecha.
    const finde = criterioVigilado('x', leerFiltrosEscapadas({ cuando: 'finde' }));
    assert.equal(finde.finde, 'proximo');
    assert.equal(finde.puente, undefined);
  });
});

describe('auditoría: un solo sitio para las fechas', () => {
  it('la entrada y la salida van en la barra «¿Cuándo?» (del formulario con form=), sin «Un día concreto» aparte', () => {
    const html = vistaEscapadas(estado(), { desde: '2026-10-16', hasta: '2026-10-18' });
    assert.doesNotMatch(html, /name="dia"|type="date"/);
    assert.match(html, /<input type="hidden" name="desde" value="2026-10-16" form="filtros-escapadas">/);
    assert.match(html, /<input type="hidden" name="hasta" value="2026-10-18" form="filtros-escapadas">/);
    assert.match(html, /Fecha de entrada<\/span>\s*<span class="fechas__valor">vie 16 oct/);
    assert.match(html, /Fecha de salida<\/span>\s*<span class="fechas__valor">dom 18 oct/);
    // Un solo día: entrada y salida el mismo día.
    const unDia = vistaEscapadas(estado(), { desde: '2026-10-16', hasta: '2026-10-16' });
    assert.match(unDia, /data-fechas-noches>Un día</);
  });
});
