/**
 * Lo común de las pruebas del navegador: el servidor local de la web (scripts/servir.js,
 * en un puerto libre), el navegador y un contexto con las librerías del CDN.
 *
 * Datos: los de site/data/ (en GitHub los baja el workflow de la web publicada).
 * Sin red (p. ej. en un contenedor), LIBS_DIR apunta a una carpeta con leaflet.min.css,
 * leaflet.min.js y chart.umd.min.js y se sirven de ahí.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { crearServidor } from '../scripts/servir.js';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function arrancar() {
  if (!existsSync(path.join(RAIZ, 'site', 'data', 'ofertas.json'))) {
    throw new Error('Faltan los datos en site/data/ (npm run datos:publicados los baja de la web)');
  }
  const servidor = crearServidor();
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  const base = `http://127.0.0.1:${servidor.address().port}/`;
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  return {
    base,
    navegador,
    cerrar: async () => { await navegador.close(); servidor.close(); },
  };
}

/** Contexto con el CDN local (si LIBS_DIR) y el buscador de lugares simulado. */
export async function contexto(navegador, opciones = {}) {
  const c = await navegador.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', ...opciones });
  const libs = process.env.LIBS_DIR;
  if (libs) {
    // Las copias locales no casan con el integrity del CDN: se desactiva solo en la prueba.
    await c.addInitScript(() => {
      for (const P of [HTMLScriptElement.prototype, HTMLLinkElement.prototype]) Object.defineProperty(P, 'integrity', { set() {}, get() { return ''; }, configurable: true });
    });
    await c.route('https://cdnjs.cloudflare.com/**', (r) => {
      const archivo = path.join(libs, r.request().url().split('/').pop());
      return existsSync(archivo) ? r.fulfill({ path: archivo }) : r.abort();
    });
  }
  await c.route('https://photon.komoot.io/**', (r) => r.fulfill({ path: path.join(RAIZ, 'test/fixtures/panel/photon-girona.json'), contentType: 'application/json' }));
  // Mapas y fotos de fuera no hacen falta para probar y harían la prueba lenta e inestable.
  await c.route(/tile\.openstreetmap\.org|images\.|\.jpg|\.jpeg|\.webp/, (r) => r.abort());
  return c;
}

/** Errores de la página (los de red de lo que se ha bloqueado adrede no cuentan). */
export function vigilarErrores(pagina, errores, prefijo = '') {
  pagina.on('pageerror', (e) => errores.push(`${prefijo}pageerror: ${e.message}`));
  pagina.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|ERR_FAILED|tile\.openstreetmap|Failed to load resource/.test(m.text())) errores.push(`${prefijo}console: ${m.text()}`);
  });
}
