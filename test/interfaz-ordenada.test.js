/**
 * Lo que pidió el propietario el 16/10/2026: filtros en un orden coherente, las explicaciones
 * detrás de un botón «ⓘ» (antes, demasiado texto a la vista), el tema claro por defecto, el
 * aviso de ofertas nuevas que no se queda fijo, textos que no se cortan y la tarjeta de vuelo
 * sin la minigráfica de ancho fijo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { estadoPanel } from './ayudas-panel.js';
import {
  resultadosActividades, resultadosBuscar, resultadosEscapadas, resultadosVuelos, vistaActividades, vistaBuscar, vistaCalendario, vistaEscapadas,
  vistaFuentes, vistaMis, vistaVuelos,
} from '../site/js/vistas.js';
import { campoTexto, formularioViaje, interruptor } from '../site/js/vistas-comun.js';
import { tarjetaVuelo, tendenciaPrecio } from '../site/js/plantillas.js';

const SITE = new URL('../site/', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, SITE), 'utf8');
const CSS = leer('css/estilos.css');

/** Cada «ⓘ» abre un texto plegado que existe y es suyo; ningún id se repite en la página. */
function comprobarInfos(html, donde) {
  const botones = [...html.matchAll(/<button type="button" class="boton-info" data-info="([^"]+)" aria-expanded="false" aria-controls="([^"]+)" aria-label="([^"]+)"/g)];
  for (const [, destino, controla, etiqueta] of botones) {
    assert.equal(destino, controla, `${donde}: data-info y aria-controls apuntan a lo mismo`);
    assert.match(etiqueta, /^Qué es: \S/, `${donde}: la ⓘ dice de qué es`);
    const texto = html.match(new RegExp(`<div class="info-texto" id="${controla}" hidden>([^]*?)</div>`))?.[1];
    assert.ok(texto?.replace(/<[^>]+>/g, '').trim(), `${donde}: falta el texto de ${controla}, o no empieza plegado`);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], `${donde}: ids repetidos`);
  // Fuera de los títulos: dentro, «Qué es: …» pasaba a ser parte del nombre del título.
  assert.doesNotMatch(html, /<h[1-6][^>]*>(?:(?!<\/h[1-6]>)[^])*class="boton-info"/, `${donde}: una «ⓘ» dentro de un título`);
  return botones.length;
}

describe('filtros en un orden coherente', () => {
  const e = estadoPanel();

  it('Escapadas: dónde, cómo vas, cuánto y qué te apetece; «¿Cómo vas?» con el mismo título que los demás', () => {
    const html = vistaEscapadas(e, {});
    const orden = ['name="q"', 'id="lugar-texto"', 'name="h"', 'name="como"', 'name="precio"', 'name="temas"', '<details class="filtros__mas filtros__mas--panel"', 'name="notemas"', 'data-nombre-busqueda'];
    const posiciones = orden.map((trozo) => html.indexOf(trozo));
    assert.ok(posiciones.every((p) => p > 0), orden.filter((_, i) => posiciones[i] < 0).join(', '));
    assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, 'en este orden');
    assert.match(html, /<fieldset class="bloque"><legend class="bloque__titulo">¿Cómo vas\?<\/legend>/);
  });

  it('Planes: el mismo orden que Escapadas (dónde, cuánto y qué)', () => {
    const html = vistaActividades(e, {});
    const titulos = [...html.matchAll(/class="bloque__titulo">([^<]+)</g)].map(([, t]) => t);
    assert.deepEqual(titulos, ['¿Dónde?', '¿Cuánto?', '¿Qué te apetece?']);
    assert.ok(html.indexOf('name="dest"') < html.indexOf('name="max"') && html.indexOf('name="max"') < html.indexOf('name="temas"'));
    assert.ok(html.indexOf('name="gratis"') < html.indexOf('name="temas"'), '«Solo gratis», con el precio');
  });

  it('Vuelos: los campos juntos y, debajo, los interruptores', () => {
    const html = vistaVuelos(e, {});
    const fila = html.slice(html.indexOf('<div class="filtros__fila">'), html.indexOf('</div>', html.indexOf('<div class="filtros__fila">')));
    for (const nombre of ['q', 'aero', 'pais', 'max', 'orden']) assert.match(fila, new RegExp(`name="${nombre}"`), nombre);
    assert.doesNotMatch(fila, /type="checkbox"/);
    assert.ok(html.indexOf('name="mios"') < html.indexOf('name="ideal"'), '«Solo desde tus aeropuertos» junto a lo de la salida');
  });
});

describe('las explicaciones, detrás de una «ⓘ»', () => {
  const e = estadoPanel();

  it('en los filtros de Escapadas no queda ningún párrafo explicativo a la vista', () => {
    const html = vistaEscapadas(e, {});
    assert.ok(comprobarInfos(html, 'escapadas') >= 6);
    // Solo los avisos de «Cerca de…», vacíos hasta que pasa algo.
    const ayudas = [...html.matchAll(/<p class="ayuda"([^>]*)>([^]*?)<\/p>/g)].filter(([, atributos]) => !atributos.includes('fechas__ayuda'));
    assert.deepEqual(ayudas.map(([, atributos, texto]) => [atributos, texto]), [[' id="lugar-ayuda" role="status"', '']]);
    assert.match(html, /<div class="titulo-con-info"><h2 class="bloque__titulo">¿Dónde\?<\/h2><button[^>]*aria-controls="info-lugar"/);
    assert.match(html, /id="info-lugar" hidden>Midiendo desde Barcelona/);
    assert.match(html, /<fieldset class="bloque" aria-label="¿Cuánto\?"><legend class="bloque__titulo">¿Cuánto\?<button[^>]*aria-controls="info-cuanto"[^]*?id="info-cuanto" hidden>El <strong>viaje completo<\/strong> suma la oferta/);
    // La «ⓘ» pegada a la última palabra, con las dos partes del rótulo unidas al mismo campo.
    assert.match(html, /<span class="campo__rotulo"><label for="campo-pts">Valor de la oferta mín\.<\/label> <span class="sin-corte"><label for="campo-pts">\(0\u2060–\u2060100\)<\/label><button[^>]*aria-controls="info-valor"/);
    assert.match(html, /<input id="campo-pts" type="number" name="pts"/, 'el rótulo sigue unido a su campo');
    assert.match(html, /<span class="campo__rotulo"><span class="sin-corte"><label for="nombre-busqueda-escapadas">Nombre<\/label><button[^>]*aria-controls="info-guardar-escapadas"/);
    // «No quiero ver…»: lo que hace, en su «ⓘ»; a la vista, solo cómo deshacerlo cuando hay algo quitado.
    assert.match(html, /<label for="campo-notemas">Quitar una<\/label> <span class="sin-corte"><label for="campo-notemas">temática<\/label><button[^>]*aria-controls="info-excluir"[^]*?id="info-excluir" hidden>Lo que quites aquí no sale en ninguna lista/);
    assert.doesNotMatch(html, /<p class="ayuda">Desmarca/, 'sin nada quitado, sin texto');
    assert.match(vistaEscapadas(e, { notemas: 'spa' }), /<p class="ayuda">Desmarca uno para volver a verlo\.<\/p>/);
  });

  it('el porqué del orden, en la «ⓘ» de «Ordenar:»; las que el presupuesto deja fuera, a la vista', () => {
    const html = resultadosEscapadas(e, { orden: 'total', pres: '300' });
    comprobarInfos(html, 'orden');
    assert.match(html, /<span class="orden-rapido__titulo">Ordenar:<\/span><button[^>]*aria-controls="info-orden-escapadas"/);
    assert.match(html, /id="info-orden-escapadas" hidden><p class="explicacion-orden">Ordenadas por lo que cuesta el viaje completo[^<]*<button[^>]*>[^<]*<\/button><\/p><\/div>/);
    // No es una explicación, sino por qué faltan ofertas: a la vista, no escondido bajo «el orden».
    assert.match(html, /<p class="aviso-memoria aviso-presupuesto">[^]*?\d+ ofertas no salen con el presupuesto: les faltan datos para calcular el viaje completo\.<\/p>/);
    assert.match(resultadosEscapadas(e, { pres: '300' }), /class="aviso-memoria aviso-presupuesto"/, 'también con el orden de siempre');
    assert.doesNotMatch(resultadosEscapadas(e, {}), /aviso-presupuesto/, 'sin presupuesto, nada');
    assert.doesNotMatch(html, /<p class="seccion__intro[^"]*">(Ordenadas|Presupuesto)/);
    // Con el orden de siempre no hay nada que explicar.
    assert.doesNotMatch(resultadosEscapadas(e, {}), /info-orden-escapadas/);
  });

  it('las vistas explican qué son desde una «ⓘ» junto a la cuenta o al título', () => {
    const casos = [
      ['planes', vistaActividades(e, {}), /<p class="resultados__cuenta">[^<]*<button[^>]*aria-controls="info-planes"/],
      ['buscar', vistaBuscar(e, { q: 'spa' }), /<p class="resultados__cuenta">[^<]*<button[^>]*aria-controls="info-buscar"/],
      ['calendario', vistaCalendario(e), /<div class="titulo-con-info"><h1 class="titulo-vista" tabindex="-1">Calendario<\/h1><button[^>]*aria-controls="info-calendario"/],
      ['fuentes', vistaFuentes(e), /aria-controls="info-fuentes"[^]*?id="info-fuentes" hidden>Cada web se revisa por su cuenta/],
      ['búsquedas', vistaMis(e, { ver: 'busquedas' }), /<div class="titulo-con-info"><h1 class="titulo-vista" tabindex="-1">Búsquedas guardadas<\/h1><button/],
      ['tu viaje', formularioViaje(e), /<div class="titulo-con-info"><h2 id="viaje-titulo">Tu viaje<\/h2><button[^]*<fieldset class="ubicacion" aria-label="Salgo desde"><legend class="con-boton-info">Salgo desde<button[^>]*aria-controls="info-salida"/],
      ['buscar sin resultados', vistaBuscar(e, { q: 'zzzzqx' }), /<p class="resultados__cuenta">0 ofertas<button[^>]*aria-label="Qué es: Buscar en todo"/],
    ];
    for (const [donde, html, patron] of casos) {
      assert.ok(comprobarInfos(html, donde) >= 1, donde);
      assert.match(html, patron, donde);
    }
    assert.doesNotMatch(vistaActividades(e, {}), /<p class="seccion__intro">Entradas, visitas guiadas/);
    assert.doesNotMatch(vistaBuscar(e, { q: 'spa' }), /<p class="seccion__intro">Busca en/);
    assert.match(resultadosBuscar(e, { q: 'spa' }), /id="info-buscar" hidden>Busca en <strong>todas<\/strong>/);
    comprobarInfos(vistaVuelos(e, {}), 'vuelos');
    assert.equal(resultadosActividades(e, {}).match(/id="info-planes"/g).length, 1);
    assert.match(resultadosVuelos(e, {}), /class="resultados__cuenta"/);
  });

  it('app.js abre y cierra la explicación y ubicacion.js pone al día la de «¿Dónde?»', () => {
    const app = readFileSync(new URL('js/app.js', SITE), 'utf8');
    assert.match(app, /else if \(d\.info\) alternarInfo\(objetivo\);/);
    assert.match(app, /\[data-info\]/);
    assert.match(app, /texto\.hidden = !abrir;\s+boton\.setAttribute\('aria-expanded', String\(abrir\)\);/);
    const ubicacion = readFileSync(new URL('js/ubicacion.js', SITE), 'utf8');
    assert.match(ubicacion, /querySelector\(`#info-\$\{prefijo\}`\)/);
    assert.match(ubicacion, /if \(info\) info\.textContent = textoAyudaUbicacion\(punto, origen, salida\);/);
    // En el móvil, área de toque de 40 px.
    assert.match(CSS, /@media \(max-width: 719px\) \{\s+\.boton-info \{ width: 40px; height: 40px;/);
  });
});

describe('tema claro por defecto', () => {
  /** Ejecuta tema.js con lo guardado en este navegador y devuelve el tema que pone. */
  function temaCon(guardado, { sinAlmacen = false } = {}) {
    const meta = { contenido: '#f4efe6', setAttribute(_, valor) { this.contenido = valor; } };
    const raiz = { dataset: {}, classList: { add() {} } };
    const documento = {
      documentElement: raiz, readyState: 'complete', addEventListener() {},
      querySelector: (selector) => (selector === 'meta[name="theme-color"]' ? meta : null),
    };
    const almacen = { getItem: (clave) => { if (sinAlmacen) throw new Error('bloqueado'); return clave === 'escapadas:tema' ? guardado : null; } };
    const ventana = { addEventListener() {} };
    vm.runInNewContext(readFileSync(new URL('js/tema.js', SITE), 'utf8'), {
      document: documento, localStorage: almacen, window: ventana, location: { hash: '', origin: 'https://x' },
      setTimeout: () => 0, performance: { now: () => 0 }, console: { warn() {} }, navigator: {},
    });
    return { tema: raiz.dataset.theme ?? 'light', color: meta.contenido };
  }

  it('sin nada guardado es claro aunque el sistema esté en oscuro; el oscuro, solo si se eligió', () => {
    assert.deepEqual(temaCon(null), { tema: 'light', color: '#f4efe6' });
    assert.deepEqual(temaCon('claro'), { tema: 'light', color: '#f4efe6' });
    assert.deepEqual(temaCon('oscuro'), { tema: 'dark', color: '#0f1514' });
    assert.deepEqual(temaCon(null, { sinAlmacen: true }), { tema: 'light', color: '#f4efe6' });
    // Ni los estilos ni la 404 ni la barra del navegador siguen al sistema.
    assert.doesNotMatch(CSS, /prefers-color-scheme/);
    assert.doesNotMatch(leer('404.html'), /prefers-color-scheme/);
    assert.doesNotMatch(leer('index.html'), /prefers-color-scheme/);
    assert.match(CSS, /:root\[data-theme="dark"\] \{\s+color-scheme: dark;/);
    const app = readFileSync(new URL('js/app.js', SITE), 'utf8');
    assert.match(app, /const temaEfectivo = \(\) => \(document\.documentElement\.dataset\.theme === 'dark' \? 'dark' : 'light'\);/);
  });
});

describe('aviso de ofertas nuevas que no se queda fijo', () => {
  const app = readFileSync(new URL('js/app.js', SITE), 'utf8');

  it('se va solo, se cierra con ✕ y, cerrado, no vuelve en esta visita', () => {
    assert.match(app, /const AVISO_DATOS_MS = 10_000;/);
    assert.match(app, /relojAvisoDatos = setTimeout\(cerrarAvisoDatosSiNoSeUsa, AVISO_DATOS_MS\);/);
    assert.match(app, /data-cerrar-datos-nuevos aria-label="Cerrar el aviso"/);
    assert.match(app, /if \(aviso\.querySelector\('\[data-actualizar\]'\) \|\| avisoDatosCerrado \|\| todo\[0\]\.generado === avisoDatosDe\) return;\s+avisoDatosDe = todo\[0\]\.generado;/);
    // Cerrar «Hay una versión nueva» no apaga los de ofertas nuevas; con el foco dentro, no se va.
    assert.match(app, /if \(porUsuario && !aviso\.querySelector\('\[data-actualizar\]'\)\) avisoDatosCerrado = true;/);
    assert.match(app, /if \(aviso\.contains\(document\.activeElement\) \|\| encima\) relojAvisoDatos = setTimeout\(cerrarAvisoDatosSiNoSeUsa, AVISO_DATOS_MS\);/);
    // Al usar los datos nuevos al cambiar de vista, sigue el aviso «Con los filtros de la última vez».
    assert.match(app, /const \{ paginas, salto, filtrosRecordados \} = estado;[^]*?estado = \{ \.\.\.crearEstado\(datos, historial, vigilados\), paginas, salto, filtrosRecordados \};/);
    // Los datos que no se pidieron con «Ver» se usan al cambiar de vista, que repinta igualmente.
    assert.match(app, /if \(datosNuevos\) usarDatos\(datosNuevos, \{ pintar: false \}\);\s+render\(\);/);
    // En el móvil ocupaba media pantalla y cuatro líneas: ahora, con su ancho.
    assert.match(CSS, /\.aviso-flotante--datos \{[^}]*width: max-content;/);
  });
});

describe('textos que no se cortan', () => {
  it('sellos de la foto, lugar, opiniones y datos de la tarjeta bajan de línea en vez de cortarse', () => {
    const regla = (selector) => CSS.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    assert.doesNotMatch(regla('.sello'), /nowrap/);
    assert.doesNotMatch(regla('.tarjeta__lugar'), /nowrap|ellipsis/);
    assert.match(regla('.tarjeta__lugar'), /line-clamp: 2/);
    assert.doesNotMatch(regla('.tarjeta__opiniones'), /nowrap|ellipsis|(?<!-)height: 20px/);
    assert.doesNotMatch(regla('.tarjeta .tarjeta__datos'), /overflow: hidden|(?<!-)height: 45px/);
    // El aviso de bloque de Guardados ya no convierte «pocas opiniones» de las tarjetas en una caja.
    assert.doesNotMatch(CSS, /\n\.aviso-suave \{ display: flex/);
    assert.match(CSS, /\np\.aviso-suave \{ display: flex/);
  });
});

describe('rótulos, buscadores y billetes alineados', () => {
  it('la «ⓘ» va en la fila del rótulo aunque este baje de línea', () => {
    assert.match(interruptor('fin', 'Solo si caben enteras en el finde o puente elegido', false, ['encaje', 'Texto.']),
      /^<div class="con-info"><div class="con-info__fila"><label class="interruptor">[^]*<\/label><button type="button" class="boton-info"[^]*<\/button><\/div><div class="info-texto" id="info-encaje" hidden>Texto\.<\/div><\/div>$/);
    assert.match(CSS, /\.con-info__fila \{ display: flex;[^}]*\}/);
    assert.match(CSS, /\.con-info__fila > \.interruptor \{ flex: 0 1 auto; min-width: 0; \}/);
    assert.match(CSS, /\.campo__rotulo \{ display: block;/);
    assert.match(CSS, /\.sin-corte \{ white-space: nowrap; \}/);
    // Los avisos de «Cerca de…» (role="status"), vacíos pero en la página: con display: none no se leían.
    assert.doesNotMatch(CSS, /\.ayuda:empty \{ display: none; \}/);
    assert.match(CSS, /\.ayuda:empty \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\); \}/);
    // «(0–100)» no se parte en «(0–» y «100)».
    assert.match(vistaEscapadas(estadoPanel(), {}), /Valoración mín\. \(0\u2060–\u206010\)/);
  });

  it('cada buscador sugiere lo que busca: hotel en escapadas; en planes, actividades (no los eventos)', () => {
    assert.match(campoTexto({ q: '' }, 'escapadas'), /placeholder="Destino u hotel"/);
    assert.match(campoTexto({ q: '' }, 'vuelos'), /placeholder="Ciudad o país"/);
    assert.match(campoTexto({ q: '' }, 'planes'), /placeholder="Actividad o lugar"/);
    assert.match(leer('index.html'), /id="q" name="q" type="search" placeholder="Buscar en todo: destino, hotel…"/);
  });

  it('el color de la tendencia va con lo que dice la frase (frente a ayer), no con el primer día', () => {
    // Bajó en la semana, pero ayer costaba 1 € menos: «1 € más que ayer» va en rojo.
    const serie = [['2026-10-01', 40], ['2026-10-07', 33], ['2026-10-08', 34]];
    assert.match(tendenciaPrecio(serie), /^<p class="tendencia tendencia--sube"[^>]*>1\s€ más que ayer · 6\s€ menos que hace una semana<\/p>$/);
    assert.match(tendenciaPrecio([['2026-10-07', 35], ['2026-10-08', 34]]), /tendencia--baja/);
    assert.match(tendenciaPrecio([['2026-10-07', 34], ['2026-10-08', 34]]), /tendencia--igual/);
  });

  it('en el billete, los sellos van con la ruta: el precio queda a la misma altura en toda la fila', () => {
    const e = estadoPanel();
    const vuelo = e.datos.ofertas.find((o) => o.vuelo);
    const html = tarjetaVuelo({ ...vuelo, vuelo: { ...vuelo.vuelo, horarioIdeal: true } }, { ...estadoPanel(), historial: {} });
    const principal = html.slice(html.indexOf('billete__principal'), html.indexOf('billete__talon'));
    const pie = html.slice(html.indexOf('billete__pie'));
    assert.match(principal, /<div class="insignias">[^]*Horario ideal/);
    assert.doesNotMatch(pie, /class="insignias"/);
  });
});
