/**
 * La misma escapada publicada en varias webs. Se agrupan las ofertas cuyo nombre
 * de alojamiento normalizado y cuya localidad coinciden; la más barata se queda
 * con la lista de `equivalentes` y las demás se marcan con la etiqueta «duplicada».
 *
 * Es deliberadamente conservador: ante la duda (título genérico, sin localidad,
 * nombre demasiado corto o una sola web) no agrupa nada. Mejor enseñar dos veces
 * la misma casa que esconder una oferta distinta.
 */
import { normalizarTexto } from '../util/xml.js';
import { precioPorPersonaNoche } from './puntuacion.js';

export const ETIQUETA_DUPLICADA = 'duplicada';

/** Palabras de categoría que no distinguen un alojamiento de otro. */
const CATEGORIA = /\b(hotel|hoteles|hostal|hostales|aparthotel|apartahotel|apartamentos?|camping|bungalows?|glamping|balneario|spa|wellness|resort|boutique|complejo|alojamiento|hospederia|casa rural|casas rurales|adults only|solo adultos)\b/g;
/** «4*», «4 estrellas»… */
const CATEGORIA_ESTRELLAS = /\b\d\s*(?:\*+|estrellas?\b)/g;
/** Títulos que describen la oferta, no el alojamiento: no sirven para comparar. */
const TITULO_GENERICO = [
  /\b(para|hasta)\s+\d+\s+personas?\b/,
  /\b\d+\s*noches?\b/,
  /^(escapada|escapadas|oferta|ofertas|finde|fin de semana|estancia|plan|chollo|viaje|vuelo|promocion|descuento|circuito)\b/,
];
const MINIMO_PALABRAS = 2;
const MINIMO_CARACTERES = 6;

const limpiar = (texto) => texto.replace(/\s+/g, ' ').trim();

/**
 * Nombre del alojamiento de una oferta, normalizado para comparar, o null si el
 * título no sirve para identificarlo.
 * @param {import('../modelo.js').Oferta} oferta
 */
export function nombreAlojamiento(oferta) {
  // Nomolesten titula las escapadas «<oferta> · <alojamiento>».
  const bruto = normalizarTexto(String(oferta.titulo).split('·').pop());
  const sinLugar = quitarLugar(bruto, oferta.lugar?.nombre);
  if (TITULO_GENERICO.some((patron) => patron.test(sinLugar))) return null;
  const nombre = limpiar(sinLugar
    .replace(CATEGORIA_ESTRELLAS, ' ')
    .replace(CATEGORIA, ' ')
    .replace(/[^a-z0-9 ]/g, ' '));
  const palabras = nombre.split(' ').filter(Boolean);
  return palabras.length >= MINIMO_PALABRAS && nombre.length >= MINIMO_CARACTERES ? nombre : null;
}

/** «mas bassó en besalú» → «mas bassó». */
function quitarLugar(texto, lugar) {
  if (!lugar) return texto;
  const sitio = normalizarTexto(lugar).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return limpiar(texto.replace(new RegExp(`\\s+(en|de)\\s+${sitio}\\b.*$`), ''));
}

const localidadDe = (oferta) => normalizarTexto(oferta.lugar?.nombre ?? '').trim() || null;

/** Lo comparable entre webs: precio por persona y noche y, si no se sabe, el precio. */
function valorComparable(oferta) {
  const noche = oferta.precioNoche ?? precioPorPersonaNoche(oferta);
  return noche ?? oferta.precio ?? Infinity;
}

const resumir = (oferta) => ({ fuente: oferta.fuente, precio: oferta.precio, unidad: oferta.unidad, url: oferta.url });

function agrupar(ofertas) {
  const grupos = new Map();
  for (const oferta of ofertas) {
    const nombre = nombreAlojamiento(oferta);
    const localidad = localidadDe(oferta);
    if (!nombre || !localidad) continue;
    const clave = `${nombre}|${localidad}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(oferta);
  }
  // La misma escapada en varias webs: dos ofertas de la misma web son cosas distintas.
  return [...grupos.values()].filter((grupo) => new Set(grupo.map((o) => o.fuente)).size >= 2);
}

/**
 * Rellena `equivalentes` (y la etiqueta «duplicada» en las repetidas) en todas las
 * ofertas. Es idempotente: cada ejecución parte de cero.
 * @param {import('../modelo.js').Oferta[]} ofertas
 */
export function marcarEquivalentes(ofertas) {
  for (const oferta of ofertas) {
    oferta.equivalentes = [];
    oferta.etiquetas = oferta.etiquetas.filter((etiqueta) => etiqueta !== ETIQUETA_DUPLICADA);
  }

  for (const grupo of agrupar(ofertas)) {
    const [mejor, ...repetidas] = [...grupo].sort((a, b) => valorComparable(a) - valorComparable(b));
    mejor.equivalentes = repetidas.map(resumir);
    for (const oferta of repetidas) {
      oferta.equivalentes = [resumir(mejor)];
      oferta.etiquetas.push(ETIQUETA_DUPLICADA);
    }
  }
  return ofertas;
}
