/**
 * Baja a site/data/ los datos de la web publicada, para probar la web o empaquetarla sin
 * tener que escanear. La dirección sale de --base, de PANEL_URL o del repositorio de GitHub.
 *
 * Uso: node scripts/datos-publicados.js [--base https://tudominio.es/]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { leerArgumentos, normalizarBase } from './preparar-web.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARCHIVOS = ['ofertas.json', 'detalles.json', 'historial.json', 'vigilados.json', 'version.json'];

/** https://github.com/dueño/repo(.git) o git@github.com:dueño/repo → https://dueño.github.io/repo/ */
export function basePages(remoto) {
  const [, dueno, repo] = String(remoto).match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/) ?? [];
  return dueno && repo ? `https://${dueno.toLowerCase()}.github.io/${repo}/` : null;
}

function baseDelRepositorio() {
  if (process.env.GITHUB_REPOSITORY) return basePages(`github.com/${process.env.GITHUB_REPOSITORY}`);
  try {
    return basePages(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: RAIZ, encoding: 'utf8' }).trim());
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opciones = leerArgumentos(process.argv.slice(2));
  const base = normalizarBase(opciones.base ?? process.env.PANEL_URL) ?? baseDelRepositorio();
  if (!base) {
    console.error('No sé de dónde bajar los datos: pasa --base https://tu-web/');
    process.exit(2);
  }
  const destino = path.join(RAIZ, 'site', 'data');
  mkdirSync(destino, { recursive: true });
  for (const archivo of ARCHIVOS) {
    const respuesta = await fetch(new URL(`data/${archivo}`, base));
    if (!respuesta.ok) {
      // detalles.json y version.json no existen en webs publicadas antes de separarlos.
      if (['detalles.json', 'version.json'].includes(archivo)) continue;
      console.error(`HTTP ${respuesta.status} al bajar ${archivo} de ${base}`);
      process.exit(1);
    }
    writeFileSync(path.join(destino, archivo), Buffer.from(await respuesta.arrayBuffer()));
  }
  console.log(`Datos de ${base} en site/data/`);
}
