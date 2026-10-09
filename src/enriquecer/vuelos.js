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

/** Lo que no es una ciudad aunque vaya con mayúscula detrás de «desde» («SOLO», el nombre de la web…). */
const NO_SON_CIUDADES = new Set(['solo', 'viajerospiratas', 'chollometro', 'skyscanner', 'buscounchollo', 'tripcom', 'trip', 'alojamiento', 'hotel', 'vuelos', 'vuelo']);
/** Salidas que no dicen la ciudad: pueden incluir la tuya. */
const SALIDAS_GENERICAS = new Set(['espana', 'varias ciudades europeas', 'europa', 'varias ciudades']);
/** Aeropuertos habituales y su ciudad (para «sale-de:MAD»). */
const CIUDAD_IATA = {
  bcn: 'Barcelona', gro: 'Girona', reu: 'Reus', mad: 'Madrid', vlc: 'Valencia', agp: 'Málaga', alc: 'Alicante', svq: 'Sevilla',
  bio: 'Bilbao', pmi: 'Palma', zaz: 'Zaragoza', scq: 'Santiago', opo: 'Oporto', lis: 'Lisboa', vit: 'Vitoria',
};

/** «MADRID», «Madrid Alojamiento», «PALMA DE», «MAD» → «Madrid», «Madrid», «Palma», «Madrid». */
export function ciudadDeSalida(texto = '') {
  const palabras = String(texto).trim().split(/\s+/).filter(Boolean);
  const utiles = [];
  for (const palabra of palabras) {
    const clave = normalizarTexto(palabra).replace(/[^a-z]/g, '');
    if (!clave || NO_SON_CIUDADES.has(clave)) break;
    utiles.push(palabra);
  }
  while (utiles.length && /^(?:de|del|la|el)$/i.test(utiles.at(-1))) utiles.pop();
  if (!utiles.length) return null;
  const junto = utiles.join(' ');
  const iata = CIUDAD_IATA[normalizarTexto(junto)];
  if (iata) return iata;
  // «MADRID» → «Madrid» (sin cambiar «San Sebastián» ni «Palma de Mallorca»).
  return junto.replace(/[A-ZÁÉÍÓÚÑ]{2,}/g, (m) => m[0] + m.slice(1).toLowerCase());
}

/**
 * Ciudad desde la que sale la oferta si no es la tuya: si todas sus salidas son otras ciudades
 * (ni el origen ni sus aeropuertos, ni «España» o «varias ciudades», que pueden incluirla).
 * Una oferta «desde Madrid del 13 al 15 de diciembre» no es una escapada desde Barcelona:
 * se saca de las guías y no se le calcula el viaje completo. null si sale de la tuya o no se sabe.
 */
export function otraSalida(oferta, { origen = null, aeropuertos = [] } = {}) {
  const salidas = (oferta.etiquetas ?? []).filter((e) => e.startsWith(PREFIJO_SALIDA)).map((e) => ciudadDeSalida(e.slice(PREFIJO_SALIDA.length))).filter(Boolean);
  if (!salidas.length) return null;
  const mias = new Set([origen?.nombre, ...aeropuertos, ...aeropuertos.map((a) => CIUDAD_IATA[a.toLowerCase()])].filter(Boolean).map((n) => normalizarTexto(n)));
  const claves = salidas.map((s) => normalizarTexto(s));
  if (claves.some((c) => mias.has(c) || SALIDAS_GENERICAS.has(c))) return null;
  return salidas[0];
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
  // Un paquete «con vuelos» va en avión aunque su web no lo diga aparte (el transporte del texto
  // se lee después, en aplicarClasificacion).
  const conAvion = oferta.tipo === 'vuelo' || oferta.transporte === 'avion' || (oferta.tipo === 'paquete' && /\bvuelos?\b/.test(titulo));
  if (conAvion) {
    // «incluye los vuelos ida y vuelta desde Barcelona» suele ir en la descripción.
    const salidas = salidasDe(oferta.titulo);
    // Limpias: «MADRID», «Madrid Alojamiento» o «MAD» son «Madrid»; «SOLO» no es una ciudad.
    const ciudades = (salidas.length ? salidas : salidasDe(oferta.descripcion)).map(ciudadDeSalida).filter(Boolean);
    etiquetas.push(...[...new Set(ciudades)].map((ciudad) => `${PREFIJO_SALIDA}${ciudad}`));
  } else {
    // Si no se pueden leer aquí, las que ya traía (de su web o de un escaneo anterior) se quedan.
    etiquetas.push(...oferta.etiquetas.filter((e) => e.startsWith(PREFIJO_SALIDA)));
  }
  oferta.etiquetas = etiquetas;
  // Un paquete (vuelo + noches de alojamiento) no es un billete: su precio es por persona y
  // por todo («ida y vuelta» lo comparaba con los billetes y lo sumaba como tal).
  if (oferta.tipo === 'paquete' && ['i/v', 'trayecto'].includes(oferta.unidad)) oferta.unidad = 'pp';
  return oferta;
}
