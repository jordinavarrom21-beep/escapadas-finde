/**
 * Informe de las fuentes que llevan tiempo fallando, para el issue semanal (salud.yml).
 * Lee data/estado.json y escribe el texto del issue en la salida estándar. Con
 * GITHUB_OUTPUT, dice además si hay algo que contar (hay=true/false).
 *
 * Uso: node scripts/salud-fuentes.js [data/estado.json] [--horas 24]
 */
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { leerArgumentos } from './preparar-web.js';

const HORA_MS = 60 * 60 * 1000;
const fecha = (iso) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' });

/** Fuentes con error o aviso desde hace más de `horas` (las desactivadas a propósito no cuentan). */
export function fuentesConProblemas(estado, { ahora = new Date(), horas = 24 } = {}) {
  const limite = ahora.getTime() - horas * HORA_MS;
  return Object.entries(estado.fuentes ?? {})
    .map(([id, f]) => {
      if (f.estado === 'error' && f.desdeError && Date.parse(f.desdeError) <= limite) {
        return { id, tipo: 'error', detalle: f.error ?? 'error', desde: f.desdeError, ultimoOk: f.ultimoOk ?? null };
      }
      if (f.aviso && f.desdeAviso && Date.parse(f.desdeAviso) <= limite) {
        return { id, tipo: 'aviso', detalle: f.aviso, desde: f.desdeAviso, ultimoOk: f.ultimoOk ?? null };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.desde.localeCompare(b.desde));
}

export function informe(problemas, horas) {
  const filas = problemas.map((p) => `| \`${p.id}\` | ${p.tipo === 'error' ? '🔴 Falla' : '🟠 Lee menos de lo normal'} | ${p.detalle.replace(/\|/g, '\\|').slice(0, 160)} | ${fecha(p.desde)} | ${p.ultimoOk ? fecha(p.ultimoOk) : '—'} |`);
  return `Estas fuentes llevan más de ${horas} h con problemas:

| Fuente | Estado | Detalle | Desde | Último escaneo bueno |
|---|---|---|---|---|
${filas.join('\n')}

Qué hacer:
- **HTTP 403 / 429**: la web está bloqueando o limitando las peticiones. Suele pasarse sola; si dura días, puede que haya añadido una protección anti-bot y la fuente no se puede leer sin saltársela (no se hace).
- **Lee menos de lo normal / falta un dato**: probablemente la web ha cambiado su diseño y el lector de \`src/fuentes/<fuente>.js\` necesita un ajuste.
- Para dejar de vigilar una fuente: \`"activa": false\` en \`config/ajustes.json\`.

_Este issue lo abre y lo cierra solo el workflow «Salud de las fuentes» cada lunes._`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // El primer argumento, si no es una opción, es la ruta del estado.
  const argumentos = process.argv.slice(2);
  const ruta = argumentos[0] && !argumentos[0].startsWith('--') ? argumentos.shift() : 'data/estado.json';
  const opciones = leerArgumentos(argumentos);
  const horas = Number(opciones.horas ?? 24);
  const problemas = fuentesConProblemas(JSON.parse(readFileSync(ruta, 'utf8')), { horas });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `hay=${problemas.length > 0}\n`);
  console.log(problemas.length ? informe(problemas, horas) : `Todas las fuentes activas van bien (ninguna con problemas de más de ${horas} h).`);
}
