/**
 * Lo que hace que la web abra rápido y no se quede en «Cargando ofertas…»: todos los módulos
 * pedidos a la vez, los datos adelantados por tema.js, el aviso si el panel no arranca y una
 * caché por versión sin mezclas.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
    assert.match(tema, /fetch\(ruta, \{ cache: 'no-cache' \}\)/);
    assert.match(app, /fetch\(url, \{ cache: 'no-cache' \}\)/);
    for (const ruta of ['data/ofertas.json', 'data/historial.json']) assert.ok(tema.includes(`'${ruta}': pedir('${ruta}')`), ruta);
    // Con datos de otra web (hosting con datos remotos), no se adelantan: los pide app.js.
    assert.match(tema, /meta\[name="escapadas-datos"\]/);
    assert.match(app, /delete window\.escapadasDatos\[ruta\]/);
  });

  it('si el panel no arranca, aviso con «Recargar»; app.js avisa de que ha pintado', () => {
    const tema = leer('js/tema.js');
    assert.match(tema, /window\.addEventListener\('error'/);
    assert.match(tema, /serviceWorker\?\.getRegistrations/);
    assert.match(tema, /caches\.delete/);
    assert.match(leer('js/app.js'), /window\.escapadasListo = true;\n\s*window\.dispatchEvent\(new Event\('escapadas:listo'\)\)/);
    // Drive y Google Ads, con permiso ya dado, esperan a que haya ofertas en pantalla.
    assert.match(leer('js/anuncios.js'), /if \(decision === 'si'\) despuesDelPanel\(activar\)/);
  });

  it('el service worker no mezcla versiones: la interfaz guardada no se cambia por detrás', () => {
    const sw = leer('sw.js');
    const primeroCache = sw.slice(sw.indexOf('async function primeroCache'), sw.indexOf('self.addEventListener(\'fetch\''));
    assert.ok(primeroCache.length > 0);
    assert.match(primeroCache, /if \(guardada\) return guardada;/);
    assert.doesNotMatch(primeroCache, /waitUntil/);
  });
});
