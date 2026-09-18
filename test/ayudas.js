/** Utilidades compartidas por los tests (no es un archivo de tests). */
import { readFileSync } from 'node:fs';
import { Cache } from '../src/cache.js';
import { crearOferta } from '../src/modelo.js';

export const AJUSTES = JSON.parse(readFileSync(new URL('../config/ajustes.json', import.meta.url), 'utf8'));

/** Viernes 18 de septiembre de 2026, 10:00 en Madrid. */
export const AHORA = new Date('2026-09-18T08:00:00Z');

export const leerFixture = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');
export const leerFixtureJson = (nombre) => JSON.parse(leerFixture(nombre));

let contador = 0;
/** Oferta válida con los campos mínimos más los que se indiquen. */
export function oferta(campos = {}) {
  contador += 1;
  const fuente = campos.fuente ?? 'prueba';
  return crearOferta({ id: `${fuente}:${contador}`, fuente, titulo: `Oferta ${contador}`, url: 'https://ejemplo.es/oferta', ...campos });
}

/**
 * Contexto de fuente o enriquecedor con red simulada: `respuestas` es una función
 * (url) → valor, o lanza para simular un fallo. Guarda peticiones, esperas y logs.
 */
export function crearCtx({ respuestas = () => { throw new Error('sin red en los tests'); }, ajustes = AJUSTES, ahora = AHORA, cache = new Cache() } = {}) {
  const peticiones = [];
  const esperas = [];
  const logs = [];
  const pedir = async (url) => {
    peticiones.push(url);
    return respuestas(url);
  };
  return {
    ctx: { ahora, ajustes, cache, env: {}, findes: [], puentes: [], http: { texto: pedir, json: pedir, esperar: async (ms) => { esperas.push(ms); } }, log: (m) => logs.push(m) },
    peticiones,
    esperas,
    logs,
  };
}
