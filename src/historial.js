/**
 * Historial de precios por oferta (data/historial.json):
 * { "<ofertaId>": [["YYYY-MM-DD", precioMinimoDelDia], ...] }, con los días en
 * hora de Madrid y cada serie ordenada por fecha.
 */
import { fechaLocal, sumarDias } from './util/fechas.js';

/** Días anteriores en los que se busca el precio máximo para calcular la bajada. */
const DIAS_BAJADA = 7;
/** Bajada mínima en euros para tenerla en cuenta (evita el ruido de céntimos). */
const BAJADA_MINIMA = 1;
/** Días que se conserva la serie de una oferta que ya no existe. */
const DIAS_CONSERVAR_DESAPARECIDAS = 30;
/**
 * Historial mínimo para llamar a algo «mínimo histórico»: precios de al menos 3 días
 * distintos y el primero de hace una semana o más. Con dos días, cualquier bajada lo sería.
 */
const DIAS_MINIMOS_HISTORICO = 7;
const PUNTOS_MINIMOS_HISTORICO = 3;
/** Puntos necesarios para que una serie merezca dibujarse en el panel. */
const PUNTOS_MINIMOS_PANEL = 2;

const esPrecio = (valor) => typeof valor === 'number' && Number.isFinite(valor);
const redondear = (valor) => Math.round(valor * 100) / 100;
const porFecha = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

function anotarPrecio(serie, dia, precio) {
  const previo = serie.find(([fecha]) => fecha === dia)?.[1];
  const minimo = previo === undefined ? precio : Math.min(previo, precio);
  return [...serie.filter(([fecha]) => fecha !== dia), [dia, minimo]].sort(porFecha);
}

function calcularBajada(anteriores, hoy, precio) {
  const desde = sumarDias(hoy, -DIAS_BAJADA);
  const recientes = anteriores.filter(([fecha]) => fecha >= desde);
  if (!recientes.length) return null;
  const bajada = redondear(Math.max(...recientes.map(([, valor]) => valor)) - precio);
  return bajada >= BAJADA_MINIMA ? bajada : null;
}

/**
 * El precio de hoy es el más bajo de su serie Y alguna vez ha estado más alto: un
 * precio que nunca ha cambiado no es un mínimo histórico (lo sería el 90 % de todo).
 * Además hace falta historial suficiente (DIAS_MINIMOS_HISTORICO y PUNTOS_MINIMOS_HISTORICO).
 */
function esMinimoHistorico(anteriores, precio, hoy) {
  const suficiente = anteriores.length >= PUNTOS_MINIMOS_HISTORICO && anteriores[0][0] <= sumarDias(hoy, -DIAS_MINIMOS_HISTORICO);
  return suficiente && anteriores.some(([, valor]) => valor > precio) && anteriores.every(([, valor]) => precio <= valor);
}

/**
 * Alojamientos por noche y estancias con fechas cerradas y precio total (Holidu y
 * parecidas): cada día la web puede dar otras fechas y otro número de noches, o pasar de
 * «desde X € la noche» a «Y € por 3 noches», así que el total no se puede comparar de un
 * día a otro (60 € por 1 noche y 127 € por 2 no es una subida). Se sigue el precio por
 * noche, en una serie aparte («<id>~noche») para no mezclarlo con totales ya guardados.
 * @param {import('./modelo.js').Oferta} oferta
 */
export const sigueNoche = (oferta) => oferta.unidad === 'noche' || (oferta.unidad === 'total' && oferta.noches > 0 && Boolean(oferta.fechas?.salida));
/** Clave de la serie de la oferta en el historial. */
export const claveSerie = (oferta) => (sigueNoche(oferta) ? `${oferta.id}~noche` : oferta.id);
const valorSerie = (oferta) => (oferta.unidad === 'total' && sigueNoche(oferta) ? redondear(oferta.precio / oferta.noches) : oferta.precio);

/** ¿Se ha leído hoy de su fuente? Una oferta que no se ha vuelto a leer no aporta un precio nuevo. */
const vistaHoy = (oferta, hoy) => !oferta.vistaUltima || fechaLocal(new Date(oferta.vistaUltima)) === hoy;

/**
 * Anota el precio de hoy (el mínimo del día en hora de Madrid) de cada oferta con
 * precio numérico que se haya leído hoy, y rellena `bajada`, `minimoHistorico` e
 * `historialPorNoche` (si la serie y la bajada son por noche: ver `sigueNoche`). Las ofertas sin precio
 * no se registran y quedan con `bajada: null` y `minimoHistorico: false`.
 * Modifica `historial` y las ofertas; devuelve `historial`.
 * @param {Record<string, [string, number][]>} historial
 * @param {import('./modelo.js').Oferta[]} ofertas
 * @param {Date} [ahora]
 */
export function registrarPrecios(historial, ofertas, ahora = new Date()) {
  const hoy = fechaLocal(ahora);
  for (const oferta of ofertas) {
    if (!esPrecio(oferta.precio)) {
      oferta.bajada = null;
      oferta.minimoHistorico = false;
      continue;
    }
    const clave = claveSerie(oferta);
    const valor = valorSerie(oferta);
    const serie = vistaHoy(oferta, hoy) ? anotarPrecio(historial[clave] ?? [], hoy, valor) : historial[clave] ?? [];
    if (serie.length) historial[clave] = serie;
    const anteriores = serie.filter(([fecha]) => fecha < hoy);
    // La bajada y el mínimo, en la misma unidad que la serie (por noche si sigue la noche).
    oferta.bajada = calcularBajada(anteriores, hoy, valor);
    oferta.minimoHistorico = esMinimoHistorico(anteriores, valor, hoy);
    oferta.historialPorNoche = sigueNoche(oferta);
  }
  return historial;
}

/**
 * Quita los puntos de hace más de `maxDias` días, las series que se quedan vacías y,
 * si se pasa `idsVivos`, las de ofertas que no están en él y no tienen precios de
 * los últimos 30 días. Modifica `historial` y lo devuelve.
 * @param {Record<string, [string, number][]>} historial
 * @param {Date} [ahora]
 * @param {{maxDias?: number, idsVivos?: Iterable<string>}} [opciones]
 */
export function compactar(historial, ahora = new Date(), { maxDias = 120, idsVivos } = {}) {
  const hoy = fechaLocal(ahora);
  const limite = sumarDias(hoy, -maxDias);
  const limiteDesaparecidas = sumarDias(hoy, -DIAS_CONSERVAR_DESAPARECIDAS);
  const vivos = idsVivos ? new Set(idsVivos) : null;
  for (const [id, serie] of Object.entries(historial)) {
    const vigente = serie.filter(([fecha]) => fecha >= limite);
    const desaparecida = vivos && !vivos.has(id) && !(vigente.at(-1)?.[0] >= limiteDesaparecidas);
    if (!vigente.length || desaparecida) delete historial[id];
    else historial[id] = vigente;
  }
  return historial;
}

/**
 * Series que se publican en el panel: las de `ids` con al menos dos días de precios
 * (con un solo punto no hay evolución que mostrar).
 * @param {Record<string, [string, number][]>} historial
 * @param {Iterable<string|[string, string]>} ids  ids de oferta, o [id, clave de su serie]
 */
export function seriesPara(historial, ids) {
  const series = {};
  // Cada id puede venir con la clave de su serie ([id, clave]): se publica con el id de la oferta.
  for (const entrada of ids) {
    const [id, clave] = Array.isArray(entrada) ? entrada : [entrada, entrada];
    if (historial[clave]?.length >= PUNTOS_MINIMOS_PANEL) series[id] = historial[clave];
  }
  return series;
}
