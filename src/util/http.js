/**
 * Cliente HTTP común a todas las fuentes: tiempo límite, reintentos con espera
 * creciente (respetando «Retry-After»), errores con contexto y métricas por dominio.
 */

const REPO = process.env.GITHUB_REPOSITORY ?? 'escapadas-finde';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  `Chrome/128.0 Safari/537.36 EscapadasFinde/1.0 (+https://github.com/${REPO})`;

/** Códigos de estado que merece la pena reintentar. */
const REINTENTABLES = new Set([408, 425, 429, 500, 502, 503, 504]);
/** Códigos en los que la web sí sabe cuánto tenemos que esperar. */
const CON_RETRY_AFTER = new Set([429, 503]);
/** Nunca se espera más que esto entre intentos, diga lo que diga la web. */
const ESPERA_MAXIMA_MS = 30_000;
/** Cuánto cuerpo se guarda cuando la respuesta no es JSON. */
const MUESTRA_CUERPO = 200;
/** Nombres con los que `fetch` avisa de que se agotó el tiempo de espera. */
const ABORTOS = new Set(['AbortError', 'TimeoutError']);

const dominioDe = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
};

const conCausa = (causa) => (causa === undefined ? undefined : { cause: causa });

export class ErrorHttp extends Error {
  /**
   * @param {number} estado
   * @param {string} url
   * @param {{intento?: number, duracionMs?: number, cause?: unknown}} [contexto]
   */
  constructor(estado, url, { intento = 0, duracionMs = 0, cause } = {}) {
    super(`HTTP ${estado} en ${dominioDe(url)}`, conCausa(cause));
    this.name = 'ErrorHttp';
    this.estado = estado;
    this.url = url;
    this.dominio = dominioDe(url);
    this.intento = intento;
    this.duracionMs = duracionMs;
    /** Espera que pide la web en «Retry-After» (ms), cuando la pide y la respetamos. */
    this.esperaSugeridaMs = null;
  }
}

const MOTIVOS_RED = { red: 'Fallo de red', timeout: 'Tiempo de espera agotado' };

/** La petición no llegó a completarse: DNS, TLS, conexión caída o tiempo agotado. */
export class ErrorRed extends Error {
  /**
   * @param {string} url
   * @param {{motivo?: 'red'|'timeout', intento?: number, duracionMs?: number, cause?: unknown}} [contexto]
   */
  constructor(url, { motivo = 'red', intento = 0, duracionMs = 0, cause } = {}) {
    super(`${MOTIVOS_RED[motivo]} en ${dominioDe(url)}`, conCausa(cause));
    this.name = 'ErrorRed';
    this.motivo = motivo;
    this.url = url;
    this.dominio = dominioDe(url);
    this.intento = intento;
    this.duracionMs = duracionMs;
  }
}

/**
 * La respuesta llegó entera pero no es JSON. Extiende `SyntaxError` porque las
 * fuentes ya tratan «no es JSON» como un desafío anti-bot.
 */
export class ErrorParseo extends SyntaxError {
  /**
   * @param {string} url
   * @param {string} cuerpo
   * @param {{cause?: unknown}} [contexto]
   */
  constructor(url, cuerpo, { cause } = {}) {
    const muestra = muestraDeCuerpo(cuerpo);
    super(`Respuesta no es JSON en ${dominioDe(url)}: «${muestra}»`, conCausa(cause));
    this.name = 'ErrorParseo';
    this.url = url;
    this.dominio = dominioDe(url);
    this.cuerpo = muestra;
  }
}

// El principio del cuerpo, en una línea y sin correos: sirve para distinguir un
// desafío anti-bot de un cambio de formato, no para guardar datos de nadie.
function muestraDeCuerpo(cuerpo) {
  return String(cuerpo ?? '')
    .replace(/[^\s@]+@[^\s@]+\.\w+/g, '(correo)')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MUESTRA_CUERPO);
}

// ---------------------------------------------------------------- métricas

/** dominio → {peticiones, errores, reintentos, tiempoTotalMs} */
const metricas = new Map();

function acumulador(dominio) {
  let dato = metricas.get(dominio);
  if (!dato) {
    dato = { peticiones: 0, errores: 0, reintentos: 0, tiempoTotalMs: 0 };
    metricas.set(dominio, dato);
  }
  return dato;
}

function anotarIntento(dominio, duracionMs, correcto) {
  const dato = acumulador(dominio);
  dato.peticiones += 1;
  dato.tiempoTotalMs += duracionMs;
  if (!correcto) dato.errores += 1;
}

/**
 * Resumen por dominio de lo que va de ejecución. `peticiones` cuenta cada intento
 * (los reintentos incluidos) y `tiempoMedioMs` es lo que tarda un intento de media.
 * @returns {Record<string, {peticiones: number, errores: number, reintentos: number, tiempoMedioMs: number}>}
 */
export function metricasHttp() {
  const resumen = {};
  for (const [dominio, { peticiones, errores, reintentos, tiempoTotalMs }] of metricas) {
    resumen[dominio] = {
      peticiones,
      errores,
      reintentos,
      tiempoMedioMs: peticiones ? Math.round(tiempoTotalMs / peticiones) : 0,
    };
  }
  return resumen;
}

export function reiniciarMetricas() {
  metricas.clear();
}

// ---------------------------------------------------------------- esperas

export const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// «Retry-After» en segundos o como fecha HTTP, recortado al tope. Ilegible → null.
function esperaPedida(cabecera, ahoraMs) {
  const texto = String(cabecera ?? '').trim();
  if (!texto) return null;
  const segundos = Number(texto);
  const ms = Number.isFinite(segundos) ? segundos * 1000 : Date.parse(texto) - ahoraMs;
  if (!Number.isFinite(ms)) return null;
  return Math.min(Math.max(Math.round(ms), 0), ESPERA_MAXIMA_MS);
}

// 1 s, 3 s, 9 s… con ±20 % para no sincronizar todas las fuentes entre sí.
function esperaCreciente(intento) {
  const base = Math.min(1000 * 3 ** intento, ESPERA_MAXIMA_MS);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

const esReintentable = (error) => !(error instanceof ErrorHttp) || REINTENTABLES.has(error.estado);

const enSegundos = (ms) => `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0).replace('.', ',')} s`;

const motivoDe = (error) =>
  error instanceof ErrorHttp ? `HTTP ${error.estado}` : MOTIVOS_RED[error.motivo].toLowerCase();

function avisarReintento(log, { etiqueta, error, intento, reintentos, esperaMs }) {
  if (!log) return;
  const prefijo = etiqueta ? `${etiqueta}: ` : '';
  log(`${prefijo}reintento ${intento + 1}/${reintentos} tras ${motivoDe(error)}, esperando ${enSegundos(esperaMs)}`);
}

// ---------------------------------------------------------------- peticiones

const pedir = (url, { cabeceras, timeoutMs }) =>
  fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-ES,es;q=0.9', ...cabeceras },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });

function errorDeRespuesta(respuesta, url, contexto) {
  const error = new ErrorHttp(respuesta.status, url, contexto);
  if (CON_RETRY_AFTER.has(respuesta.status)) {
    error.esperaSugeridaMs = esperaPedida(respuesta.headers.get('retry-after'), Date.now());
  }
  return error;
}

// Todo lo que sale de `fetch` acaba siendo un ErrorHttp o un ErrorRed con contexto.
function comoErrorPropio(causa, url, contexto) {
  if (causa instanceof ErrorHttp) return causa;
  const motivo = ABORTOS.has(causa?.name) ? 'timeout' : 'red';
  return new ErrorRed(url, { ...contexto, motivo, cause: causa });
}

/**
 * Descarga una URL como texto.
 * @param {string} url
 * @param {{cabeceras?: Record<string,string>, timeoutMs?: number, reintentos?: number,
 *          etiqueta?: string|null, log?: ((mensaje: string) => void)|null,
 *          dormir?: (ms: number) => Promise<void>}} [opciones]
 *   `etiqueta` identifica a quien pide (la fuente) en los avisos de `log`;
 *   `dormir` solo se sustituye en los tests.
 */
export async function obtenerTexto(url, opciones = {}) {
  const {
    cabeceras = {}, timeoutMs = 20_000, reintentos = 2,
    etiqueta = null, log = null, dormir = esperar,
  } = opciones;
  const dominio = dominioDe(url);

  for (let intento = 0; ; intento++) {
    const inicio = Date.now();
    try {
      const respuesta = await pedir(url, { cabeceras, timeoutMs });
      if (!respuesta.ok) {
        throw errorDeRespuesta(respuesta, url, { intento, duracionMs: Date.now() - inicio });
      }
      const texto = await respuesta.text();
      anotarIntento(dominio, Date.now() - inicio, true);
      return texto;
    } catch (causa) {
      const error = comoErrorPropio(causa, url, { intento, duracionMs: Date.now() - inicio });
      anotarIntento(dominio, error.duracionMs, false);
      if (!esReintentable(error) || intento >= reintentos) throw error;
      const esperaMs = error.esperaSugeridaMs ?? esperaCreciente(intento);
      avisarReintento(log, { etiqueta, error, intento, reintentos, esperaMs });
      acumulador(dominio).reintentos += 1;
      await dormir(esperaMs);
    }
  }
}

/** Descarga una URL y la interpreta como JSON. Si no lo es, lanza `ErrorParseo`. */
export async function obtenerJson(url, opciones = {}) {
  const texto = await obtenerTexto(url, {
    ...opciones,
    cabeceras: { Accept: 'application/json', ...opciones.cabeceras },
  });
  try {
    return JSON.parse(texto);
  } catch (error) {
    throw new ErrorParseo(url, texto, { cause: error });
  }
}

/** Cliente con opciones fijas (p. ej. la `etiqueta` y el `log` de una fuente). */
export function crearClienteHttp(defectos = {}) {
  return {
    texto: (url, opciones = {}) => obtenerTexto(url, { ...defectos, ...opciones }),
    json: (url, opciones = {}) => obtenerJson(url, { ...defectos, ...opciones }),
    esperar,
  };
}

/** Cliente que reciben las fuentes en `ctx.http` (en los tests se sustituye por uno falso). */
export const clienteHttp = { texto: obtenerTexto, json: obtenerJson, esperar };
