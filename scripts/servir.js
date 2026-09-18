/**
 * Servidor estático local del panel (site/) en http://localhost:8080.
 *
 *   node scripts/servir.js              → sirve site/ tal cual (datos en site/data/)
 *   node scripts/servir.js --ejemplo    → sirve en /data/ los datos de ejemplo de test/fixtures/panel/
 *   node scripts/servir.js --puerto=3000
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SITIO = join(RAIZ, 'site');
const EJEMPLO = join(RAIZ, 'test', 'fixtures', 'panel');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Ruta del archivo en disco para una URL, o null si se sale de la carpeta servida. */
export function rutaArchivo(pathname, { ejemplo = false } = {}) {
  let ruta = decodeURIComponent(pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const [base, relativa] = ejemplo && ruta.startsWith('/data/') ? [EJEMPLO, ruta.slice('/data/'.length)] : [SITIO, ruta];
  const archivo = normalize(join(base, relativa));
  return archivo === base || archivo.startsWith(base + sep) ? archivo : null;
}

/** Crea el servidor (sin escuchar todavía). */
export function crearServidor({ ejemplo = false } = {}) {
  return createServer(async (peticion, respuesta) => {
    const { pathname } = new URL(peticion.url, 'http://localhost');
    let archivo = null;
    try {
      archivo = rutaArchivo(pathname, { ejemplo });
    } catch {
      // URL mal codificada: se trata como no encontrada.
    }
    if (!archivo || !['GET', 'HEAD'].includes(peticion.method)) {
      respuesta.writeHead(archivo ? 405 : 404, { 'content-type': TIPOS['.txt'] }).end(archivo ? 'Método no permitido' : 'No encontrado');
      return;
    }
    try {
      const contenido = await readFile(archivo);
      respuesta.writeHead(200, {
        'content-type': TIPOS[extname(archivo)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      respuesta.end(peticion.method === 'HEAD' ? undefined : contenido);
    } catch {
      respuesta.writeHead(404, { 'content-type': TIPOS['.txt'] }).end('No encontrado');
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const ejemplo = args.includes('--ejemplo');
  const puerto = Number(args.find((a) => a.startsWith('--puerto='))?.split('=')[1] ?? process.env.PORT ?? 8080);
  crearServidor({ ejemplo }).listen(puerto, () => {
    console.log(`Panel en http://localhost:${puerto}/${ejemplo ? ' (datos de ejemplo de test/fixtures/panel/)' : ''}`);
    console.log('Pulsa Ctrl+C para pararlo.');
  });
}
