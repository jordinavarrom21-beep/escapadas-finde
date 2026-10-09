/**
 * Puntuación 0–100 de cada oferta y detección de «chollazos». Los pesos están
 * aquí arriba para ajustarlos con facilidad.
 */
import { deWebDeChollos } from '../fuentes/chollos.js';

const PESO_PRECIO = 45;        // lo barata que es frente a ofertas comparables
const PESO_BAJADA = 15;        // mínimo histórico o bajada reciente
const PESO_DESCUENTO = 10;     // descuento o precio tachado de la propia web
const PESO_NOVEDAD = 10;       // recién aparecida
const PESO_SENALES = 10;       // top chollo, error de tarifa, popularidad en Chollometro
const PESO_COMODIDAD = 5;      // horario ideal o poco rato en coche
const PESO_FECHAS = 5;         // cae en un puente o en el finde que viene
const TOPE_SIN_PRECIO = 50;
const PESO_FAVORITO = 10;       // tiene uno de ajustes.preferencias.temasFavoritos
const PESO_VALORACION = 10;     // lo que opinan los clientes (nota y cuántas opiniones)

const HORA_MS = 60 * 60 * 1000;
const normal = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

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

/**
 * Puntos de precio de cada oferta y cuántas de su grupo son más caras (para que el panel
 * pueda decir «más barata que el 85 % de las parecidas»).
 */
function puntosPorPrecio(ofertas) {
  const grupos = new Map();
  for (const oferta of ofertas) {
    const c = comparable(oferta);
    if (!c) continue;
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
    grupos.get(c.grupo).push({ oferta, valor: c.valor });
  }
  const puntos = new Map();
  const comparacion = new Map();
  for (const [grupo, lista] of grupos) {
    lista.sort((a, b) => a.valor - b.valor);
    lista.forEach(({ oferta, valor }) => {
      // Empates: la posición media del empate. Antes era la primera, y 26 free tours gratis
      // salían todos con la nota máxima de precio (y todos con la misma nota).
      const primera = lista.findIndex((x) => x.valor === valor);
      const ultima = lista.findLastIndex((x) => x.valor === valor);
      const posicion = (primera + ultima) / 2;
      puntos.set(oferta, lista.length === 1 ? PESO_PRECIO / 2 : PESO_PRECIO * (1 - posicion / (lista.length - 1)));
      comparacion.set(oferta, { grupo: grupo.startsWith('otros:') ? 'otros' : grupo, parecidas: lista.length - 1, masCaras: lista.length - 1 - ultima });
    });
  }
  return { puntos, comparacion };
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

/**
 * Desde cuándo se conoce la oferta: la primera vez que se vio, o antes si ya tenía precios
 * guardados (su web la retiró y la volvió a publicar) o si el mismo alojamiento ya estaba en
 * otra oferta. Así una ficha no dice «Acaba de aparecer» con un historial desde el 22 sep.
 * Anota `conocidaDesde` (ISO) en cada oferta; el panel la usa para «Recién añadida».
 * @param {object[]} ofertas
 * @param {Record<string, [string, number][]>} historial
 * @param {(oferta: object) => string} claveSerie
 */
export function anotarConocidaDesde(ofertas, historial = {}, claveSerie = (o) => o.id) {
  const claveAlojamiento = (o) => (o.establecimiento ? `${normal(o.establecimiento)}|${normal(o.lugar?.nombre)}` : null);
  const porAlojamiento = new Map();
  for (const o of ofertas) {
    const clave = claveAlojamiento(o);
    if (!clave || !o.vistaPrimera) continue;
    const previa = porAlojamiento.get(clave);
    if (!previa || o.vistaPrimera < previa) porAlojamiento.set(clave, o.vistaPrimera);
  }
  for (const o of ofertas) {
    const candidatas = [o.vistaPrimera, porAlojamiento.get(claveAlojamiento(o))];
    const primerPrecio = historial[claveSerie(o)]?.[0]?.[0];
    if (primerPrecio) candidatas.push(`${primerPrecio}T00:00:00.000Z`);
    o.conocidaDesde = candidatas.filter(Boolean).sort()[0] ?? null;
  }
}

function puntosNovedad(oferta, ahora) {
  const desde = oferta.conocidaDesde ?? oferta.vistaPrimera;
  if (!desde) return 0;
  const horas = (ahora - Date.parse(desde)) / HORA_MS;
  return horas <= 24 ? PESO_NOVEDAD : horas <= 72 ? PESO_NOVEDAD / 2 : 0;
}

function puntosSenales(oferta) {
  const temperatura = Number(oferta.etiquetas.find((e) => e.startsWith('temperatura:'))?.slice(12) ?? 0);
  let puntos = 0;
  if (oferta.etiquetas.includes('error-tarifa')) puntos += PESO_SENALES;
  // El «Top chollo» de una web de chollos es su selección, no un dato de la oferta: no cuenta.
  if (oferta.etiquetas.includes('top-chollo') && !deWebDeChollos(oferta)) puntos += PESO_SENALES / 2;
  if (temperatura >= 300) puntos += PESO_SENALES;
  else if (temperatura >= 100) puntos += PESO_SENALES / 2;
  return Math.min(PESO_SENALES, puntos);
}

/**
 * Las opiniones: de un 6 (nada) a un 9,5 o más (todo), y con más peso cuantas más opiniones
 * la respaldan (un 10 con 1 opinión vale poco; un 9 con 200, casi todo).
 */
export function puntosValoracion(oferta) {
  const { nota, n } = oferta.valoracion ?? {};
  if (!(nota >= 0)) return 0;
  const calidad = Math.max(0, Math.min(1, (nota - 6) / 3.5));
  const confianza = n > 0 ? Math.min(1, Math.log10(n + 1) / 2) : 0.5;
  return PESO_VALORACION * calidad * confianza;
}

function puntosComodidad(oferta) {
  if (oferta.vuelo?.horarioIdeal) return PESO_COMODIDAD;
  if (oferta.cocheMin == null) return 0;
  return oferta.cocheMin <= 120 ? PESO_COMODIDAD : oferta.cocheMin <= 180 ? PESO_COMODIDAD / 2 : 0;
}

/**
 * Cae en un puente o en el finde que viene, con una fecha de salida concreta. Las de fechas
 * flexibles no: valen para cualquier fecha (antes sumaban «Cae en un puente» por una etiqueta).
 */
function puntosFechas(oferta, findeActual) {
  if (!oferta.fechas.salida) return 0;
  return oferta.fechas.puenteId || (findeActual && oferta.fechas.findeId === findeActual) ? PESO_FECHAS : 0;
}

/**
 * Asigna `puntuacion` (0–100) y `chollazo` a todas las ofertas.
 * @param {import('../modelo.js').Oferta[]} ofertas
 * @param {object} ajustes
 * @param {{ahora?: Date, findeActual?: string|null}} [opciones]
 */

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

/** Máximo de cada parte de la nota: el panel dibuja cada motivo sobre su máximo. */
export const MAXIMOS_NOTA = {
  precio: PESO_PRECIO, bajada: PESO_BAJADA, descuento: PESO_DESCUENTO, opiniones: PESO_VALORACION,
  novedad: PESO_NOVEDAD, senales: PESO_SENALES, comodidad: PESO_COMODIDAD, fechas: PESO_FECHAS, favorito: PESO_FAVORITO,
};

const unDecimal = (n) => Math.round(n * 10) / 10;

export function puntuar(ofertas, ajustes, { ahora = new Date(), findeActual = null } = {}) {
  const { puntos: precio, comparacion } = puntosPorPrecio(ofertas);
  const preferencias = ajustes.preferencias ?? {};
  for (const oferta of ofertas) {
    const partes = {
      bajada: puntosBajada(oferta), descuento: puntosDescuento(oferta), opiniones: puntosValoracion(oferta),
      novedad: puntosNovedad(oferta, ahora), senales: puntosSenales(oferta), comodidad: puntosComodidad(oferta),
      fechas: puntosFechas(oferta, findeActual),
    };
    const resto = Object.values(partes).reduce((suma, p) => suma + p, 0);
    const total = precio.has(oferta) ? precio.get(oferta) + resto : Math.min(TOPE_SIN_PRECIO, resto);
    // Preferencias: lo que se quiere evitar va al fondo y nunca avisa como chollazo; los
    // temas favoritos suben un poco.
    const evitada = esEvitada(oferta, preferencias);
    const extra = !evitada && esFavorita(oferta, preferencias) ? PESO_FAVORITO : 0;
    oferta.puntuacion = evitada ? 0 : Math.round(Math.max(0, Math.min(100, total + extra)));
    // De qué sale la nota: puntos de cada parte (sin las que dan 0) y, si hay con qué
    // compararla, cuántas ofertas parecidas son más caras. Sin precio, el resto tiene tope.
    oferta.notaDetalle = evitada ? { evitada: true } : {
      partes: Object.fromEntries(Object.entries({ precio: precio.get(oferta) ?? 0, ...partes, favorito: extra })
        .filter(([, p]) => p > 0.05).map(([clave, p]) => [clave, unDecimal(p)])),
      comparacion: comparacion.get(oferta) ?? null,
      topeSinPrecio: !precio.has(oferta) && resto > TOPE_SIN_PRECIO ? TOPE_SIN_PRECIO : null,
    };
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
    return `Puntuación ${oferta.puntuacion} de 100 (desde ${umbrales.puntuacionMin}): precio frente a ofertas parecidas, bajada, descuento, opiniones, novedad y comodidad`;
  }
  return null;
}

/** true si la oferta merece una alerta inmediata según `ajustes.emails.chollazos`. */
export const esChollazo = (oferta, ajustes) => motivoChollazo(oferta, ajustes) != null;
