/**
 * Categoría del alojamiento: las estrellas (1–5) y si es «solo adultos». Si la fuente
 * ya da las estrellas como dato (Holidayguru), mandan esas; si no, se leen del título,
 * la descripción y las etiquetas, donde casi todas las webs las escriben: «Hotel 4*»,
 * «(4*, 8,8/10 en 5 opiniones)», «Claustre Boutique Hotel & SPA****», «hotel de 4
 * estrellas». No cuentan las «reseñas de 5 estrellas» (eso es una valoración) ni el
 * «**texto**» en negrita de algunas descripciones.
 *
 * Si hay varias categorías distintas («hoteles de 3* y 4*») se queda la más baja: es lo
 * mínimo que se puede prometer. Una oferta con estrellas y sin tipo de alojamiento es un
 * hotel (las casas rurales y los apartamentos no llevan estrellas).
 */
import { normalizarTexto } from '../util/xml.js';

const ALOJAMIENTO = '(?:hotel(?:es)?|aparthotel|apartahotel|hostal|camping|resort|balneario|parador|posada|spa|boutique)';
const PATRONES = [
  // «4*», «4 *», «4*S», «4★»: un dígito suelto seguido de asterisco o estrella.
  /(?<![\d.,/])([1-5])\s?[*★](?!\*)/g,
  // «hotel de 4 estrellas», «camping 3 estrellas»
  new RegExp(`\\b${ALOJAMIENTO}(?: [a-z]+){0,3}? (?:de )?([1-5]) estrellas\\b`, 'g'),
];
/** «SPA****», «Hotel ***» : asteriscos seguidos pegados a un nombre y no a la palabra siguiente. */
const ASTERISCOS = /[a-z)]\s?(\*{2,5})(?![\w*])/g;
const NEGRITA = /(?:^|[\s·(])\*\*[a-z0-9]/;
/** Lo que parece estrellas pero es una valoración de clientes. */
const VALORACION = /\b(?:resenas|valoraciones|opiniones|puntuacion|reviews?)\b[^·.]{0,20}$/;

const SOLO_ADULTOS = /\b(?:solo (?:para )?adultos|adults only|only adults|mayores de 1[68] anos)\b/;

/**
 * Estrellas que dice el texto de la oferta, o null.
 * @param {import('../modelo.js').Oferta} oferta
 */
export function detectarEstrellas(oferta) {
  if (['vuelo', 'actividad'].includes(oferta.tipo)) return null;
  const texto = normalizarTexto([oferta.titulo, oferta.descripcion, ...(oferta.etiquetas ?? [])].filter(Boolean).join(' · '));
  const encontradas = [];
  for (const patron of PATRONES) {
    for (const m of texto.matchAll(patron)) {
      if (VALORACION.test(texto.slice(Math.max(0, m.index - 30), m.index))) continue;
      encontradas.push(Number(m[1]));
    }
  }
  // Con «**texto**» en negrita (Markdown), los asteriscos del cierre no son estrellas.
  if (!NEGRITA.test(texto)) for (const m of texto.matchAll(ASTERISCOS)) encontradas.push(m[1].length);
  return encontradas.length ? Math.min(...encontradas) : null;
}

/** ¿Es un alojamiento solo para adultos? */
export function esSoloAdultos(oferta) {
  return SOLO_ADULTOS.test(normalizarTexto([oferta.titulo, oferta.descripcion, ...(oferta.etiquetas ?? [])].filter(Boolean).join(' · ')));
}

/**
 * Rellena `estrellas` si la fuente no las ha dado, marca «solo-adultos» en las
 * etiquetas y da por hotel lo que tiene estrellas y ningún tipo de alojamiento.
 */
export function aplicarCategoria(oferta) {
  oferta.estrellas ??= detectarEstrellas(oferta);
  if (oferta.estrellas != null && !oferta.alojamiento && !['vuelo', 'actividad', 'crucero'].includes(oferta.tipo)) oferta.alojamiento = 'hotel';
  const adultos = esSoloAdultos(oferta);
  const tiene = oferta.etiquetas.includes('solo-adultos');
  if (adultos && !tiene) oferta.etiquetas = [...oferta.etiquetas, 'solo-adultos'];
  if (!adultos && tiene) oferta.etiquetas = oferta.etiquetas.filter((e) => e !== 'solo-adultos');
  return oferta;
}
