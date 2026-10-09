/**
 * Apify (apify.com): ejecuta un «Actor» de su tienda y devuelve lo que ha sacado. Lo usan la
 * fuente de Google Flights y los enriquecedores de Google Maps y Google Hoteles.
 *
 * Es de pago por resultado, así que el gasto está acotado por tres lados:
 *  - cada ejecución lleva `maxTotalChargeUsd` (Apify la corta si llega a ese importe);
 *  - el gasto estimado del mes se apunta en la caché (`apify:gasto:AAAA-MM`) y no se lanza
 *    nada que pueda pasar de `ajustes.apify.presupuestoMensualUsd`;
 *  - cada enriquecedor tiene además su tope diario (`apify:dia:<actor>:AAAA-MM-DD`).
 * Sin el secreto APIFY_TOKEN no se ejecuta nada. El token va en una cabecera, nunca en la URL
 * (las URLs salen en los errores, en el registro y en las muestras de data/muestras/).
 */
import { fechaLocal } from './fechas.js';

const API = 'https://api.apify.com/v2';
/** Lo que espera Apify a que acabe el Actor (s); la petición espera un poco más. */
const TIMEOUT_ACTOR_S = 120;
const TIMEOUT_PETICION_MS = (TIMEOUT_ACTOR_S + 30) * 1000;
const PRESUPUESTO_POR_DEFECTO = 4.5;
const CUARENTA_DIAS_MS = 40 * 24 * 60 * 60 * 1000;
const DOS_DIAS_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Actores que se usan y lo que cobra cada uno (plan gratuito de Apify, octubre de 2026):
 * `usdPorResultado` por cada fila que devuelve y `usdPorEjecucion` fijo por arrancarlo.
 * Sirven para estimar el gasto; el tope real de cada ejecución es `maxTotalChargeUsd`.
 */
export const ACTORES = {
  googleFlights: { id: 'lergassy~google-flights-scraper', nombre: 'Google Flights', usdPorResultado: 0.0002, usdPorEjecucion: 0.00005 },
  googleMaps: { id: 'compass~crawler-google-places', nombre: 'Google Maps', usdPorResultado: 0.004, usdPorEjecucion: 0.00005 },
  googleHoteles: { id: 'vittuhy~google-travel-hotel-prices', nombre: 'Google Hoteles', usdPorResultado: 0.001, usdPorEjecucion: 0.005 },
};

/** URL con la que se ejecuta un actor y se reciben sus resultados en la misma petición. */
export function urlEjecucion(clave, maxUsd) {
  const actor = ACTORES[clave];
  if (!actor) throw new Error(`Actor de Apify desconocido: ${clave}`);
  const parametros = new URLSearchParams({ timeout: String(TIMEOUT_ACTOR_S), clean: 'true' });
  if (maxUsd != null) parametros.set('maxTotalChargeUsd', String(maxUsd));
  return `${API}/acts/${actor.id}/run-sync-get-dataset-items?${parametros}`;
}

/** No se lanza: pasaría del presupuesto del mes o del tope del día. No es un fallo de nadie. */
export class ErrorPresupuesto extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorPresupuesto';
  }
}

const claveMes = (ahora) => `apify:gasto:${fechaLocal(ahora).slice(0, 7)}`;
const claveDia = (clave, ahora) => `apify:dia:${clave}:${fechaLocal(ahora)}`;
const redondear = (usd) => Math.round(usd * 100_000) / 100_000;

/** Gasto estimado de este mes: `{usd, ejecuciones}`. */
export function gastoDelMes(cache, ahora) {
  return cache.obtener(claveMes(ahora), CUARENTA_DIAS_MS, ahora.getTime()) ?? { usd: 0, ejecuciones: 0 };
}

/** Cuántas consultas lleva hoy un enriquecedor (para su tope diario). */
export function consultasDeHoy(cache, clave, ahora) {
  return cache.obtener(claveDia(clave, ahora), DOS_DIAS_MS, ahora.getTime()) ?? 0;
}

export function anotarConsultas(cache, clave, ahora, n) {
  cache.guardar(claveDia(clave, ahora), consultasDeHoy(cache, clave, ahora) + n, ahora.getTime());
}

function anotarGasto(cache, ahora, usd) {
  const actual = gastoDelMes(cache, ahora);
  cache.guardar(claveMes(ahora), { usd: redondear(actual.usd + usd), ejecuciones: actual.ejecuciones + 1 }, ahora.getTime());
}

/** Presupuesto del mes en dólares (`ajustes.apify.presupuestoMensualUsd`). */
export const presupuestoMensual = (ajustes) => ajustes.apify?.presupuestoMensualUsd ?? PRESUPUESTO_POR_DEFECTO;

/** Lo que costaría una ejecución que devuelve `filas` resultados, sin pasar del tope. */
export function costeEstimado(clave, filas, maxUsd = Infinity) {
  const { usdPorResultado, usdPorEjecucion } = ACTORES[clave];
  return Math.min(maxUsd, redondear(usdPorEjecucion + filas * usdPorResultado));
}

/**
 * Ejecuta un actor con `entrada` y devuelve sus resultados (array). Lanza `ErrorPresupuesto`
 * si no queda presupuesto para gastar hasta `maxUsd`. Sin reintentos: repetir la petición
 * lanzaría (y cobraría) otra ejecución. Si la petición falla, se apunta `maxUsd` como gastado,
 * porque el actor puede haber trabajado igual.
 * @param {{ajustes: object, cache: import('../cache.js').Cache, env: object, http: object, ahora: Date}} ctx
 * @param {keyof typeof ACTORES} clave
 * @param {object} entrada
 * @param {{maxUsd: number}} opciones
 */
export async function ejecutarActor(ctx, clave, entrada, { maxUsd }) {
  const token = ctx.env.APIFY_TOKEN;
  if (!token) throw new Error('Falta configurar el secreto APIFY_TOKEN');
  const presupuesto = presupuestoMensual(ctx.ajustes);
  const gastado = gastoDelMes(ctx.cache, ctx.ahora).usd;
  if (gastado + maxUsd > presupuesto) {
    throw new ErrorPresupuesto(`Presupuesto de Apify del mes agotado (${gastado.toFixed(2)} de ${presupuesto} $): no se consulta ${ACTORES[clave].nombre} hasta el mes que viene`);
  }
  let filas;
  try {
    filas = await ctx.http.json(urlEjecucion(clave, maxUsd), {
      cuerpo: entrada,
      cabeceras: { Authorization: `Bearer ${token}` },
      timeoutMs: TIMEOUT_PETICION_MS,
      reintentos: 0,
    });
  } catch (error) {
    anotarGasto(ctx.cache, ctx.ahora, maxUsd);
    if (error.estado === 401) throw new Error('Apify no acepta el token: revisa el secreto APIFY_TOKEN', { cause: error });
    if (error.estado === 402) throw new ErrorPresupuesto('Apify dice que no queda saldo en la cuenta este mes');
    throw error;
  }
  if (!Array.isArray(filas)) {
    anotarGasto(ctx.cache, ctx.ahora, maxUsd);
    throw new Error(`Respuesta inesperada de Apify (${ACTORES[clave].nombre}): no es una lista de resultados`);
  }
  anotarGasto(ctx.cache, ctx.ahora, costeEstimado(clave, filas.length, maxUsd));
  return filas;
}
