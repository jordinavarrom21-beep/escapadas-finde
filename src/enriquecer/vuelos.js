/**
 * Los «vuelos» sin fecha que publican blogs y comunidades mezclan tres cosas: billetes
 * (ruta y precio), paquetes con hotel («Venecia 3 noches en hotel con vuelos») y
 * promociones sin billete («20 € de descuento en Ryanair»). Aquí se separan y se anota
 * desde dónde salen, que casi nunca es desde el origen de quien mira el panel.
 */
import { normalizarTexto } from '../util/xml.js';

export const ETIQUETA_PROMOCION = 'promocion';
export const PREFIJO_SALIDA = 'sale-de:';

/** Incluye alojamiento: es un paquete, no un billete. «13 días» a secas es la duración del viaje. */
const CON_ALOJAMIENTO = /\b(?:hotel(?:es)?|hostal(?:es)?|alojamiento|apartamentos?|\d+\s*noches?|viajes? combinados?)\b/;
/** Descuentos, códigos, rebajas de una aerolínea o selecciones de «muchos destinos»: no hay un billete concreto. */
const PROMOCION = /\b(?:descuentos?|cupon(?:es)?|codigos?|promocion(?:es)?|rebajas|gratuit[oa]s?|sale|muchos destinos|varios destinos|numerous destinations|seleccion de vuelos|vuelos para las proximas semanas)\b|\bhasta un \d+\s*%/;

const PALABRA_MAYUSCULA = '[A-ZÁÉÍÓÚÑ][\\wáéíóúñ]+(?:\\s(?:de\\s)?[A-ZÁÉÍÓÚÑ][\\wáéíóúñ]+)?';
/** «Salidas desde Málaga, Alicante, Madrid y Barcelona» (hasta el paréntesis, guion o punto). */
const SALIDAS = /\bsalidas?\s+desde\s+([^.()\-–|]+)/i;
/** «desde Madrid y Barcelona» (ciudades con mayúscula; «desde 106 €» o «desde solo 9 €» no). */
const DESDE = new RegExp(`\\b[Dd]esde\\s+(${PALABRA_MAYUSCULA}(?:\\s*(?:,|\\by\\b)\\s*${PALABRA_MAYUSCULA})*)`);
/** «Vuelos Barcelona – Murcia con Volotea». */
const RUTA = new RegExp(`^vuelos?\\s+(${PALABRA_MAYUSCULA})\\s+[–-]\\s+`, 'i');
/** Fly4free: «flights from Madrid & London to…», «from many European cities», «Flights from Madrid from €476». */
const FROM = /\bfrom\s+(many European cities|European cities|Spain|[A-Z][\w]+(?:\s*(?:&|and|,)\s*[A-Z][\w]+)*)\s+(?:to|from)\b/;
const EN_ESPANOL = { 'many european cities': 'varias ciudades europeas', 'european cities': 'varias ciudades europeas', spain: 'España', london: 'Londres' };

const trocear = (texto) => texto.split(/\s*(?:,|\by\b|&|\band\b)\s*/).map((parte) => parte.trim()).filter((parte) => /^[A-ZÁÉÍÓÚÑ]/.test(parte));
const traducir = (nombre) => EN_ESPANOL[nombre.toLowerCase()] ?? nombre;

/** Ciudades (o zonas) de salida que publica el título. */
export function salidasDe(titulo = '') {
  const salidas = titulo.match(SALIDAS)?.[1];
  if (salidas) return trocear(salidas);
  const from = titulo.match(FROM)?.[1];
  if (from) return /european cities/i.test(from) ? [traducir(from)] : trocear(from).map(traducir);
  const ruta = titulo.match(RUTA)?.[1];
  if (ruta) return [ruta];
  const desde = titulo.match(DESDE)?.[1];
  return desde ? trocear(desde) : [];
}

/**
 * Para un vuelo sin fecha: lo pasa a `paquete` si incluye alojamiento, lo etiqueta
 * «promocion» si no es un billete y anota `sale-de:<ciudad>`. Idempotente.
 * @param {import('../modelo.js').Oferta} oferta
 */
export function clasificarVueloSinFecha(oferta) {
  if (oferta.vuelo || !['vuelo', 'paquete'].includes(oferta.tipo)) return oferta;
  const titulo = normalizarTexto(oferta.titulo);
  const etiquetas = oferta.etiquetas.filter((e) => e !== ETIQUETA_PROMOCION && !e.startsWith(PREFIJO_SALIDA));
  if (oferta.tipo === 'vuelo' && CON_ALOJAMIENTO.test(titulo)) {
    oferta.tipo = 'paquete';
    oferta.transporte ??= 'avion';
  }
  if (oferta.tipo === 'vuelo' && PROMOCION.test(titulo)) etiquetas.push(ETIQUETA_PROMOCION);
  const conAvion = oferta.tipo === 'vuelo' || oferta.transporte === 'avion';
  if (conAvion) {
    // «incluye los vuelos ida y vuelta desde Barcelona» suele ir en la descripción.
    const salidas = salidasDe(oferta.titulo);
    etiquetas.push(...(salidas.length ? salidas : salidasDe(oferta.descripcion)).map((ciudad) => `${PREFIJO_SALIDA}${ciudad}`));
  }
  oferta.etiquetas = etiquetas;
  return oferta;
}
