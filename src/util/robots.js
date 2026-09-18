/**
 * Respeto a robots.txt: el orquestador comprueba, antes de ejecutar una fuente,
 * que el robots.txt de cada web permite todas las URLs que la fuente declara.
 */
import { ErrorHttp } from './http.js';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Error que indica que robots.txt prohíbe alguna ruta: la fuente queda «bloqueada», no «caída». */
export class ErrorRobots extends Error {
  constructor(prohibidas) {
    super(`Su robots.txt no permite consultar ${prohibidas.join(', ')}`);
    this.name = 'ErrorRobots';
    this.prohibidas = prohibidas;
  }
}

/**
 * true si el robots.txt `texto` permite a cualquier agente (`User-agent: *`)
 * pedir `ruta`. Gana la regla más larga que coincide y, a igualdad, `Allow`.
 */
export function rutaPermitida(texto, ruta) {
  const ganadora = reglasGenerales(texto)
    .filter((regla) => patronRobots(regla.ruta).test(ruta))
    .reduce((mejor, regla) => (
      !mejor || regla.ruta.length > mejor.ruta.length || (regla.ruta.length === mejor.ruta.length && regla.permitir)
        ? regla
        : mejor
    ), null);
  return ganadora?.permitir ?? true;
}

// Reglas Allow/Disallow de los grupos de robots.txt que incluyen `User-agent: *`.
function reglasGenerales(texto) {
  const reglas = [];
  let agentes = [];
  let leyendoAgentes = false;
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.replace(/#.*/, '');
    const separador = limpia.indexOf(':');
    if (separador < 0) continue;
    const campo = limpia.slice(0, separador).trim().toLowerCase();
    const valor = limpia.slice(separador + 1).trim();
    if (campo === 'user-agent') {
      agentes = leyendoAgentes ? [...agentes, valor] : [valor];
      leyendoAgentes = true;
    } else if (campo === 'allow' || campo === 'disallow') {
      leyendoAgentes = false;
      if (valor && agentes.includes('*')) reglas.push({ permitir: campo === 'allow', ruta: valor });
    }
  }
  return reglas;
}

// Patrón de robots.txt («*» = cualquier cosa, «$» final = fin de la ruta) como expresión regular.
function patronRobots(ruta) {
  const anclada = ruta.endsWith('$');
  const cuerpo = (anclada ? ruta.slice(0, -1) : ruta)
    .split('*')
    .map((trozo) => trozo.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${cuerpo}${anclada ? '$' : ''}`);
}

// robots.txt de un origen, guardado un día en caché. Sin robots.txt (4xx) se permite todo.
async function robotsDe(origen, ctx) {
  const clave = `robots:${origen}`;
  const ahora = ctx.ahora.getTime();
  const guardado = ctx.cache.obtener(clave, UN_DIA_MS, ahora);
  if (guardado !== undefined) return guardado;
  let texto;
  try {
    texto = await ctx.http.texto(`${origen}/robots.txt`);
  } catch (error) {
    if (!(error instanceof ErrorHttp) || error.estado < 400 || error.estado >= 500) throw error;
    texto = '';
  }
  ctx.cache.guardar(clave, texto, ahora);
  return texto;
}

/**
 * Lanza ErrorRobots si el robots.txt de alguna web no permite alguna de las `urls`.
 * Si no se puede leer un robots.txt (error de red o 5xx), lanza ese error: ante la
 * duda, no se consulta la web.
 * @param {{ahora: Date, cache: import('../cache.js').Cache, http: {texto: Function}}} ctx
 * @param {string[]} urls
 */
export async function comprobarRobots(ctx, urls) {
  const prohibidas = [];
  for (const url of urls) {
    const { origin, pathname, search } = new URL(url);
    const robots = await robotsDe(origin, ctx);
    if (!rutaPermitida(robots, `${pathname}${search}`)) prohibidas.push(`${origin}${pathname}`);
  }
  if (prohibidas.length) throw new ErrorRobots(prohibidas);
}
