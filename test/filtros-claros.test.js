import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ATAJOS_ESCAPADAS, buscarEscapadas, crearHash, filtrosActivos, leerFiltrosEscapadas, leerRuta, medirDistancias, traducirFormulario,
} from '../site/js/filtros.js';
import { euros } from '../site/js/formato.js';
import { contarSecundarios, resultadosEscapadas, vistaEscapadas } from '../site/js/vistas.js';

const datos = JSON.parse(readFileSync(new URL('./fixtures/panel/ofertas.json', import.meta.url), 'utf8'));
const temas = new Map(datos.temas.map((t) => [t.id, t]));
const estado = (extra = {}) => ({
  datos, historial: {}, vigilados: [], ahora: new Date('2026-09-18T08:00:00Z'), hoy: '2026-09-18',
  findes: datos.findes, puente: datos.puentes[0], favoritos: new Set(), descartadas: new Set(), busquedas: [],
  salto: 0, referencia: null, paginas: new Map(), ubicacion: {}, temas,
  fuentes: new Map(datos.fuentes.map((f) => [f.id, f.nombre])), porId: new Map(datos.ofertas.map((o) => [o.id, o])),
  distanciasOrigen: medirDistancias(datos.ofertas, null, datos.origen), ...extra,
});
const ctxBusqueda = { origen: datos.origen, finde: datos.findes[0], findes: datos.findes, puentes: datos.puentes, favoritos: new Set(), descartadas: new Set() };

describe('filtros claros: «solo con fechas cerradas»', () => {
  it('deja solo las ofertas con fecha de salida; sin el interruptor salen también las flexibles', () => {
    const todas = buscarEscapadas(datos.ofertas, leerFiltrosEscapadas({}), ctxBusqueda).ofertas;
    const cerradas = buscarEscapadas(datos.ofertas, leerFiltrosEscapadas({ cerradas: '1' }), ctxBusqueda).ofertas;
    assert.ok(cerradas.length > 0 && cerradas.length < todas.length);
    assert.ok(cerradas.every((o) => o.fechas.salida));
    assert.ok(todas.some((o) => !o.fechas.salida), 'las flexibles salen sin el filtro');
    assert.equal(leerFiltrosEscapadas({ cerradas: 'si' }).soloCerradas, false);
  });
});

describe('filtros claros: lo que tienes puesto', () => {
  const ctx = { temas, findes: datos.findes, puentes: datos.puentes, fuentes: new Map([['atrapalo', 'Atrápalo']]) };

  it('un chip por filtro, con su texto y el enlace a la misma búsqueda sin él', () => {
    const params = { temas: 'spa,rural', max: '200', fuente: 'atrapalo', orden: 'precio' };
    const chips = filtrosActivos('escapadas', params, ctx);
    assert.deepEqual(chips.map((c) => c.texto), ['Relax y spa', 'Rural y naturaleza', `Hasta ${euros(200)} publicados`, 'Solo Atrápalo']);
    // Quitar «spa» deja «rural» y todo lo demás, orden incluido.
    assert.deepEqual(leerRuta(chips[0].hash).params, { temas: 'rural', max: '200', fuente: 'atrapalo', orden: 'precio' });
    assert.deepEqual(leerRuta(chips[2].hash).params, { temas: 'spa,rural', fuente: 'atrapalo', orden: 'precio' });
  });

  it('el lugar se quita con sus coordenadas, y un solo día es un solo chip', () => {
    const chips = filtrosActivos('escapadas', { lugar: 'Girona', lat: '41.98', lon: '2.82', h: '2', desde: '2026-10-16', hasta: '2026-10-16' }, ctx);
    assert.deepEqual(chips.map((c) => c.texto), ['Cerca de Girona', 'Menos de 2 h en coche', 'El vie 16 oct']);
    assert.deepEqual(leerRuta(chips[0].hash).params, { h: '2', desde: '2026-10-16', hasta: '2026-10-16' });
    assert.deepEqual(leerRuta(chips[2].hash).params, { lugar: 'Girona', lat: '41.98', lon: '2.82', h: '2' });
    const rango = filtrosActivos('escapadas', { desde: '2026-10-16', hasta: '2026-10-18' }, ctx);
    assert.deepEqual(rango.map((c) => c.texto), ['Entrada el vie 16 oct', 'Salida el dom 18 oct']);
  });

  it('no enseña lo que no filtra: el orden ni «ocultar cruceros» (que es lo de fábrica)', () => {
    assert.deepEqual(filtrosActivos('escapadas', { orden: 'precio', cru: '1' }, ctx), []);
    assert.deepEqual(filtrosActivos('escapadas', { cru: '0' }, ctx).map((c) => c.texto), ['Con cruceros']);
    assert.deepEqual(filtrosActivos('escapadas', {}, ctx), []);
  });

  it('quitar el último filtro lleva a la vista limpia', () => {
    const [chip] = filtrosActivos('escapadas', { cho: '1' }, ctx);
    assert.equal(chip.hash, '#/escapadas');
  });

  it('los resultados llevan la fila de chips y «Quitar todos» olvida la memoria', () => {
    const html = resultadosEscapadas(estado(), { temas: 'spa' });
    assert.match(html, /class="chip chip--activo" href="#\/escapadas" data-olvidar-filtros aria-label="Quitar el filtro Relax y spa"/);
    assert.match(html, /href="#\/escapadas" data-olvidar-filtros>Quitar todos<\/a>/);
    assert.doesNotMatch(resultadosEscapadas(estado(), {}), /chip--activo/);
  });
});

describe('filtros claros: atajos', () => {
  it('cada atajo es un enlace compartible que pone filtros que existen', () => {
    for (const atajo of ATAJOS_ESCAPADAS) {
      const { vista, params } = leerRuta(crearHash('escapadas', atajo.params));
      assert.equal(vista, 'escapadas');
      const f = leerFiltrosEscapadas(params);
      const aplicado = f.temas.length || f.horas || f.sinCoche || f.chollazo || f.soloCerradas || f.ninos || f.alojamiento || f.cuando || f.evento || params.orden !== undefined;
      assert.ok(aplicado, atajo.texto);
    }
    const spa = leerFiltrosEscapadas(ATAJOS_ESCAPADAS.find((a) => a.texto === 'Spa a menos de 2 h').params);
    assert.deepEqual([spa.temas, spa.horas], [['spa'], 2]);
  });

  it('salen arriba de la vista de escapadas', () => {
    const html = vistaEscapadas(estado(), {});
    assert.match(html, /<nav class="atajos" aria-label="Atajos de búsqueda">/);
    assert.ok(html.indexOf('class="atajos"') < html.indexOf('<form class="filtros"'));
  });
});

describe('filtros claros: jerarquía del formulario', () => {
  const html = vistaEscapadas(estado(), {});

  it('«¿Cuándo?» en la barra de fechas, encima; en los filtros, cuatro preguntas (sin repetir las fechas ni el orden)', () => {
    const titulos = [...html.matchAll(/class="bloque__titulo">([^<]+)</g)].map(([, t]) => t);
    assert.deepEqual(titulos, ['¿Qué te apetece?', '¿Dónde?', '¿Cómo vas?', '¿Cuánto?']);
    assert.match(html, /<h2 class="fechas__titulo"[^>]*>[^]*?¿Cuándo\?<\/h2>/);
    assert.ok(html.indexOf('class="fechas"') < html.indexOf('<form class="filtros"'), 'la barra va antes que los filtros');
    assert.doesNotMatch(html, /<select name="orden">/, 'el orden está encima de los resultados');
    assert.match(html, /name="cerradas" value="1"> Solo con fechas cerradas/);
    assert.match(html, /la disponibilidad la confirma su web/);
  });

  it('«Más filtros» agrupado por bloques, siempre plegado y con contador', () => {
    const grupos = [...html.matchAll(/class="grupo__titulo">([^<]+)</g)].map(([, t]) => t);
    assert.deepEqual(grupos, ['Precio y chollos', 'Viaje y alojamiento', 'Zona, web y tipo', 'Fechas de las ofertas', 'Mis listas']);
    assert.match(html, /<details class="filtros__mas filtros__mas--panel">/);
    const conFiltros = vistaEscapadas(estado(), { aloj: 'casa-rural', cho: '1', max: '100' });
    // No se abre solo (en el móvil taparía la pantalla): lo puesto se ve en los chips y en el contador.
    assert.match(conFiltros, /<details class="filtros__mas filtros__mas--panel">/);
    assert.match(conFiltros, /data-contador-mas>\(2 puestos\)</, 'el precio máximo está arriba: no cuenta');
    assert.equal(contarSecundarios({ max: '100', pnMax: '40', noches: '2', q: 'x' }), 0);
    assert.equal(contarSecundarios({ cerradas: '1', encaje: '1' }), 2);
  });

  it('no se pierde ningún filtro de antes', () => {
    // El precio (max, pnMax, pres) va en un solo campo con selector y «sin coche» en «¿Cómo vas?».
    assert.match(html, /name="precio"/);
    for (const tipo of ['oferta', 'noche', 'persona', 'total']) assert.match(html, new RegExp(`name="preciotipo"[^]*?value="${tipo}"`), tipo);
    for (const como of ['', 'coche', 'sincoche']) assert.match(html, new RegExp(`name="como" value="${como}"`), como);
    // «Escapada clásica (2 noches)» es «Noches: 2» (eran dos controles para lo mismo) y «Un día
    // concreto», una entrada y una salida el mismo día.
    for (const nombre of ['q', 'orden', 'cuando', 'desde', 'hasta', 'temas', 'lugar', 'h', 'km', 'pnMin',
      'noches', 'regimen', 'aloj', 'nota', 'transporte', 'pais', 'region', 'fuente', 'tipo', 'cru', 'dto', 'pts', 'cho', 'baja',
      'hist', 'fav', 'nuevas', 'sindesc', 'dup', 'notemas', 'nodest']) {
      assert.match(html, new RegExp(`name="${nombre}"`), nombre);
    }
  });

  it('el aviso de memoria solo sale cuando se han recuperado filtros', () => {
    assert.doesNotMatch(html, /aviso-memoria/);
    assert.match(vistaEscapadas(estado({ filtrosRecordados: true }), { temas: 'spa' }), /Con los filtros de la última vez · <a href="#\/escapadas" data-olvidar-filtros>Empezar de cero<\/a>/);
  });
});

describe('filtros claros: memoria por vista (localStorage)', () => {
  let local;
  beforeEach(() => {
    const almacen = new Map();
    globalThis.localStorage = {
      getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
      setItem: (k, v) => almacen.set(k, String(v)),
    };
    local = almacen;
  });

  it('las búsquedas guardadas recuerdan cuándo se miraron por última vez', async () => {
    const { cargarBusquedas, guardarBusqueda, marcarBusquedaVista } = await import('../site/js/local.js');
    guardarBusqueda({ nombre: 'Spa', vista: 'escapadas', hash: '#/escapadas?temas=spa' }, new Date('2026-09-20T10:00:00Z'));
    assert.equal(cargarBusquedas()[0].visto, '2026-09-20T10:00:00.000Z');
    marcarBusquedaVista('Spa', new Date('2026-09-25T10:00:00Z'));
    assert.equal(cargarBusquedas()[0].visto, '2026-09-25T10:00:00.000Z');
    // Las guardadas antes de esto no tienen fecha: se leen con visto null.
    local.set('escapadas:busquedas', JSON.stringify([{ nombre: 'Vieja', vista: 'vuelos', hash: '#/vuelos' }]));
    assert.deepEqual(cargarBusquedas(), [{ nombre: 'Vieja', vista: 'vuelos', hash: '#/vuelos', visto: null }]);
    // Una copia importada con un enlace que no es del panel no se enseña.
    local.set('escapadas:busquedas', JSON.stringify([{ nombre: 'Mala', hash: 'javascript:alert(1)' }, { nombre: 'Fuera', hash: 'https://ejemplo.com' }]));
    assert.deepEqual(cargarBusquedas(), []);
  });

  it('guarda, recupera y olvida los filtros de cada vista por separado', async () => {
    const { cargarFiltros, guardarFiltros } = await import('../site/js/local.js');
    guardarFiltros('escapadas', { temas: 'spa', max: '90' });
    guardarFiltros('actividades', { gratis: '1' });
    assert.deepEqual(cargarFiltros('escapadas'), { temas: 'spa', max: '90' });
    assert.deepEqual(cargarFiltros('actividades'), { gratis: '1' });
    guardarFiltros('escapadas', {});
    assert.equal(cargarFiltros('escapadas'), null);
    assert.deepEqual(cargarFiltros('actividades'), { gratis: '1' });
  });

  it('no se fía de lo guardado: solo textos, y sin romperse con basura', async () => {
    const { cargarFiltros } = await import('../site/js/local.js');
    local.set('escapadas:filtros', JSON.stringify({ escapadas: { temas: 'spa', max: 90, x: { y: 1 }, z: '' } }));
    assert.deepEqual(cargarFiltros('escapadas'), { temas: 'spa' });
    local.set('escapadas:filtros', '{roto');
    assert.equal(cargarFiltros('escapadas'), null);
    local.set('escapadas:filtros', JSON.stringify({ escapadas: ['a'] }));
    assert.equal(cargarFiltros('escapadas'), null);
  });
});

describe('filtros claros: un solo campo de precio y «¿Cómo vas?»', () => {
  it('el precio y lo que cuenta se traducen a los parámetros de siempre', () => {
    assert.deepEqual(traducirFormulario({ precio: '80', preciotipo: 'oferta' }), { max: '80' });
    assert.deepEqual(traducirFormulario({ precio: '40', preciotipo: 'noche' }), { pnMax: '40' });
    assert.deepEqual(traducirFormulario({ precio: '300', preciotipo: 'total', prespor: 'persona' }), { pres: '300' });
    assert.deepEqual(traducirFormulario({ precio: '150', preciotipo: 'persona' }), { pres: '150', prespor: 'persona' });
    assert.deepEqual(traducirFormulario({ preciotipo: 'noche' }), {}, 'sin cantidad no hay filtro');
    // Un «max» que venía oculto de un enlace antiguo no se suma: manda el campo.
    assert.deepEqual(traducirFormulario({ precio: '90', preciotipo: 'oferta', max: '60,90' }), { max: '90' });
  });

  it('«¿Cómo vas?» pone transporte=coche o sincoche=1, y «Da igual» no pone nada', () => {
    assert.deepEqual(traducirFormulario({ como: 'coche' }), { transporte: 'coche' });
    assert.deepEqual(traducirFormulario({ como: 'sincoche', transporte: 'coche' }), { sincoche: '1' });
    assert.deepEqual(traducirFormulario({ como: '', transporte: 'tren' }), { transporte: 'tren' });
  });

  it('el campo enseña lo que trae la URL, y lo demás sigue puesto en campos ocultos', () => {
    const html = vistaEscapadas(estado(), { pnMax: '40', max: '100' });
    assert.match(html, /name="precio"[^>]*value="40"/);
    assert.match(html, /<option value="noche" selected>/);
    assert.match(html, /<input type="hidden" name="max" value="100">/);
    assert.match(vistaEscapadas(estado(), { pres: '200', prespor: 'persona' }), /<option value="persona" selected>/);
    assert.match(vistaEscapadas(estado(), { sincoche: '1' }), /name="como" value="sincoche" checked/);
    assert.match(vistaEscapadas(estado(), { transporte: 'coche' }), /name="como" value="coche" checked/);
  });

  it('«En coche» no cuenta como «Más filtros»; otro transporte, sí', () => {
    assert.equal(contarSecundarios({ transporte: 'coche' }), 0);
    assert.equal(contarSecundarios({ transporte: 'tren' }), 1);
  });
});
