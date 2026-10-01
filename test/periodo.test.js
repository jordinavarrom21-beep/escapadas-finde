/**
 * El finde o el puente elegido es el mismo en todas las pestañas de Explorar, y lo que tiene
 * fechas cerradas dice si cabe en él o se sale (sale antes, vuelve después).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { conPeriodo, encajeEnRango, filtrarVuelos, filtrosActivos, leerFiltrosEscapadas, leerFiltrosVuelos, periodoDeParams, periodoPasado, rangoDe } from '../site/js/filtros.js';
import { etiquetaFinde, etiquetaPuente } from '../site/js/vistas-comun.js';

const FINDE = { id: '2026-10-09', viernes: '2026-10-09', sabado: '2026-10-10', domingo: '2026-10-11', etiqueta: '9–11 oct', puenteId: '2026-10-10' };
const PUENTE = { id: '2026-10-10', nombre: 'Fiesta Nacional', desde: '2026-10-10', hasta: '2026-10-12', etiqueta: '10–12 oct' };
const ctx = { finde: { id: '2026-10-02', viernes: '2026-10-02', domingo: '2026-10-04' }, findes: [FINDE], puente: PUENTE, puentes: [PUENTE] };
const viaje = (salida, vuelta) => ({ fechas: { salida: `${salida}T13:10:00`, vuelta: `${vuelta}T10:45:00` } });

describe('periodo elegido', () => {
  it('un finde va de viernes a domingo y un puente del último laborable (para salir) a su último día', () => {
    assert.deepEqual(rangoDe('2026-10-09', ctx), { id: '2026-10-09', tipo: 'finde', inicio: '2026-10-09', fin: '2026-10-11' });
    assert.deepEqual(rangoDe('puente', ctx), { id: '2026-10-10', tipo: 'puente', inicio: '2026-10-09', fin: '2026-10-12' });
    assert.equal(rangoDe('puente', { puente: { ...PUENTE, salidas: ['2026-10-08', '2026-10-10'] } }).inicio, '2026-10-08', 'si el escaneo dice otro día, manda');
    assert.equal(rangoDe('', ctx), null);
  });

  it('cada vuelo dice si cabe en el periodo o en qué se sale', () => {
    const puente = rangoDe('2026-10-10', ctx);
    const finde = rangoDe('2026-10-09', ctx);
    assert.deepEqual(encajeEnRango(viaje('2026-10-10', '2026-10-12'), puente), { cabe: true, motivos: [] });
    assert.deepEqual(encajeEnRango(viaje('2026-10-09', '2026-10-12'), puente), { cabe: true, motivos: [] }, 'el viernes por la tarde ya vale para el puente');
    assert.deepEqual(encajeEnRango(viaje('2026-10-08', '2026-10-11'), puente), { cabe: false, motivos: ['sale un día antes'] });
    assert.deepEqual(encajeEnRango(viaje('2026-10-09', '2026-10-11'), finde), { cabe: true, motivos: [] });
    assert.deepEqual(encajeEnRango(viaje('2026-10-10', '2026-10-12'), finde), { cabe: false, motivos: ['vuelve un día después'] });
    assert.equal(encajeEnRango({ fechas: {} }, finde), null, 'las flexibles no se juzgan');
  });

  it('«solo si caben enteras» quita las de fechas cerradas que se salen y deja las flexibles', async () => {
    const { buscarEscapadas } = await import('../site/js/filtros.js');
    const base = { tipo: 'hotel', temas: [], puntuacion: 50, precio: 100, etiquetas: [], lugar: { nombre: 'X' } };
    const ofertas = [
      { ...base, id: 'cabe', fechas: { salida: '2026-10-10', vuelta: '2026-10-12', puenteId: '2026-10-10' } },
      { ...base, id: 'antes', fechas: { salida: '2026-10-08', vuelta: '2026-10-11', puenteId: '2026-10-10' } },
      { ...base, id: 'flexible', fechas: {} },
    ];
    const ids = (p) => buscarEscapadas(ofertas, leerFiltrosEscapadas(p), { ...ctx, origen: { lat: 41.39, lon: 2.17 } }).ofertas.map((o) => o.id).sort();
    assert.deepEqual(ids({ cuando: '2026-10-10' }), ['antes', 'cabe', 'flexible']);
    assert.deepEqual(ids({ cuando: '2026-10-10', encaje: '1' }), ['cabe', 'flexible']);
  });
});

describe('el mismo periodo en todas las pestañas', () => {
  it('el puente de Escapadas abre ese puente en Vuelos (no el finde 9–11) y vuelve igual', () => {
    const periodo = periodoDeParams('escapadas', { cuando: '2026-10-10', temas: 'spa' });
    assert.deepEqual(conPeriodo('vuelos', { finde: '2026-10-09', aero: 'BCN' }, periodo, ctx), { aero: 'BCN', finde: '2026-10-10' });
    const desdeVuelos = periodoDeParams('vuelos', { finde: '2026-10-10' });
    assert.deepEqual(conPeriodo('escapadas', { cuando: 'finde', temas: 'spa' }, desdeVuelos, ctx), { temas: 'spa', cuando: '2026-10-10' });
  });

  it('«este finde» y «el puente» se traducen al id para Vuelos; Planes y Mapa usan «cuando»', () => {
    assert.deepEqual(conPeriodo('vuelos', {}, { cuando: 'puente', desde: '', hasta: '' }, ctx), { finde: '2026-10-10' });
    assert.deepEqual(conPeriodo('vuelos', {}, { cuando: 'finde', desde: '', hasta: '' }, ctx), { finde: '2026-10-02' });
    assert.deepEqual(conPeriodo('actividades', { gratis: '1' }, { cuando: 'puente', desde: '', hasta: '' }, ctx), { gratis: '1', cuando: 'puente' });
    assert.deepEqual(conPeriodo('mapa', { cuando: 'finde' }, { cuando: '', desde: '2026-10-16', hasta: '2026-10-18' }, ctx), { desde: '2026-10-16', hasta: '2026-10-18' });
    assert.equal(periodoDeParams('calendario', {}), null);
  });
});

describe('etiquetas que no confunden un finde con un puente', () => {
  it('días con nombre y qué parte del puente coge', () => {
    assert.equal(etiquetaFinde(FINDE, [PUENTE]), 'vie 9 – dom 11 oct · vuelve antes del festivo');
    assert.equal(etiquetaFinde({ ...FINDE, puenteId: null }, [PUENTE]), 'vie 9 – dom 11 oct');
    assert.match(etiquetaPuente(PUENTE), /Fiesta Nacional · vie 9 – lun 12 oct · todo el puente$/);
  });
});

describe('Inicio: qué quieres organizar y para cuándo', async () => {
  const { destinoOrganizar } = await import('../site/js/vistas-portada.js');
  it('el mismo «¿Cuándo?» lleva a Escapadas, Vuelos o Planes', () => {
    const ids = { finde: ctx.finde, puente: PUENTE };
    assert.equal(destinoOrganizar('vuelos', { cuando: 'puente' }, ids), '#/vuelos?finde=2026-10-10');
    assert.equal(destinoOrganizar('vuelos', { cuando: 'finde' }, ids), '#/vuelos?finde=2026-10-02');
    assert.equal(destinoOrganizar('actividades', { cuando: '2026-10-09' }, ids), '#/actividades?cuando=2026-10-09');
    assert.equal(destinoOrganizar('escapadas', { cuando: 'puente', pres: '150' }, ids), '#/escapadas?cuando=puente&orden=total&pres=150&prespor=persona');
    assert.equal(destinoOrganizar('vuelos', { cuando: '' }, ids), '#/vuelos');
    // El destino escrito va a las tres.
    assert.equal(destinoOrganizar('actividades', { cuando: '', q: ' Girona ' }, ids), '#/actividades?q=Girona');
    assert.match(destinoOrganizar('vuelos', { cuando: 'finde', q: 'Roma' }, ids), /^#\/vuelos\?(?=.*q=Roma)(?=.*finde=2026-10-02)/);
    assert.match(destinoOrganizar('escapadas', { cuando: 'finde', q: 'Girona' }, ids), /[?&]q=Girona/);
  });
});

describe('franja del periodo y Lista / Mapa', async () => {
  const { conmutadorListaMapa, franjaPeriodo, pestanas } = await import('../site/js/vistas-comun.js');
  const e = { findes: [ctx.finde, FINDE], puente: PUENTE, datos: { puentes: [PUENTE] } };
  it('dice el periodo con sus días, igual en todas las pestañas, y ofrece cambiarlo', () => {
    assert.match(franjaPeriodo(e, 'escapadas', { cuando: 'puente' }), /<strong>Puente<\/strong> · Fiesta Nacional · vie 9 – lun 12 oct[^]*data-cambiar-fechas>Cambiar fechas/);
    const texto = (html) => html.match(/franja-periodo__texto">(.*?)<\/span>/)[1];
    assert.equal(texto(franjaPeriodo(e, 'vuelos', { finde: '2026-10-10' })), texto(franjaPeriodo(e, 'actividades', { cuando: '2026-10-10' })));
    assert.match(franjaPeriodo(e, 'vuelos', { finde: '2026-10-10', aero: 'BCN' }), /href="#\/vuelos\?aero=BCN" aria-label="Quitar las fechas"/);
    assert.match(franjaPeriodo(e, 'escapadas', { cuando: '2026-10-09' }), /<strong>Finde<\/strong> · vie 9 – dom 11 oct · vuelve antes del festivo/);
    assert.match(franjaPeriodo(e, 'mapa', {}), /Cualquier fecha[^]*Elegir fechas/);
    assert.match(franjaPeriodo(e, 'escapadas', { desde: '2026-10-16', hasta: '2026-10-18' }), /<strong>Fechas<\/strong> · vie 16 – dom 18 oct/);
  });
  it('el mapa es otra vista de la misma búsqueda, no otra pestaña', () => {
    const html = conmutadorListaMapa({ cuando: 'puente', temas: 'spa' }, 'mapa');
    assert.match(html, /href="#\/escapadas\?cuando=puente&amp;temas=spa">[^]*Lista/);
    assert.match(html, /href="#\/mapa\?cuando=puente&amp;temas=spa" aria-current="page"/);
    assert.doesNotMatch(pestanas('explorar', 'escapadas'), /data-vista="mapa"/);
  });
  it('Guardados: Favoritos, Búsquedas guardadas y Comparar, cada uno en su pestaña', () => {
    const html = pestanas('mis', 'mis?ver=busquedas');
    assert.match(html, /href="#\/mis" data-vista="mis"[^>]*>[^]*Favoritos/);
    assert.match(html, /href="#\/mis\?ver=busquedas" aria-label="Búsquedas guardadas" aria-current="page"/);
    assert.match(html, /href="#\/comparar"/);
  });
});

describe('mapa', async () => {
  const { agruparPorLugar } = await import('../site/js/mapa.js');
  it('las ofertas del mismo sitio van en un solo marcador (antes se tapaban unas a otras)', () => {
    const o = (id, lat, lon) => ({ id, lugar: { lat, lon } });
    const grupos = agruparPorLugar([o('a', 41.2371, 1.8059), o('b', 41.23712, 1.80588), o('c', 41.98, 2.82)]);
    assert.deepEqual(grupos.map((g) => g.map((x) => x.id)), [['a', 'b'], ['c']]);
  });
});

describe('un finde o puente que ya pasó en la URL: todas las piezas dicen lo mismo', async () => {
  const { franjaPeriodo } = await import('../site/js/vistas-comun.js');
  const { resultadosEscapadas, resultadosVuelos, resultadosActividades, vistaVuelos } = await import('../site/js/vistas.js');
  const { estadoPanel, ctxPanel } = await import('./ayudas-panel.js');
  const e = estadoPanel();
  const ctx = ctxPanel(e);

  it('se reconoce como pasado (o desconocido) y no como «cualquier fecha»', () => {
    assert.equal(periodoPasado('2020-01-01', ctx), true);
    assert.equal(periodoPasado('puente-1999-01-01', ctx), true);
    assert.equal(periodoPasado('finde', ctx), false);
    assert.equal(periodoPasado('', ctx), false);
    assert.equal(periodoPasado('puente', { ...ctx, puente: null }), true, 'sin puente a la vista, «el puente» no es nada');
  });

  it('franja, chip y estado vacío lo dicen (antes: «Cualquier fecha», el id crudo y 0 resultados sin explicar)', () => {
    assert.match(franjaPeriodo(e, 'escapadas', { cuando: '2020-01-01' }), /<strong>Fechas que ya pasaron<\/strong>[^]*franja-periodo__quitar/);
    assert.match(franjaPeriodo(e, 'vuelos', { finde: '2020-01-01' }), /Fechas que ya pasaron/);
    assert.deepEqual(filtrosActivos('escapadas', { cuando: '2020-01-01' }, ctx).map((c) => c.texto), ['Fechas que ya pasaron']);
    for (const html of [resultadosEscapadas(e, { cuando: '2020-01-01' }), resultadosActividades(e, { cuando: '2020-01-01' }), resultadosVuelos(e, { finde: '2020-01-01' })]) {
      assert.match(html, /Ese finde o puente ya pasó/);
    }
    assert.ok(!/Ese finde o puente ya pasó/.test(resultadosEscapadas(e, { cuando: 'finde', temas: 'no-existe' })), 'con fechas vivas y 0 resultados, el vacío normal');
  });

  it('Vuelos entiende «finde» y «puente» igual que Escapadas (antes: 0 vuelos con la franja diciendo «Este finde»)', () => {
    const porId = filtrarVuelos(e.datos.ofertas, leerFiltrosVuelos({ finde: e.findes[0].id }), ctx);
    assert.ok(porId.length > 0);
    assert.deepEqual(filtrarVuelos(e.datos.ofertas, leerFiltrosVuelos({ finde: 'finde' }), ctx).map((o) => o.id), porId.map((o) => o.id));
    assert.deepEqual(filtrarVuelos(e.datos.ofertas, leerFiltrosVuelos({ finde: 'puente' }), ctx).map((o) => o.id),
      filtrarVuelos(e.datos.ofertas, leerFiltrosVuelos({ finde: e.puente.id }), ctx).map((o) => o.id));
    assert.deepEqual(filtrarVuelos(e.datos.ofertas, leerFiltrosVuelos({ finde: 'puente' }), { ...ctx, puente: null }), [], 'sin puente a la vista, ninguno');
  });

  it('Vuelos con un rango de fechas: «Todos» no sale marcado y el rango viaja en el formulario (tocar otro filtro no lo pierde)', () => {
    const html = vistaVuelos(e, { desde: '2026-10-16', hasta: '2026-10-18' });
    assert.ok(!/name="finde" value="" checked/.test(html));
    assert.match(html, /<input type="hidden" name="desde" value="2026-10-16"><input type="hidden" name="hasta" value="2026-10-18">/);
    assert.ok(!/name="desde"/.test(vistaVuelos(e, { finde: e.findes[0].id })), 'sin rango, sin campos ocultos');
  });
});

describe('Inicio arranca con el periodo elegido en Explorar', async () => {
  const { buscadorFinde, destinoOrganizar, paramsBuscadorFinde } = await import('../site/js/vistas-portada.js');
  const { estadoPanel } = await import('./ayudas-panel.js');
  const e = estadoPanel();
  const marcado = (html) => html.match(/name="cuando" value="([^"]*)"[^>]*checked/)?.[1];

  it('sin periodo guardado (o ya pasado), «Este finde»; con uno vigente, ese; «Cualquier fecha» solo a propósito', () => {
    assert.equal(marcado(buscadorFinde({ ...e, periodo: null })), 'finde');
    assert.equal(marcado(buscadorFinde({ ...e, periodo: {} })), 'finde', 'pasado: filtrosVigentes quitó la clave');
    assert.equal(marcado(buscadorFinde({ ...e, periodo: { cuando: e.findes[0].id } })), 'finde');
    assert.equal(marcado(buscadorFinde({ ...e, periodo: { cuando: e.findes[1].id } })), e.findes[1].id);
    assert.equal(marcado(buscadorFinde({ ...e, periodo: { cuando: e.puente.id } })), e.puente.id);
    assert.equal(marcado(buscadorFinde({ ...e, periodo: { cuando: 'puente' } })), e.puente.id);
    assert.equal(marcado(buscadorFinde({ ...e, periodo: { cuando: '', desde: '', hasta: '' } })), '');
    assert.equal(marcado(buscadorFinde({ ...e, periodo: { cuando: e.findes[7].id } })), 'finde', 'un finde que el Inicio no ofrece: lo de siempre');
  });

  it('un rango elegido en Explorar aparece como «Tus fechas» y vuelve a Explorar como desde/hasta', () => {
    const html = buscadorFinde({ ...e, periodo: { cuando: '', desde: '2026-10-16', hasta: '2026-10-18' } });
    assert.equal(marcado(html), 'rango');
    assert.match(html, /<small>Tus fechas<\/small><span>vie 16 – dom 18 oct<\/span>/);
    assert.match(html, /name="desde" value="2026-10-16"/);
    assert.match(html, /data-enviar-para>para vie 16 – dom 18 oct</);
    const ids = { finde: e.findes[0], puente: e.puente };
    assert.equal(destinoOrganizar('vuelos', { cuando: 'rango', desde: '2026-10-16', hasta: '2026-10-18' }, ids), '#/vuelos?desde=2026-10-16&hasta=2026-10-18');
    assert.equal(destinoOrganizar('actividades', { cuando: 'rango', desde: '2026-10-16', hasta: '2026-10-18' }, ids), '#/actividades?desde=2026-10-16&hasta=2026-10-18');
    assert.deepEqual(paramsBuscadorFinde({ cuando: 'rango', desde: '2026-10-16', hasta: '2026-10-18' }), { desde: '2026-10-16', hasta: '2026-10-18', temas: '', orden: 'total' });
  });
});
