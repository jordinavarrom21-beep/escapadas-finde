/**
 * Ofertas de Fly4free a partir de su feed RSS (en inglés). Solo se quedan las
 * que salen de España: vuelos baratos, tarifas erróneas y paquetes con hotel.
 */
import { crearOferta } from '../modelo.js';
import { extraerPrecios } from '../util/precio.js';
import { normalizarTexto, parsearXml, recortar, textoPlano } from '../util/xml.js';

const ID = 'fly4free';
const WEB = 'https://www.fly4free.com';
const URL_FEED = `${WEB}/feed/`;

// Nombres ya normalizados (sin tildes y en minúsculas).
const ORIGENES = [
  'spain', 'espana', 'barcelona', 'girona', 'gerona', 'reus', 'madrid', 'valencia', 'malaga',
  'seville', 'sevilla', 'bilbao', 'alicante', 'palma de mallorca', 'palma', 'mallorca', 'majorca',
  'ibiza', 'menorca', 'tenerife', 'gran canaria', 'lanzarote', 'fuerteventura', 'canary islands',
  'santiago de compostela', 'zaragoza', 'santander', 'asturias', 'vigo', 'murcia',
];
const ORIGEN = `(?:the\\s+)?(?:(?:many|several|various|selected)\\s+)?(?:${ORIGENES.join('|')}|spanish\\s+(?:cities|airports))\\b`;
// «from Paris, Madrid and Rome»: hasta cuatro ciudades antes de la española, sin cruzar un «to».
const CIUDAD_PREVIA = String.raw`(?!to\b)[a-z][\w'-]*(?:\s(?!to\b)[a-z][\w'-]*)?(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or|&)\s+)`;
// «40 minutes from Barcelona» habla de distancias, no de la salida.
const DISTANCIA = String.raw`(?<!(?:minutes?|mins|hours?|hrs|km|kilomet(?:re|er)s|miles|drive|ride|walk|away|far)\s+)`;
const SALIDA_DESDE = new RegExp(`${DISTANCIA}\\bfrom\\s+(?:${CIUDAD_PREVIA}){0,4}${ORIGEN}`);
const SALIDA_HACIA = new RegExp(`\\b(?:${ORIGENES.join('|')})\\s+to\\s+\\S`);
// En las ofertas «from many European cities» las categorías son las ciudades de salida.
const MULTIORIGEN = /\bfrom\s+(?:(?:many|several|various|selected|multiple)\s+(?:european\s+)?(?:cities|airports)|europe)\b/;

const ERROR_TARIFA = /\b(?:(?:error|mistake)[\s-]fares?|(?:price|pricing)\s+error)\b/i;
const DESTACADAS = new Set(['alert', 'hot', 'hotspot', 'hot deals', 'deal alert']);
// Categorías SEO («cheap flights to Bali», «vienna to oman») que no aportan como etiqueta.
const CATEGORIA_SEO = /^(?:cheap|flights?|from)\b|\bto\b|^europe$/;

const CON_ALOJAMIENTO = /\b(?:hotels?|b&b|bed\s*(?:&|and)\s*breakfast|\d+[\s-]nights?|stay|accommodation|all[\s-]inclusive|package|cruise)\b/i;
const VUELOS = /\bflights?\b/i;
const NOCHES = /\b(\d{1,2})[\s-]nights?\b/i;
const REGIMENES = [
  ['todo-incluido', /\ball[\s-]inclusive\b/i],
  ['pension-completa', /\bfull[\s-]board\b/i],
  ['media-pension', /\bhalf[\s-]board\b/i],
  ['desayuno', /\bb&b\b|\bbed\s*(?:&|and)\s*breakfast\b|\bbreakfast\b/i],
  ['solo-alojamiento', /\broom[\s-]only\b/i],
];

const POR_PERSONA = /\bp\.\s?p\.|\bper\s+person\b/i;
const SOLO_IDA = /\bone[\s-]way\b/i;
const IDA_Y_VUELTA = /\b(?:round[\s-]?trip|return)\b/i;
const ANTES_PRECIO = /\b(?:from|for)\s+(?:(?:just|only)\s+)?$/i;
const TRAS_PRECIO = /^\s*(?:p\.\s?p\.|return|round[\s-]?trip|one[\s-]way)/i;

const EMOJIS = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const PALABRA_LUGAR = String.raw`\p{Lu}[\p{L}\p{M}'’.-]*`;
const LUGAR = (preposicion) => new RegExp(
  `\\b${preposicion}\\s+(?:the\\s+)?(${PALABRA_LUGAR}(?:\\s+(?:(?:de|da|do|del|la|el)\\s+)?${PALABRA_LUGAR})*)`, 'gu',
);
const LUGAR_DESTINO = LUGAR('to');
const LUGAR_ESTANCIA = LUGAR('in');

/**
 * true si el texto habla de salir de España («from Spain», «from Barcelona»,
 * «Barcelona to Tokyo», «from Paris, Madrid and Rome»). Un destino español
 * («escape to Costa Brava, Spain… flights from Budapest») no cuenta.
 * @param {string} texto
 */
export function saleDeEspana(texto) {
  const normalizado = normalizarTexto(texto);
  return SALIDA_DESDE.test(normalizado) || SALIDA_HACIA.test(normalizado);
}

/** Destino del título: «flights from Spain to New York from €244» → «New York», o null. */
export function extraerDestino(titulo) {
  const limpio = titulo.replace(EMOJIS, ' ');
  for (const patron of [LUGAR_DESTINO, LUGAR_ESTANCIA]) {
    const encontrado = limpio.matchAll(patron).next().value;
    if (encontrado) return encontrado[1].replace(/[.'’-]+$/, '');
  }
  return null;
}

/**
 * Precio del título (o, si no lo tiene en euros, de la descripción) y su unidad:
 * `pp` si es por persona, `i/v` si es ida y vuelta y null en otro caso.
 * @returns {{precio: number|null, precioTexto: string, unidad: 'pp'|'i/v'|null}}
 */
export function interpretarPrecio(titulo, descripcion) {
  const unidad = unidadDe(`${titulo} ${descripcion}`);
  for (const fuenteTexto of [titulo, descripcion]) {
    const [primero] = extraerPrecios(fuenteTexto);
    if (primero) return { precio: primero.valor, precioTexto: fragmentoPrecio(fuenteTexto, primero), unidad };
  }
  return { precio: null, precioTexto: '', unidad: null };
}

function unidadDe(texto) {
  if (POR_PERSONA.test(texto)) return 'pp';
  if (SOLO_IDA.test(texto)) return null;
  return IDA_Y_VUELTA.test(texto) ? 'i/v' : null;
}

function fragmentoPrecio(texto, { indice, fragmento }) {
  const prefijo = texto.slice(0, indice).match(ANTES_PRECIO)?.[0] ?? '';
  const sufijo = texto.slice(indice + fragmento.length).match(TRAS_PRECIO)?.[0] ?? '';
  return `${prefijo}${fragmento}${sufijo}`.replace(/\s+/g, ' ').trim();
}

const textoDe = (valor) => (valor && typeof valor === 'object' ? valor['#text'] : valor) ?? '';

const esMultiorigenEspanol = (titulo, categorias) =>
  MULTIORIGEN.test(normalizarTexto(titulo)) && categorias.some((c) => ORIGENES.includes(normalizarTexto(c).trim()));

function etiquetasDe(categorias, texto) {
  const normalizadas = categorias.map((c) => c.trim().toLowerCase()).filter(Boolean);
  const etiquetas = normalizadas.filter((c) => !CATEGORIA_SEO.test(c));
  if (normalizadas.some((c) => DESTACADAS.has(c))) etiquetas.push('top-chollo');
  if (ERROR_TARIFA.test(texto)) etiquetas.push('error-tarifa');
  return [...new Set(etiquetas)];
}

function nochesDe(texto) {
  const numero = texto.match(NOCHES)?.[1];
  return numero ? Number(numero) : null;
}

function regimenDe(texto) {
  return REGIMENES.find(([, patron]) => patron.test(texto))?.[0] ?? null;
}

function idDe(item, url) {
  const numero = textoDe(item.guid).match(/[?&]p=(\d+)/)?.[1];
  return `${ID}:${numero ?? new URL(url).pathname.replace(/^\/+|\/+$/g, '')}`;
}

function urlLimpia(enlace) {
  if (!enlace) throw new TypeError('la entrada no tiene enlace');
  const url = new URL(enlace, WEB);
  url.search = '';
  url.hash = '';
  return url.href;
}

function fechaIso(texto) {
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function ofertaDeItem(item, { titulo, descripcion, categorias }) {
  const url = urlLimpia(textoDe(item.link) || textoDe(item.guid));
  const tipo = CON_ALOJAMIENTO.test(titulo) ? 'paquete' : 'vuelo';
  const texto = `${titulo} ${descripcion}`;
  const destino = extraerDestino(titulo);
  return crearOferta({
    id: idDe(item, url),
    fuente: ID,
    tipo,
    titulo,
    descripcion: recortar(descripcion),
    url,
    ...interpretarPrecio(titulo, descripcion),
    noches: tipo === 'paquete' ? nochesDe(texto) : null,
    regimen: tipo === 'paquete' ? regimenDe(texto) : null,
    transporte: tipo === 'vuelo' || VUELOS.test(titulo) ? 'avion' : null,
    lugar: destino ? { nombre: destino } : null,
    etiquetas: etiquetasDe(categorias, `${texto} ${categorias.join(' ')}`),
    publicada: fechaIso(textoDe(item.pubDate)),
  });
}

/**
 * Convierte el RSS de Fly4free en ofertas, quedándose solo con las que salen
 * de España. Las entradas que no se pueden interpretar se registran con
 * `ctx.log` y se omiten.
 * @param {string} xml
 * @param {{log: (mensaje: string) => void}} ctx
 * @returns {import('../modelo.js').Oferta[]}
 */
export function parsear(xml, ctx) {
  const canal = parsearXml(xml, { arrays: ['item', 'category'] })?.rss?.channel;
  if (!canal) throw new Error('La respuesta no es un feed RSS (¿página de error o desafío anti-bot?)');
  return (canal.item ?? []).flatMap((item) => {
    const titulo = textoPlano(textoDe(item.title));
    const descripcion = textoPlano(textoDe(item.description));
    const categorias = (item.category ?? []).map((c) => textoPlano(textoDe(c)));
    const deEspana = [titulo, descripcion, ...categorias].some(saleDeEspana) || esMultiorigenEspanol(titulo, categorias);
    if (!deEspana) return [];
    try {
      return [ofertaDeItem(item, { titulo, descripcion, categorias })];
    } catch (error) {
      ctx.log(`Entrada omitida («${titulo}»): ${error.message}`);
      return [];
    }
  });
}

export default {
  id: ID,
  nombre: 'Fly4free',
  web: WEB,
  modo: 'feed',
  requiere: [],
  urls: [URL_FEED],
  async obtener(ctx) {
    const xml = await ctx.http.texto(URL_FEED, {
      cabeceras: { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
    });
    return { ofertas: parsear(xml, ctx) };
  },
};
