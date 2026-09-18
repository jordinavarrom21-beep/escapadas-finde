/**
 * Puntuación 0–100 de cada oferta y detección de «chollazos». Los pesos están
 * aquí arriba para ajustarlos con facilidad.
 */

const PESO_PRECIO = 45;        // lo barata que es frente a ofertas comparables
const PESO_BAJADA = 15;        // mínimo histórico o bajada reciente
const PESO_DESCUENTO = 10;     // descuento o precio tachado de la propia web
const PESO_NOVEDAD = 10;       // recién aparecida
const PESO_SENALES = 10;       // top chollo, error de tarifa, popularidad en Chollometro
const PESO_COMODIDAD = 5;      // horario ideal o poco rato en coche
const PESO_FECHAS = 5;         // cae en un puente o en el finde que viene
const TOPE_SIN_PRECIO = 50;

const HORA_MS = 60 * 60 * 1000;

/** Precio por persona y noche cuando se puede deducir; si no, null. */
export function precioPorPersonaNoche(oferta) {
  const { precio, unidad, noches } = oferta;
  if (precio == null || oferta.tipo === 'vuelo') return null;
  if (unidad === 'pp/noche') return precio;
  if (unidad === 'noche') return precio / 2;
  if (unidad === 'pp' && noches) return precio / noches;
  if (unidad === 'total' && noches) return precio / 2 / noches;
  return null;
}

// Grupo de comparación y valor comparable (más bajo = mejor).
function comparable(oferta) {
  if (oferta.precio == null) return null;
  if (oferta.tipo === 'vuelo') return { grupo: oferta.unidad === 'i/v' ? 'vuelo-iv' : 'vuelo', valor: oferta.precio };
  const porNoche = precioPorPersonaNoche(oferta);
  return porNoche == null ? { grupo: 'otros', valor: oferta.precio } : { grupo: 'noche', valor: porNoche };
}

function puntosPorPrecio(ofertas) {
  const grupos = new Map();
  for (const oferta of ofertas) {
    const c = comparable(oferta);
    if (!c) continue;
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
    grupos.get(c.grupo).push({ oferta, valor: c.valor });
  }
  const puntos = new Map();
  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.valor - b.valor);
    lista.forEach(({ oferta, valor }) => {
      // Empates: se usa la primera posición del valor para no penalizar a nadie.
      const posicion = lista.findIndex((x) => x.valor === valor);
      puntos.set(oferta, lista.length === 1 ? PESO_PRECIO / 2 : PESO_PRECIO * (1 - posicion / (lista.length - 1)));
    });
  }
  return puntos;
}

function puntosBajada(oferta) {
  if (oferta.minimoHistorico) return PESO_BAJADA;
  if (!oferta.bajada || !oferta.precio) return 0;
  return Math.min(PESO_BAJADA, (oferta.bajada / (oferta.precio + oferta.bajada)) * 100 * 0.5);
}

function puntosDescuento(oferta) {
  const porcentaje = oferta.descuento ??
    (oferta.precioAnterior > oferta.precio ? ((oferta.precioAnterior - oferta.precio) / oferta.precioAnterior) * 100 : 0);
  return Math.min(PESO_DESCUENTO, porcentaje / 5);
}

function puntosNovedad(oferta, ahora) {
  if (!oferta.vistaPrimera) return 0;
  const horas = (ahora - Date.parse(oferta.vistaPrimera)) / HORA_MS;
  return horas <= 24 ? PESO_NOVEDAD : horas <= 72 ? PESO_NOVEDAD / 2 : 0;
}

function puntosSenales(oferta) {
  const temperatura = Number(oferta.etiquetas.find((e) => e.startsWith('temperatura:'))?.slice(12) ?? 0);
  let puntos = 0;
  if (oferta.etiquetas.includes('error-tarifa')) puntos += PESO_SENALES;
  if (oferta.etiquetas.includes('top-chollo')) puntos += PESO_SENALES / 2;
  if (temperatura >= 300) puntos += PESO_SENALES;
  else if (temperatura >= 100) puntos += PESO_SENALES / 2;
  return Math.min(PESO_SENALES, puntos);
}

function puntosComodidad(oferta) {
  if (oferta.vuelo?.horarioIdeal) return PESO_COMODIDAD;
  if (oferta.cocheMin == null) return 0;
  return oferta.cocheMin <= 120 ? PESO_COMODIDAD : oferta.cocheMin <= 180 ? PESO_COMODIDAD / 2 : 0;
}

function puntosFechas(oferta, findeActual) {
  return oferta.fechas.puenteId || (findeActual && oferta.fechas.findeId === findeActual) ? PESO_FECHAS : 0;
}

/**
 * Asigna `puntuacion` (0–100) y `chollazo` a todas las ofertas.
 * @param {import('../modelo.js').Oferta[]} ofertas
 * @param {object} ajustes
 * @param {{ahora?: Date, findeActual?: string|null}} [opciones]
 */
export function puntuar(ofertas, ajustes, { ahora = new Date(), findeActual = null } = {}) {
  const precio = puntosPorPrecio(ofertas);
  for (const oferta of ofertas) {
    const resto = puntosBajada(oferta) + puntosDescuento(oferta) + puntosNovedad(oferta, ahora) +
      puntosSenales(oferta) + puntosComodidad(oferta) + puntosFechas(oferta, findeActual);
    const total = precio.has(oferta) ? precio.get(oferta) + resto : Math.min(TOPE_SIN_PRECIO, resto);
    oferta.puntuacion = Math.round(Math.max(0, Math.min(100, total)));
    oferta.chollazo = esChollazo(oferta, ajustes);
  }
}

/** true si la oferta merece una alerta inmediata según `ajustes.emails.chollazos`. */
export function esChollazo(oferta, ajustes) {
  const umbrales = ajustes.emails.chollazos;
  if (oferta.etiquetas.includes('error-tarifa') || oferta.puntuacion >= umbrales.puntuacionMin) return true;
  if (oferta.precio == null) return false;
  if (oferta.unidad === 'i/v' && oferta.precio <= umbrales.vueloMax) return true;
  const porNoche = precioPorPersonaNoche(oferta);
  return porNoche != null && porNoche <= umbrales.escapadaNocheMax;
}
