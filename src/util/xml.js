/**
 * Utilidades de texto para feeds XML y fragmentos HTML.
 */
import { XMLParser } from 'fast-xml-parser';

/**
 * Interpreta XML. Los atributos llevan el prefijo `@_` y el contenido CDATA se
 * funde con el texto. `arrays` son los nombres de etiqueta que siempre deben
 * devolverse como lista aunque solo aparezcan una vez (p. ej. `item`).
 * @param {string} texto
 * @param {{arrays?: string[]}} [opciones]
 */
export function parsearXml(texto, { arrays = [] } = {}) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    htmlEntities: true,
    isArray: (nombre) => arrays.includes(nombre),
  });
  return parser.parse(texto);
}

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€',
  laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', deg: '°', middot: '·',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ccedil: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', Ccedil: 'Ç',
  agrave: 'à', egrave: 'è', ograve: 'ò', Agrave: 'À', Egrave: 'È', Ograve: 'Ò', iuml: 'ï',
};

/** Decodifica entidades HTML con nombre y numéricas. */
export function decodificarEntidades(texto) {
  return String(texto).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entidad, cuerpo) => {
    if (cuerpo[0] !== '#') return ENTIDADES[cuerpo] ?? entidad;
    const codigo = cuerpo[1].toLowerCase() === 'x' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
    return Number.isInteger(codigo) && codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : entidad;
  });
}

/** Convierte un fragmento HTML en texto plano de una sola línea. */
export function textoPlano(html = '') {
  const sinEtiquetas = String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodificarEntidades(sinEtiquetas).replace(/\s+/g, ' ').trim();
}

/** Recorta un texto a `max` caracteres sin partir palabras. */
export function recortar(texto, max = 300) {
  if (texto.length <= max) return texto;
  return `${texto.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** Quita acentos y pasa a minúsculas; útil para comparar y buscar. */
export function normalizarTexto(texto = '') {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
