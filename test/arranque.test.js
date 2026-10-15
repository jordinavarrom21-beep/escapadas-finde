/**
 * Lo que hace que la web abra rápido y no se quede en «Cargando ofertas…»: todos los módulos
 * pedidos a la vez, los datos adelantados por tema.js, el aviso si el panel no arranca y una
 * caché por versión sin mezclas.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definiciones, htmlPagina } from '../src/paginas.js';

const SITE = new URL('../site/', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, SITE), 'utf8');

/** Los módulos que app.js carga al arrancar (sus import, y los de estos, sin repetir). */
function modulosDelPanel() {
  const vistos = new Set();
  const visitar = (archivo) => {
    if (vistos.has(archivo)) return;
    vistos.add(archivo);
    for (const [, siguiente] of leer(`js/${archivo}`).matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]\.\/([\w-]+\.js)['"]/gms)) visitar(siguiente);
  };
  visitar('app.js');
  return vistos;
}

describe('arranque de la web', () => {
  it('index.html pide a la vez todos los módulos del panel (si falta uno, vuelve la cadena)', () => {
    const indice = leer('index.html');
    const precargados = new Set([...indice.matchAll(/<link rel="modulepreload" href="js\/([\w-]+\.js)">/g)].map(([, archivo]) => archivo));
    for (const modulo of modulosDelPanel()) assert.ok(precargados.has(modulo), `falta <link rel="modulepreload" href="js/${modulo}">`);
    for (const archivo of precargados) assert.ok(modulosDelPanel().has(archivo), `${archivo} no lo usa el panel: sobra`);
    // tema.js, que adelanta los datos, va antes que los módulos.
    assert.ok(indice.indexOf('js/tema.js') < indice.indexOf('rel="modulepreload"'));
  });

  it('tema.js pide los datos con las mismas opciones que app.js y app.js los recoge una sola vez', () => {
    const tema = leer('js/tema.js');
    const app = leer('js/app.js');
    // Las mismas opciones (sin caché vieja) y el mismo límite para empezar a responder.
    assert.match(tema, /fetch\(ruta, \{ cache: 'no-cache', signal: control\?\.signal \}\)/);
    assert.match(tema, /window\.escapadasPedir\(ruta\)/);
    assert.match(app, /window\.escapadasPedir \? window\.escapadasPedir\(url\) : fetch\(url, \{ cache: 'no-cache' \}\)/);
    assert.ok(tema.includes("'data/ofertas.json': pedir('data/ofertas.json')"));
    // El historial, fuera de la portada o con una ficha encima: la portada lo pide después de
    // pintar (app.js), con la misma condición.
    const condicion = "dataset.vistaInicial !== 'finde' || location.hash.startsWith('#/oferta/')";
    assert.ok(tema.includes(`if (document.documentElement.${condicion}) pedidos['data/historial.json'] = pedir('data/historial.json');`));
    assert.ok(app.includes("const HISTORIAL_DESPUES = document.documentElement.dataset.vistaInicial === 'finde' && !location.hash.startsWith('#/oferta/');"));
    assert.match(app, /HISTORIAL_DESPUES \? \{\} : cargarJson\('data\/historial\.json', \{\}\)/);
    assert.match(app, /if \(HISTORIAL_DESPUES\) completarHistorial\(\);/);
    // La ficha no sale sin su gráfica por haberse abierto antes de que llegue.
    assert.match(app, /await Promise\.all\(\[cargarDetalles\(\), historialPendiente\]\);/);
    // Con datos de otra web (hosting con datos remotos), no se adelantan: los pide app.js.
    assert.match(tema, /meta\[name="escapadas-datos"\]/);
    assert.match(app, /delete window\.escapadasDatos\[ruta\]/);
  });

  it('si el panel no arranca, aviso con «Recargar»; app.js avisa de que ha pintado', () => {
    const tema = leer('js/tema.js');
    assert.match(tema, /window\.addEventListener\('error'/);
    // También un módulo que no llega (error del <script>, en captura) y un fallo asíncrono.
    assert.match(tema, /\}, true\);/);
    assert.match(tema, /window\.addEventListener\('unhandledrejection'/);
    // Cualquier «Reintentar» de la página borra la copia guardada, aunque el panel no arranque.
    assert.match(tema, /closest\?\.\('\[data-recargar-limpio\]'\)/);
    // Un fallo al pintar (no solo al pedir los datos) acaba en un error con «Reintentar».
    const app = leer('js/app.js');
    const iniciar = app.slice(app.indexOf('async function iniciar()'));
    assert.equal(iniciar.match(/falloAlArrancar\(/g).length, 2);
    assert.match(app, /data-recargar-limpio>/);
    assert.match(tema, /serviceWorker\?\.getRegistrations/);
    assert.match(tema, /caches\.delete/);
    assert.match(leer('js/app.js'), /window\.escapadasListo = true;\n\s*window\.dispatchEvent\(new Event\('escapadas:listo'\)\)/);
    // Drive y Google, con permiso ya dado, esperan a que haya ofertas en pantalla.
    assert.match(leer('js/consentimiento.js'), /else if \(acepta\.length\) despuesDelPanel\(\(\) => activar\(acepta\)\)/);
  });

  it('sin saltos al pintar (CLS): la vista se sabe desde el principio y el hueco se reserva mientras carga', () => {
    assert.match(leer('js/tema.js'), /document\.documentElement\.dataset\.vistaInicial = location\.hash/);
    const css = readFileSync(new URL('css/estilos.css', SITE), 'utf8');
    assert.match(css, /html\[data-vista-inicial="finde"\] body:not\(\[data-vista\]\) #boton-viaje/);
    assert.match(css, /\.js #principal:has\(> \.cargando\) \{ min-height: 100vh; \}/);
  });

  it('sin saltos al llegar la letra: respaldo del sistema ajustado y, en las guías, las dos pedidas ya', () => {
    const css = readFileSync(new URL('css/estilos.css', SITE), 'utf8');
    // Detrás de cada letra, su respaldo ajustado (Arial y equivalentes; Roboto en Android).
    assert.match(css, /--fuente: "Figtree", "Figtree respaldo", "Figtree respaldo Roboto", system-ui/);
    assert.match(css, /--fuente-titulos: "Bricolage Grotesque", "Bricolage respaldo", "Bricolage respaldo Roboto",/);
    const caras = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map(([, cuerpo]) => cuerpo).filter((c) => /respaldo/.test(c));
    assert.equal(caras.length, 6);
    for (const cara of caras) {
      assert.match(cara, /src: local\("[^"]+"\)/, 'solo letras del sistema: nada que bajar');
      assert.match(cara, /size-adjust: [\d.]+%; ascent-override: [\d.]+%; descent-override: [\d.]+%; line-gap-override: 0%;/);
    }
    // Las guías piden las dos letras con la hoja de estilos, como index.html (mismas URL que en el CSS).
    const guia = htmlPagina(definiciones({ origen: { nombre: 'Barcelona', lat: 41.39, lon: 2.17 } })[0], [], { raiz: '../', generado: '2026-10-15T08:00:00Z', total: 0 });
    for (const fuente of ['figtree', 'bricolage-grotesque']) {
      assert.match(guia, new RegExp(`<link rel="preload" href="\\.\\./fonts/${fuente}\\.woff2" as="font" type="font/woff2" crossorigin>`));
      assert.match(css, new RegExp(`url\\("\\.\\./fonts/${fuente}\\.woff2"\\)`));
      assert.match(leer('index.html'), new RegExp(`<link rel="preload" href="fonts/${fuente}\\.woff2" as="font" type="font/woff2" crossorigin>`));
    }
  });

  it('si la portada tarda más de 2 s, la de index.html (lo mejor de ahora), con el mismo título', () => {
    const css = readFileSync(new URL('css/estilos.css', SITE), 'utf8');
    assert.match(css, /\.js \.portada-estatica \{ display: none; \}/, 'en las demás vistas no se ve');
    assert.match(css, /\.js\.portada-mientras\[data-vista-inicial="finde"\] \.portada-estatica \{ display: grid; \}/);
    // A los 2 s de abrir la página (no de ejecutar tema.js): con buena conexión el panel ya ha llegado.
    assert.match(leer('js/tema.js'), /setTimeout\(\(\) => document\.documentElement\.classList\.add\('portada-mientras'\), Math\.max\(0, 2000 - performance\.now\(\)\)\);/);
    assert.match(css, /\.js\.sin-panel \.portada-estatica \{ display: grid; \}/, 'si el panel no arranca, ya');
    assert.match(css, /:is\(\.portada, \.portada-estatica\) \.titulo-vista \{/);
    // «Cargando ofertas…» va encima de la portada estática.
    const indice = leer('index.html');
    assert.ok(indice.indexOf('<p class="cargando"') < indice.indexOf('<!-- portada-estatica'));
  });

  it('el service worker no mezcla versiones: la interfaz guardada no se cambia por detrás', () => {
    const sw = leer('sw.js');
    const primeroCache = sw.slice(sw.indexOf('async function primeroCache'), sw.indexOf('self.addEventListener(\'fetch\''));
    assert.ok(primeroCache.length > 0);
    assert.match(primeroCache, /if \(guardada\) return guardada;/);
    assert.doesNotMatch(primeroCache, /waitUntil/);
  });
});
