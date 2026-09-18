/**
 * Ofertas del blog Viajeros Piratas a partir de su feed RSS: hoteles,
 * vuelos, paquetes y escapadas. El precio, las noches, el régimen y el lugar
 * se deducen del título y del texto de cada entrada.
 */
import { crearOferta } from '../modelo.js';
import { extraerPrecios } from '../util/precio.js';
import { parsearXml, recortar, textoPlano } from '../util/xml.js';

const ID = 'viajerospiratas';
const WEB = 'https://www.viajerospiratas.es';
const URL_FEED = `${WEB}/feed`;

const TIPOS_POR_SECCION = {
  hoteles: 'hotel',
  vuelos: 'vuelo',
  paquetes: 'paquete',
  viajes: 'paquete',
  vacaciones: 'paquete',
};

const EMOJIS = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

// Precio: «38€ por persona», «desde solo 99€», «76€ la noche», «29€ ida y vuelta».
const SUFIJO_NOCHE = String.raw`\s*(?:(?:por|la|cada)\s+|\/\s*)?(?:noche|habitaci[oó]n)\b`;
const DESDE = String.raw`\bdesde\s+(?:(?:tan\s+)?s[oó]lo\s+|unos\s+)?`;
const TRAS_PERSONA = /^\s*(?:por persona|p\.\s?p\.?|\/\s?persona)(\s*(?:y\s+(?:por\s+)?|\/\s*)noche\b)?/i;
const TRAS_NOCHE = new RegExp(`^${SUFIJO_NOCHE}`, 'i');
const TRAS_IDA_VUELTA = /^\s*(?:i\/v|ida y vuelta)\b/i;
const ANTES_DESDE = new RegExp(`${DESDE}$`, 'i');
// «desde 76€ la noche, 38€ por persona»: el precio por persona es de una noche.
const ANTES_PAREJA = new RegExp(`${DESDE}\\d[\\d.,]*\\s?€(${SUFIJO_NOCHE})?\\s*,\\s*¡?\\s*(?:s[oó]lo\\s+)?$`, 'i');
// Cantidades que no son el precio: «hay que sumarle unos 135€», «hasta 200€ de descuento».
const ANTES_EXTRA = /\b(?:sumar(?:le)?|añadir(?:le)?|suplementos?|tasas?|propinas?)\b[^.€]{0,20}$/i;
const TRAS_EXTRA = /^\s*(?:de\s+)?(?:descuento|dto|ahorro|regalo)\b/i;

const NUMEROS = { una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7 };
const NOCHES = /(?<!partir de )\b(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete)(?:\s+(?:o|a|y|-)\s+\d{1,2})?\s+noches?\b/i;

const REGIMENES = [
  ['todo-incluido', /todo[\s-]incluido/i],
  ['pension-completa', /pensi[oó]n completa/i],
  ['media-pension', /media[\s-]pensi[oó]n/i],
  ['solo-alojamiento', /s[oó]lo alojamiento/i],
  ['desayuno', /desayunos?\b/i],
];

// Lugar: lo que va tras « a », « al », « en » o « por » hasta el siguiente conector.
const ANTES_DE_LUGAR = /\s+(?:a|al|en|por)\s+/i;
const FIN_DE_LUGAR = /\s+(?:y|e|o|u|con|cerca|desde|para|junto|durante|sin)\s|\s+\d|\s[-–—|]\s|[¡!¿?(),:;]/i;
const ARTICULO = /^(?:el|la|los|las)\s+/;
const PARTICULAS = new Set(['de', 'del', 'el', 'la', 'las', 'los', 'y']);

/** Título sin emojis ni espacios sobrantes. */
export function limpiarTitulo(titulo = '') {
  return textoPlano(String(titulo).replace(EMOJIS, ' '));
}

/**
 * Nombre del lugar que menciona el título («Escapada a Lisboa» → «Lisboa»,
 * «Hotel spa 4* en el País Vasco» → «País Vasco»), o null.
 * @param {string} titulo
 * @returns {string|null}
 */
export function extraerLugar(titulo) {
  const [, ...trozos] = limpiarTitulo(titulo).split(ANTES_DE_LUGAR);
  for (const trozo of trozos) {
    const candidato = trozo.split(FIN_DE_LUGAR)[0].replace(ARTICULO, '').replace(/[.\s]+$/, '');
    if (/^\p{Lu}/u.test(candidato)) return esMayusculas(candidato) ? capitalizar(candidato) : candidato;
  }
  return null;
}

const esMayusculas = (texto) => texto === texto.toUpperCase() && /\p{Lu}{2}/u.test(texto);

function capitalizar(texto) {
  return texto.toLowerCase().split(' ')
    .map((palabra, i) => (i > 0 && PARTICULAS.has(palabra) ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1)))
    .join(' ');
}

/**
 * Precio principal de un texto: primero la cantidad «por persona», si no la
 * que va tras «desde» y si no la primera cantidad en euros. Ignora los
 * suplementos y los descuentos.
 * @param {string} texto
 * @returns {{precio: number|null, precioTexto: string, unidad: 'pp'|'pp/noche'|'noche'|'i/v'|null}}
 */
export function interpretarPrecio(texto) {
  const precios = extraerPrecios(texto)
    .map((p) => ({
      ...p,
      previo: texto.slice(Math.max(0, p.indice - 80), p.indice),
      resto: texto.slice(p.indice + p.fragmento.length),
    }))
    .filter((p) => !ANTES_EXTRA.test(p.previo) && !TRAS_EXTRA.test(p.resto));
  const porPersona = precios.find((p) => TRAS_PERSONA.test(p.resto));
  if (porPersona) {
    const sufijo = porPersona.resto.match(TRAS_PERSONA);
    const pareja = porPersona.previo.match(ANTES_PAREJA);
    const unidad = sufijo[1] || pareja?.[1] ? 'pp/noche' : 'pp';
    return resultado(texto, porPersona, pareja ?? porPersona.previo.match(ANTES_DESDE), sufijo, unidad);
  }
  const elegido = precios.find((p) => ANTES_DESDE.test(p.previo)) ?? precios[0];
  if (!elegido) return { precio: null, precioTexto: '', unidad: null };
  const noche = elegido.resto.match(TRAS_NOCHE);
  const idaVuelta = elegido.resto.match(TRAS_IDA_VUELTA);
  const unidad = noche ? 'noche' : idaVuelta ? 'i/v' : null;
  return resultado(texto, elegido, elegido.previo.match(ANTES_DESDE), noche ?? idaVuelta, unidad);
}

function resultado(texto, precio, prefijo, sufijo, unidad) {
  const inicio = precio.indice - (prefijo ? prefijo[0].length : 0);
  const fin = precio.indice + precio.fragmento.length + (sufijo ? sufijo[0].length : 0);
  const precioTexto = texto.slice(inicio, fin).replace(/[¡!]/g, '').replace(/\s+/g, ' ').trim();
  return { precio: precio.valor, precioTexto, unidad };
}

/** Número de noches («3 noches», «2 o 3 noches» → 2, «una noche» → 1), o null. */
export function extraerNoches(texto) {
  const coincidencia = texto.match(NOCHES);
  if (!coincidencia) return null;
  const numero = coincidencia[1].toLowerCase();
  return NUMEROS[numero] ?? Number(numero);
}

/** Primer régimen de comidas que menciona el texto, o null. */
export function extraerRegimen(texto) {
  const encontrados = REGIMENES
    .map(([id, patron]) => ({ id, indice: texto.search(patron) }))
    .filter((r) => r.indice >= 0)
    .sort((a, b) => a.indice - b.indice);
  return encontrados[0]?.id ?? null;
}

/** Tipo de oferta según la sección de la URL (/hoteles/, /vuelos/, /vacaciones/…). */
export function tipoPorUrl(url) {
  return TIPOS_POR_SECCION[seccionDe(url)] ?? 'escapada';
}

const seccionDe = (url) => new URL(url).pathname.split('/')[1] ?? '';

const textoDe = (valor) => (valor && typeof valor === 'object' ? valor['#text'] : valor) ?? '';

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

function ofertaDeItem(item) {
  const url = urlLimpia(textoDe(item.link) || textoDe(item.guid));
  const titulo = limpiarTitulo(textoDe(item.title));
  const texto = textoPlano(textoDe(item.description));
  const tipo = tipoPorUrl(url);
  const lugar = extraerLugar(titulo);
  const imagen = item.enclosure?.['@_url'];
  return crearOferta({
    id: `${ID}:${new URL(url).pathname.replace(/^\/+|\/+$/g, '')}`,
    fuente: ID,
    tipo,
    titulo,
    descripcion: recortar(texto),
    url,
    imagen: imagen ? new URL(imagen, WEB).href : null,
    ...interpretarPrecio(`${titulo}. ${texto}`),
    noches: extraerNoches(titulo) ?? extraerNoches(texto),
    regimen: extraerRegimen(titulo) ?? extraerRegimen(texto),
    transporte: tipo === 'vuelo' ? 'avion' : null,
    lugar: lugar ? { nombre: lugar } : null,
    etiquetas: [seccionDe(url)].filter(Boolean),
    publicada: fechaIso(textoDe(item.pubDate)),
  });
}

/**
 * Convierte el RSS de Viajeros Piratas en ofertas. Las entradas que no se
 * pueden interpretar se registran con `ctx.log` y se omiten.
 * @param {string} xml
 * @param {{log: (mensaje: string) => void}} ctx
 * @returns {import('../modelo.js').Oferta[]}
 */
export function parsear(xml, ctx) {
  const canal = parsearXml(xml, { arrays: ['item'] })?.rss?.channel;
  if (!canal) throw new Error('La respuesta no es un feed RSS (¿página de error o desafío anti-bot?)');
  return (canal.item ?? []).flatMap((item) => {
    try {
      return [ofertaDeItem(item)];
    } catch (error) {
      ctx.log(`Entrada omitida («${limpiarTitulo(textoDe(item.title))}»): ${error.message}`);
      return [];
    }
  });
}

export default {
  id: ID,
  nombre: 'Viajeros Piratas',
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
