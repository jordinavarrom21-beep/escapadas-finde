import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SITE = new URL('../site/', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, SITE), 'utf8');
const SW = leer('sw.js');
const MANIFIESTO = JSON.parse(leer('manifest.webmanifest'));
const INDEX = leer('index.html');

/** Las rutas de la lista INTERFAZ del service worker. */
function interfaz() {
  const bloque = SW.match(/const INTERFAZ = \[([\s\S]*?)\];/);
  assert.ok(bloque, 'sw.js debe declarar la lista INTERFAZ');
  return [...bloque[1].matchAll(/'([^']+)'/g)].map(([, ruta]) => ruta);
}

/** Ancho y alto de un PNG, leídos de su cabecera IHDR. */
function tamPng(ruta) {
  const datos = readFileSync(new URL(ruta, SITE));
  assert.deepEqual([...datos.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${ruta} no es un PNG`);
  return `${datos.readUInt32BE(16)}x${datos.readUInt32BE(20)}`;
}

/**
 * Alfa de las cuatro esquinas (arriba izq., arriba der., abajo izq., abajo der.) de
 * un PNG RGBA sin filtros por fila, que es como los escribe scripts/iconos.js.
 */
function alfaEsquinas(ruta) {
  const datos = readFileSync(new URL(ruta, SITE));
  const ancho = datos.readUInt32BE(16);
  const alto = datos.readUInt32BE(20);
  assert.equal(datos[25], 6, `${ruta}: se espera RGBA`);
  const idat = [];
  for (let i = 8; i < datos.length; i += 12 + datos.readUInt32BE(i)) {
    if (datos.toString('ascii', i + 4, i + 8) === 'IDAT') idat.push(datos.subarray(i + 8, i + 8 + datos.readUInt32BE(i)));
  }
  const filas = inflateSync(Buffer.concat(idat));
  const bytesFila = ancho * 4 + 1;
  const alfa = (x, y) => {
    assert.equal(filas[y * bytesFila], 0, `${ruta}: fila ${y} con filtro`);
    return filas[y * bytesFila + 1 + x * 4 + 3];
  };
  return [alfa(0, 0), alfa(ancho - 1, 0), alfa(0, alto - 1), alfa(ancho - 1, alto - 1)];
}

describe('app instalable: service worker', () => {
  it('todo lo que precarga existe (si falta uno, la instalación entera falla)', () => {
    for (const ruta of interfaz()) {
      assert.ok(existsSync(new URL(ruta === './' ? 'index.html' : ruta, SITE)), ruta);
    }
  });

  it('precarga todos los módulos del panel, para que funcione sin conexión', () => {
    const lista = new Set(interfaz());
    for (const archivo of readdirSync(new URL('js/', SITE)).filter((a) => a.endsWith('.js'))) {
      assert.ok(lista.has(`js/${archivo}`), `falta js/${archivo} en INTERFAZ de sw.js`);
    }
  });

  it('lleva la marca de versión que el workflow sustituye por el commit', () => {
    assert.equal(SW.match(/'escapadas-interfaz-dev'/g)?.length, 1);
    assert.match(readFileSync(new URL('../.github/workflows/vigilar.yml', import.meta.url), 'utf8'), /s\/escapadas-interfaz-dev\//);
  });

  it('no se traga los errores en silencio', () => {
    assert.doesNotMatch(SW, /catch\(\(\) => \{\}\)/);
  });
});

describe('app instalable: manifiesto', () => {
  it('tiene los iconos PNG que piden Android y Chrome, con el tamaño que declaran', () => {
    const png = MANIFIESTO.icons.filter((i) => i.type === 'image/png');
    for (const icono of png) assert.equal(tamPng(icono.src), icono.sizes, icono.src);
    const tamanos = (proposito) => png.filter((i) => i.purpose === proposito).map((i) => i.sizes);
    assert.ok(tamanos('any').includes('192x192'));
    assert.ok(tamanos('any').includes('512x512'));
    assert.ok(tamanos('maskable').includes('512x512'));
  });

  it('el icono «maskable» y el del iPhone van a sangre; el normal, con esquinas redondeadas', () => {
    // Una esquina transparente sale negra cuando el sistema aplica su máscara.
    const maskable = MANIFIESTO.icons.find((i) => i.purpose === 'maskable').src;
    assert.deepEqual(alfaEsquinas(maskable), [255, 255, 255, 255]);
    assert.deepEqual(alfaEsquinas('apple-touch-icon.png'), [255, 255, 255, 255]);
    assert.deepEqual(alfaEsquinas('icono-512.png').slice(0, 2), [0, 0], 'las esquinas de arriba del icono normal son redondas');
  });

  it('arranca y abre sus atajos dentro de su ámbito y en vistas que existen', () => {
    assert.equal(MANIFIESTO.scope, './');
    assert.equal(MANIFIESTO.display, 'standalone');
    for (const url of [MANIFIESTO.start_url, ...MANIFIESTO.shortcuts.map((a) => a.url)]) {
      assert.match(url, /^\.\/#\/[a-z]+$/, url);
      assert.ok(INDEX.includes(`href="${url.slice(2)}"`), `la vista ${url} no está en el menú`);
    }
  });
});

describe('app instalable: index.html', () => {
  it('enlaza el manifiesto y un icono PNG para el iPhone (ignora los SVG)', () => {
    assert.match(INDEX, /<link rel="manifest" href="manifest\.webmanifest">/);
    const apple = INDEX.match(/<link rel="apple-touch-icon" href="([^"]+)">/);
    assert.ok(apple, 'falta apple-touch-icon');
    assert.equal(tamPng(apple[1]), '180x180');
  });
});
