/** La CSP de la portada solo deja cargar de cdnjs las librerías (y versiones) que pide cdn.js. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const cdn = readFileSync(new URL('../site/js/cdn.js', import.meta.url), 'utf8');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const directiva = (nombre) => csp.split(';').map((d) => d.trim().split(/\s+/)).find(([n]) => n === nombre).slice(1);

describe('CSP y cdn.js', () => {
  it('cada librería de cdn.js cabe en script-src o style-src, y cdnjs no está abierto entero', () => {
    const urls = [...cdn.matchAll(/\$\{CDNJS\}(\/[^`]+)/g)].map((m) => `https://cdnjs.cloudflare.com/ajax/libs${m[1]}`);
    assert.ok(urls.length >= 5);
    for (const url of urls) {
      const lista = directiva(url.endsWith('.css') ? 'style-src' : 'script-src');
      assert.ok(lista.some((fuente) => fuente.endsWith('/') && url.startsWith(fuente)), `${url}: cambia también la versión en la CSP de index.html`);
    }
    assert.ok(!directiva('script-src').includes('https://cdnjs.cloudflare.com'));
  });
});
