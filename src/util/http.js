/**
 * Cliente HTTP común a todas las fuentes: tiempo límite, reintentos con espera
 * creciente y un User-Agent que identifica la aplicación.
 */

const REPO = process.env.GITHUB_REPOSITORY ?? 'escapadas-finde';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  `Chrome/128.0 Safari/537.36 EscapadasFinde/1.0 (+https://github.com/${REPO})`;

/** Códigos de estado que merece la pena reintentar. */
const REINTENTABLES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class ErrorHttp extends Error {
  constructor(estado, url) {
    super(`HTTP ${estado} en ${new URL(url).host}`);
    this.name = 'ErrorHttp';
    this.estado = estado;
    this.url = url;
  }
}

export const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Descarga una URL como texto.
 * @param {string} url
 * @param {{cabeceras?: Record<string,string>, timeoutMs?: number, reintentos?: number}} [opciones]
 */
export async function obtenerTexto(url, { cabeceras = {}, timeoutMs = 20_000, reintentos = 2 } = {}) {
  for (let intento = 0; ; intento++) {
    try {
      const respuesta = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-ES,es;q=0.9', ...cabeceras },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (!respuesta.ok) throw new ErrorHttp(respuesta.status, url);
      return await respuesta.text();
    } catch (error) {
      const reintentable = !(error instanceof ErrorHttp) || REINTENTABLES.has(error.estado);
      if (!reintentable || intento >= reintentos) throw error;
      await esperar(1000 * 3 ** intento);
    }
  }
}

/** Descarga una URL y la interpreta como JSON. */
export async function obtenerJson(url, opciones = {}) {
  const texto = await obtenerTexto(url, {
    ...opciones,
    cabeceras: { Accept: 'application/json', ...opciones.cabeceras },
  });
  return JSON.parse(texto);
}

/** Cliente que reciben las fuentes en `ctx.http` (en los tests se sustituye por uno falso). */
export const clienteHttp = { texto: obtenerTexto, json: obtenerJson, esperar };
