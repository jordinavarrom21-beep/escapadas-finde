/**
 * Qué clase de alojamiento es cada oferta (`hotel`, `casa-rural`, `camping`…).
 * Primero manda la fuente, que solo publica un tipo de alojamiento y nunca se
 * equivoca; si no, se buscan las palabras clave en el título y la descripción.
 */
import { normalizarTexto } from '../util/xml.js';

/** Fuentes monotemáticas: todo su catálogo es del mismo tipo. */
const POR_FUENTE = {
  clubrural: 'casa-rural',
  escapadarural: 'casa-rural',
  campings: 'camping',
  paradores: 'parador',
  nomolesten: 'hotel',
  rusticae: 'hotel',
};

/** De la palabra más específica a la más genérica (sin tildes: se compara normalizado). */
const POR_PALABRA = [
  [/\bcasas? rural(es)?\b|\bcasa-rural\b/, 'casa-rural'],
  [/\bmasias?\b/, 'casa-rural'],
  [/\bglamping\b/, 'camping'],
  [/\bcampings?\b/, 'camping'],
  [/\bbungalows?\b/, 'camping'],
  [/\bbalnearios?\b/, 'balneario'],
  [/\bparador(es)?\b/, 'parador'],
  [/\bhostal(es)?\b/, 'hostal'],
  [/\bapartamentos?\b|\bapartahotel\b|\bapartotel\b/, 'apartamento'],
  [/\bhotel(es)?\b/, 'hotel'],
];

/**
 * Tipo de alojamiento de la oferta, o null si no se deduce.
 * @param {import('../modelo.js').Oferta} oferta
 * @returns {'hotel'|'casa-rural'|'camping'|'apartamento'|'parador'|'balneario'|'hostal'|null}
 */
export function detectarAlojamiento(oferta) {
  if (oferta.tipo === 'vuelo') return null;
  const porFuente = POR_FUENTE[oferta.fuente];
  if (porFuente) return porFuente;
  const texto = normalizarTexto(`${oferta.titulo} · ${oferta.descripcion}`);
  return POR_PALABRA.find(([patron]) => patron.test(texto))?.[1] ?? null;
}

/** Rellena `alojamiento` solo si la fuente no lo ha dado. */
export function aplicarAlojamiento(oferta) {
  oferta.alojamiento ??= detectarAlojamiento(oferta);
  return oferta;
}
