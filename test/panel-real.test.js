/**
 * Prueba de humo del panel con datos reales: una muestra de lo que publicó el vigilante el
 * 28-09-2026 (4 ofertas por fuente, con chollazos, sin precio, vuelos, provincia, tiempo y
 * eventos). Cada vista y cada ficha se pintan con varios filtros y el HTML tiene que salir
 * limpio: sin «undefined»/«NaN» a la vista, etiquetas cerradas, ids sin repetir y enlaces
 * que llevan a una vista o a una web (http o https, como las da la agenda cultural).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ATAJOS_ESCAPADAS, VISTAS, actividadesCerca, leerRuta, medirDistancias, rutaDeVista } from '../site/js/filtros.js';
import { proximoPuente } from '../site/js/fechas.js';
import { tituloLegible } from '../site/js/formato.js';
import { contenidoFicha } from '../site/js/plantillas.js';
import { VISTAS_HTML, contenidoSorpresa, ctxTarjetas } from '../site/js/vistas.js';

const leer = (nombre) => JSON.parse(readFileSync(new URL(`./fixtures/panel-real/${nombre}`, import.meta.url), 'utf8'));
const datos = leer('ofertas.json');
const historial = leer('historial.json');
const { vigilados } = leer('vigilados.json');
const AHORA = new Date(datos.generado);
const HOY = datos.generado.slice(0, 10);

/** El mismo estado que monta app.js (crearEstado), sin navegador ni localStorage. */
function estadoPanel(d = datos, extra = {}) {
  const findes = d.findes.filter((f) => f.domingo >= HOY);
  return {
    datos: d, historial, vigilados, ahora: AHORA, hoy: HOY, findes,
    puente: proximoPuente(d.puentes, HOY),
    favoritos: new Set(), descartadas: new Set(), busquedas: [], salto: 0,
    visitaAnterior: null, referencia: null,
    temas: new Map(d.temas.map((t) => [t.id, t])),
    fuentes: new Map(d.fuentes.map((f) => [f.id, f.nombre])),
    porId: new Map(d.ofertas.map((o) => [o.id, o])),
    distanciasOrigen: medirDistancias(d.ofertas, null, d.origen),
    // Todas las tarjetas pintadas, no solo la primera página.
    paginas: new Map(VISTAS.map((v) => [v, 1000])),
    ubicacion: { hostname: 'jordinavarrom21-beep.github.io', pathname: '/escapadas-finde/' },
    ...extra,
  };
}

const ETIQUETAS = ['div', 'section', 'article', 'ul', 'ol', 'li', 'details', 'summary', 'form', 'fieldset',
  'legend', 'a', 'button', 'p', 'span', 'label', 'select', 'optgroup', 'option', 'h1', 'h2', 'h3', 'strong',
  'table', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'figure', 'time', 'small', 'em', 'nav', 'textarea'];
const desescapar = (texto) => texto.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Lo que tiene que cumplir cualquier HTML del panel. */
function revisarHtml(html, donde, e) {
  assert.equal(typeof html, 'string', `${donde}: devuelve texto`);
  assert.ok(html.length > 0, `${donde}: no está vacío`);
  const visible = html.replace(/<[^>]*>/g, ' ');
  for (const basura of ['undefined', 'NaN', '[object Object]', 'Infinity']) {
    assert.ok(!html.includes(basura), `${donde}: aparece «${basura}» cerca de «${html.slice(Math.max(0, html.indexOf(basura) - 80), html.indexOf(basura) + 20)}»`);
  }
  assert.ok(!/\bnull\b/.test(visible), `${donde}: se ve «null» en el texto`);
  for (const etiqueta of ETIQUETAS) {
    const abiertas = html.match(new RegExp(`<${etiqueta}[\\s>]`, 'g'))?.length ?? 0;
    const cerradas = html.match(new RegExp(`</${etiqueta}>`, 'g'))?.length ?? 0;
    assert.equal(abiertas, cerradas, `${donde}: <${etiqueta}> abiertas ${abiertas}, cerradas ${cerradas}`);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(repetidos, [], `${donde}: ids repetidos en la página`);
  for (const [, atributo, valor] of html.matchAll(/data-(ficha|fav|descartar)="([^"]*)"/g)) {
    assert.ok(e.porId.has(desescapar(valor)), `${donde}: data-${atributo} apunta a una oferta que no existe: ${valor}`);
  }
  for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
    const url = desescapar(href);
    if (url.startsWith('#/')) {
      // «#/planes» es la dirección de la vista «actividades».
      const ruta = url.slice(2).split('?')[0];
      const vista = leerRuta(url).vista;
      assert.ok(VISTAS.includes(vista), `${donde}: enlace a una vista que no existe: ${url}`);
      assert.equal(rutaDeVista(vista), ruta, `${donde}: enlace que no es la dirección de su vista: ${url}`);
    } else if (url !== '#' && url !== '#principal' && url !== '#resultados') {
      assert.match(url, /^https?:\/\//, `${donde}: enlace que no es web ni del panel: ${url}`);
      assert.doesNotThrow(() => new URL(url), `${donde}: URL mal formada: ${url}`);
    }
  }
  return visible;
}

// Parámetros de cada vista: los de por defecto y los que más ramas recorren.
const primero = (cumple) => datos.ofertas.find(cumple);
const vueloConPais = primero((o) => o.tipo === 'vuelo' && o.lugar?.pais);
const conProvincia = primero((o) => o.lugar?.provincia);
const e0 = estadoPanel();
const [finde0, finde1] = e0.findes;
const PARAMS = {
  finde: [{}],
  vuelos: [{}, { finde: finde1.id }, { finde: e0.puente?.id ?? finde0.id }, { orden: 'precio' },
    { pais: vueloConPais.lugar.pais }, { ideal: '1', cho: '1', baja: '1' }],
  escapadas: [{}, ...ATAJOS_ESCAPADAS.map((a) => a.params), { region: conProvincia.lugar.provincia },
    { region: conProvincia.lugar.comunidad }, { desde: finde0.viernes, hasta: finde1.domingo }, { dia: finde0.sabado },
    { orden: 'valoracion' }, { orden: 'distancia' }, { orden: 'novedad' }, { sindesc: '0', dup: '1', cru: '0' },
    { pnMin: '30', pnMax: '120', dto: '20', pts: '50', noches: '2', regimen: 'desayuno', transporte: 'coche' }],
  actividades: [{}, { cuando: 'finde' }, { orden: 'precio' }],
  mapa: [{}, { temas: 'spa', h: '2' }],
  calendario: [{}],
  puentes: [{}],
  vigilados: [{}],
  fuentes: [{}],
  mis: [{}],
  ayuda: [{}, { seccion: 'privacidad' }],
  buscar: [{ q: 'spa' }, { q: 'roma' }, { q: 'girona' }, { q: 'barato este finde' }, { q: '' }],
  // Una de cada: vuelo, alojamiento y actividad (con total, sin total y gratis), y un id que ya no existe.
  comparar: [{}, { ids: [primero((o) => o.tipo === 'vuelo').id, primero((o) => o.tipo === 'hotel').id, primero((o) => o.tipo === 'actividad').id].join(',') },
    { ids: 'no-existe:1' }],
};
PARAMS.escapadas.push({ orden: 'total' }, { orden: 'persona' }, { orden: 'calidad' }, { orden: 'comodo' }, { pres: '200' }, { pres: '80', prespor: 'persona' });

describe('panel con datos reales: cada vista se pinta limpia', () => {
  it('la muestra es variada (si no, la prueba no recorrería las ramas)', () => {
    const o = datos.ofertas;
    assert.equal(new Set(o.map((x) => x.fuente)).size, datos.fuentes.filter((f) => f.estado === 'ok').length);
    assert.ok(o.some((x) => x.chollazo) && o.some((x) => x.precio == null) && o.some((x) => x.tipo === 'vuelo'));
    assert.ok(o.some((x) => x.tiempo) && o.some((x) => x.eventos?.length) && o.some((x) => x.lugar?.comunidad));
    assert.ok(finde0 && finde1, 'hay findes por delante de la fecha de la muestra');
  });

  for (const vista of VISTAS) {
    it(`«${vista}» con ${PARAMS[vista]?.length ?? 0} combinaciones de filtros`, () => {
      assert.ok(VISTAS_HTML[vista], `VISTAS_HTML tiene la vista ${vista}`);
      assert.ok(PARAMS[vista], `la prueba cubre la vista ${vista}`);
      for (const params of PARAMS[vista]) {
        const donde = `${vista} ${JSON.stringify(params)}`;
        const e = estadoPanel();
        const html = VISTAS_HTML[vista].html(e, params);
        revisarHtml(html, donde, e);
        if (VISTAS_HTML[vista].resultados) {
          const resultados = VISTAS_HTML[vista].resultados(e, params);
          revisarHtml(resultados, `${donde} (resultados)`, e);
          // Repintar los resultados da lo mismo que traían al entrar en la vista.
          assert.ok(html.includes(resultados), `${donde}: los resultados repintados no coinciden con los de la vista`);
        }
      }
    });
  }

  it('con viajeros en los datos y con favoritas y descartadas, la portada y las escapadas siguen limpias', () => {
    const d = { ...datos, viajeros: 3 };
    const [fav, descartada] = datos.ofertas.filter((o) => o.tipo !== 'vuelo');
    const e = estadoPanel(d, { favoritos: new Set([fav.id]), descartadas: new Set([descartada.id]) });
    revisarHtml(VISTAS_HTML.finde.html(e, {}), 'finde viajeros=3', e);
    const escapadas = revisarHtml(VISTAS_HTML.escapadas.html(e, { fav: '1' }), 'escapadas fav', e);
    assert.ok(!escapadas.includes('Ninguna'), 'la favorita aparece al filtrar por favoritas');
    const html = VISTAS_HTML.escapadas.resultados(e, {});
    assert.ok(!html.includes(`data-ficha="${descartada.id}"`), 'la descartada no sale por defecto');
    assert.ok(VISTAS_HTML.escapadas.resultados(e, { sindesc: '0' }).includes(`data-ficha="${descartada.id}"`),
      'y sale al pedir también las descartadas');
  });

  it('la ficha de cada oferta de la muestra se pinta limpia', () => {
    const e = estadoPanel();
    for (const oferta of datos.ofertas) {
      const ctx = ctxTarjetas(e, { distancias: e.distanciasOrigen, actividades: actividadesCerca(datos.ofertas, oferta) });
      const visible = revisarHtml(contenidoFicha(oferta, ctx), `ficha ${oferta.id}`, e);
      assert.ok(desescapar(visible).includes(tituloLegible(oferta.titulo)), `ficha ${oferta.id}: lleva el título`);
    }
  });

  it('la sorpresa también', () => {
    const e = estadoPanel();
    revisarHtml(contenidoSorpresa(e, {}), 'sorpresa', e);
  });
});

describe('panel con datos reales: la portada no repite ofertas', () => {
  it('cada oferta sale como mucho una vez entre todos los bloques de la portada', () => {
    const e = estadoPanel();
    e.favoritos = new Set(datos.ofertas.filter((o) => o.chollazo).slice(0, 2).map((o) => o.id));
    const html = VISTAS_HTML.finde.html(e, {});
    // Las tarjetas y las filas de «Lo mejor para este finde» (los eventos enlazan a la escapada de al lado: no cuentan).
    const ids = [...html.matchAll(/data-descartar="([^"]+)"|<li class="idea" style="[^"]*">[^]*?data-ficha="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    assert.ok(ids.length > 5, 'la portada tiene ofertas');
    const repetidas = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(repetidas, []);
  });
});
