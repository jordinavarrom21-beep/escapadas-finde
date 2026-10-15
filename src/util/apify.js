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
 * `minimoUsd`: el tope más bajo que acepta el actor. Google Maps rechaza con un 400 cualquier
 * `maxTotalChargeUsd` por debajo de 0,50 $ («max-total-charge-usd-below-minimum», 15/10/2026),
 * aunque lo que gasta de verdad con 1 sitio por búsqueda son céntimos.
 */
export const ACTORES = {
  googleFlights: { id: 'lergassy~google-flights-scraper', nombre: 'Google Flights', usdPorResultado: 0.0002, usdPorEjecucion: 0.00005 },
  googleMaps: { id: 'compass~crawler-google-places', nombre: 'Google Maps', usdPorResultado: 0.004, usdPorEjecucion: 0.00005, minimoUsd: 0.5 },
  googleHoteles: { id: 'vittuhy~google-travel-hotel-prices', nombre: 'Google Hoteles', usdPorResultado: 0.001, usdPorEjecucion: 0.005 },
};

/** Tope de una ejecución en céntimos, redondeado hacia arriba (0,03005 → 0,04; no 0.026049999999999997). */
export const topeEnCentimos = (usd) => Math.max(0.01, Math.ceil(Math.round(usd * 1e6) / 1e4) / 100);

/** URL con la que se ejecuta un actor y se reciben sus resultados en la misma petición. */
export function urlEjecucion(clave, maxUsd) {
  const actor = ACTORES[clave];
  if (!actor) throw new Error(`Actor de Apify desconocido: ${clave}`);
  const parametros = new URLSearchParams({ timeout: String(TIMEOUT_ACTOR_S), clean: 'true' });
  if (maxUsd != null) parametros.set('maxTotalChargeUsd', topeEnCentimos(maxUsd).toFixed(2));
  return `${API}/acts/${actor.id}/run-sync-get-dataset-items?${parametros}`;
}

/** Lo que dice Apify al rechazar una petición: `{"error": {"type", "message"}}` → «tipo: mensaje». */
export function motivoApify(cuerpo) {
  const tipo = /"type"\s*:\s*"([^"]+)"/.exec(cuerpo ?? '')?.[1];
  const mensaje = /"message"\s*:\s*"([^"]*)/.exec(cuerpo ?? '')?.[1];
  return [tipo, mensaje].filter(Boolean).join(': ');
}

/**
 * El actor arrancó y acabó en error (`run-failed`): la petición estaba bien, pero el actor no
 * pudo con esa entrada (p. ej. Google Hoteles no encuentra el hotel). Repetirla daría lo mismo.
 */
export const ejecucionFallida = (error) => /"type"\s*:\s*"run-failed"/.test(error?.cuerpo ?? '');

/**
 * Apify rechazó la petición antes de arrancar el actor (entrada o tope no válidos): no ha
 * cobrado nada. Cualquier otro fallo puede haber gastado algo.
 */
const RECHAZOS_SIN_EJECUCION = new Set(['invalid-input', 'max-total-charge-usd-below-minimum']);
export const sinEjecucion = (error) => error?.estado === 400
  && RECHAZOS_SIN_EJECUCION.has(/"type"\s*:\s*"([^"]+)"/.exec(error?.cuerpo ?? '')?.[1]);

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
 * si no queda presupuesto para gastar hasta el tope de la ejecución (`maxUsd`, o el mínimo del
 * actor si es mayor). Sin reintentos: repetir la petición lanzaría (y cobraría) otra ejecución.
 * Si la petición falla, se apunta como gastado lo que pidió quien llama (`maxUsd`, su estimación
 * de lo peor), porque el actor puede haber trabajado igual; si Apify la rechazó sin arrancar
 * nada, no se apunta nada.
 * @param {{ajustes: object, cache: import('../cache.js').Cache, env: object, http: object, ahora: Date}} ctx
 * @param {keyof typeof ACTORES} clave
 * @param {object} entrada
 * @param {{maxUsd: number}} opciones
 */
export async function ejecutarActor(ctx, clave, entrada, { maxUsd: pedido }) {
  const token = ctx.env.APIFY_TOKEN;
  if (!token) throw new Error('Falta configurar el secreto APIFY_TOKEN');
  // El tope que se manda (en céntimos y no por debajo del mínimo del actor) es el que cuenta
  // para saber si queda presupuesto.
  const maxUsd = Math.max(topeEnCentimos(pedido), ACTORES[clave].minimoUsd ?? 0);
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
    if (!sinEjecucion(error)) anotarGasto(ctx.cache, ctx.ahora, topeEnCentimos(pedido));
    if (error.estado === 401) throw new Error('Apify no acepta el token: revisa el secreto APIFY_TOKEN', { cause: error });
    if (error.estado === 402) throw new ErrorPresupuesto('Apify dice que no queda saldo en la cuenta este mes');
    // El motivo que da Apify, para el registro («HTTP 400 en api.apify.com» solo no decía nada).
    const motivo = motivoApify(error.cuerpo);
    if (motivo) error.message = `${error.message} (${motivo})`;
    throw error;
  }
  if (!Array.isArray(filas)) {
    anotarGasto(ctx.cache, ctx.ahora, topeEnCentimos(pedido));
    throw new Error(`Respuesta inesperada de Apify (${ACTORES[clave].nombre}): no es una lista de resultados`);
  }
  anotarGasto(ctx.cache, ctx.ahora, costeEstimado(clave, filas.length, maxUsd));
  return filas;
}
