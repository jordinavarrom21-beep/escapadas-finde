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
const PESO_FAVORITO = 10;       // tiene uno de ajustes.preferencias.temasFavoritos

const HORA_MS = 60 * 60 * 1000;

/**
 * Precio por persona y noche cuando se puede deducir; si no, null. Los precios por
 * alojamiento («noche») y los totales se reparten entre `personas` (ajustes.viajeros).
 */
export function precioPorPersonaNoche(oferta, personas = 2) {
  const { precio, unidad, noches } = oferta;
  if (precio == null || oferta.tipo === 'vuelo') return null;
  if (unidad === 'pp/noche') return precio;
  if (unidad === 'noche') return precio / personas;
  if (unidad === 'pp' && noches) return precio / noches;
  if (unidad === 'total' && noches) return precio / personas / noches;
  return null;
}

/** El que ya calculó el escaneo con los viajeros de los ajustes, o el de 2 personas. */
const porNocheDe = (oferta) => oferta.precioNoche ?? precioPorPersonaNoche(oferta);

// Grupo de comparación y valor comparable (más bajo = mejor).
function comparable(oferta) {
  if (oferta.precio == null) return null;
  if (oferta.tipo === 'vuelo') return { grupo: oferta.unidad === 'i/v' ? 'vuelo-iv' : 'vuelo', valor: oferta.precio };
  const porNoche = porNocheDe(oferta);
  // Sin precio por noche, cada tipo y unidad por su lado: una entrada de 5 € no compite
  // con un paquete de 7 noches.
  return porNoche == null ? { grupo: `otros:${oferta.tipo}:${oferta.unidad ?? '-'}`, valor: oferta.precio } : { grupo: 'noche', valor: porNoche };
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
const normal = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * ¿La oferta es de algo que `ajustes.preferencias` pide evitar? Un tema de `evitarTemas`
 * o un destino de `evitarDestinos` (nombre, región, provincia o país del lugar).
 */
export function esEvitada(oferta, preferencias = {}) {
  const temas = (preferencias.evitarTemas ?? []).map(normal);
  const destinos = (preferencias.evitarDestinos ?? []).map(normal).filter(Boolean);
  if (oferta.temas.some((tema) => temas.includes(normal(tema)))) return true;
  const lugar = oferta.lugar ?? {};
  const sitios = [lugar.nombre, lugar.region, lugar.provincia, lugar.comunidad, lugar.pais].map(normal).filter(Boolean);
  return destinos.some((destino) => sitios.includes(destino));
}

/** Tiene alguno de los temas favoritos de `ajustes.preferencias`. */
const esFavorita = (oferta, preferencias = {}) => {
  const favoritos = (preferencias.temasFavoritos ?? []).map(normal);
  return favoritos.length > 0 && oferta.temas.some((tema) => favoritos.includes(normal(tema)));
};

export function puntuar(ofertas, ajustes, { ahora = new Date(), findeActual = null } = {}) {
  const precio = puntosPorPrecio(ofertas);
  const preferencias = ajustes.preferencias ?? {};
  for (const oferta of ofertas) {
    const resto = puntosBajada(oferta) + puntosDescuento(oferta) + puntosNovedad(oferta, ahora) +
      puntosSenales(oferta) + puntosComodidad(oferta) + puntosFechas(oferta, findeActual);
    const total = precio.has(oferta) ? precio.get(oferta) + resto : Math.min(TOPE_SIN_PRECIO, resto);
    // Preferencias: lo que se quiere evitar va al fondo y nunca avisa como chollazo; los
    // temas favoritos suben un poco.
    const evitada = esEvitada(oferta, preferencias);
    const extra = !evitada && esFavorita(oferta, preferencias) ? PESO_FAVORITO : 0;
    oferta.puntuacion = evitada ? 0 : Math.round(Math.max(0, Math.min(100, total + extra)));
    oferta.chollazoMotivo = evitada ? null : motivoChollazo(oferta, ajustes);
    oferta.chollazo = oferta.chollazoMotivo != null;
  }
}

const importe = (valor) => valor.toLocaleString('es-ES', { maximumFractionDigits: 2 });

/**
 * Por qué es un chollazo, en una frase que cualquiera puede comprobar con los datos de
 * la tarjeta y `ajustes.emails.chollazos`, o null si no lo es.
 */
export function motivoChollazo(oferta, ajustes) {
  const umbrales = ajustes.emails.chollazos;
  if (oferta.etiquetas.includes('error-tarifa')) return 'La web lo publica como error de tarifa';
  if (oferta.precio != null && oferta.unidad === 'i/v' && oferta.precio <= umbrales.vueloMax) {
    return `Vuelo de ida y vuelta por ${importe(oferta.precio)} €: el límite es ${importe(umbrales.vueloMax)} €`;
  }
  const porNoche = oferta.precio == null ? null : porNocheDe(oferta);
  if (porNoche != null && porNoche <= umbrales.escapadaNocheMax) {
    // «noche» y «total» son por alojamiento: el reparto entre viajeros es una suposición.
    const reparto = ['noche', 'total'].includes(oferta.unidad) ? ` (repartiendo entre ${ajustes.viajeros ?? 2} personas)` : '';
    return `${importe(Math.round(porNoche * 100) / 100)} € por persona y noche${reparto}: el límite es ${importe(umbrales.escapadaNocheMax)} €`;
  }
  if (oferta.puntuacion >= umbrales.puntuacionMin) {
    return `Puntuación ${oferta.puntuacion} de 100 (desde ${umbrales.puntuacionMin}): precio frente a ofertas parecidas, bajada, descuento, novedad y comodidad`;
  }
  return null;
}

/** true si la oferta merece una alerta inmediata según `ajustes.emails.chollazos`. */
export const esChollazo = (oferta, ajustes) => motivoChollazo(oferta, ajustes) != null;
