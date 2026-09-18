/**
 * Criterios vigilados (config/vigilados.json): destinos o tipos de escapada con un
 * precio objetivo. Una oferta coincide si cumple todos los campos presentes.
 */
import { readFileSync } from 'node:fs';
import { distanciaKm } from './enriquecer/geo.js';
import { normalizarTexto } from './util/xml.js';

export function cargarVigilados(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8')).vigilados ?? [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

const tieneCoordenadas = (lugar) => typeof lugar?.lat === 'number' && typeof lugar?.lon === 'number';

/**
 * @param {import('./modelo.js').Oferta} oferta
 * @param {{nombre: string, texto?: string, tipo?: string, tema?: string, fuente?: string, aeropuerto?: string,
 *   precioMax?: number, cocheMaxMin?: number, cerca?: {lat: number, lon: number, radioKm: number}, puente?: boolean}} c
 */
export function coincide(oferta, c) {
  if (c.tipo && oferta.tipo !== c.tipo) return false;
  if (c.tema && !oferta.temas.includes(c.tema)) return false;
  if (c.fuente && oferta.fuente !== c.fuente) return false;
  if (c.aeropuerto && oferta.vuelo?.origen !== c.aeropuerto) return false;
  if (c.precioMax != null && !(oferta.precio != null && oferta.precio <= c.precioMax)) return false;
  if (c.cocheMaxMin != null && !(oferta.cocheMin != null && oferta.cocheMin <= c.cocheMaxMin)) return false;
  if (c.puente && !oferta.fechas.puenteId) return false;
  if (c.cerca && !(tieneCoordenadas(oferta.lugar) && distanciaKm(c.cerca, oferta.lugar) <= c.cerca.radioKm)) return false;
  if (c.texto) {
    const donde = normalizarTexto([oferta.titulo, oferta.lugar?.nombre, oferta.lugar?.iata, oferta.vuelo?.destino].join(' '));
    if (!donde.includes(normalizarTexto(c.texto))) return false;
  }
  return true;
}
