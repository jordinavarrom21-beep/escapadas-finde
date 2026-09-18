/**
 * Ofertas de viajes de la comunidad Chollometro a partir de sus feeds RSS
 * («subiendo» y «nuevos»). De cada feed solo se quedan los chollos de viajes:
 * los de la categoría de viajes o los que lo dejan claro en el título.
 */
import { crearOferta } from '../modelo.js';
import { parsearPrecio } from '../util/precio.js';
import { parsearXml, recortar, textoPlano } from '../util/xml.js';
import { extraerLugar, limpiarTitulo } from './viajerospiratas.js';

const ID = 'chollometro';
const WEB = 'https://www.chollometro.com';
// /rss/hot redirige (301) a /rss/subiendo: se pide directamente el destino.
const URLS_FEEDS = [`${WEB}/rss/subiendo`, `${WEB}/rss/nuevos`];
const PAUSA_MS = 2000;

const CATEGORIA_VIAJES = /\b(?:viajes?|vuelos?|hoteles?|vacaciones|escapadas?)\b/;

// Palabras que dejan claro que es una oferta de viaje (sobre el título sin tildes).
const VIAJE = new RegExp(`\\b(?:${[
  'hotel(?:es)?', 'hostal(?:es)?', 'apartamentos?', 'paradore?s?', 'resorts?', 'casas? rurale?s?', 'balnearios?',
  'vuelos?', 'billetes? de (?:avion|tren|autobus|barco|ferry)', 'cruceros?', 'ferry', 'escapadas?', '\\d+ noches?',
  'parques? tematicos?', 'port ?aventura', 'ferrari land', 'disneyland', 'parque warner',
  'renfe', 'ouigo', 'iryo', 'ryanair', 'vueling', 'iberia', 'air europa', 'easyjet', 'volotea', 'binter',
  'booking', 'airbnb', 'edreams', 'logitravel', 'expedia', 'atrapalo', 'destinia',
].join('|')})\\b`, 'i');
const AVE = /\bAVE\b/;

// Productos que mencionan viajes sin serlo («Maleta de cabina Ryanair», «Dron con 30 min de vuelo»).
const PRODUCTO = /\b(?:maletas?|mochilas?|trolley|neceser(?:es)?|bolsas? de viaje|(?:kit|set|tamano) de viaje|almohadas?|cojin(?:es)?|adaptador(?:es)?|candados?|basculas?|organizador(?:es)?|dron(?:es)?|lego|playmobil|juguetes?|cuadernos?)\b/i;

const TIPOS = [
  ['paquete', /\b(?:vuelos?|avion)\s*(?:\+|y|con)\s*hotel|\bhotel\s*(?:\+|y|con)\s*vuelos?\b|\bpaquetes?\b|\bcruceros?\b|\bviajes? organizados?\b/i],
  ['vuelo', /\bvuelos?\b|\bbilletes? de avion\b|\b(?:ryanair|vueling|iberia|air europa|easyjet|volotea|binter)\b/i],
  ['escapada', /\bescapadas?\b|\bbalnearios?\b|\bparques? tematicos?\b|\bport ?aventura\b|\bferrari land\b|\bdisneyland\b|\bparque warner\b/i],
  ['hotel', /\b(?:hotel(?:es)?|hostal(?:es)?|apartamentos?|paradore?s?|resorts?|casas? rurale?s?|\d+ noches?|booking|airbnb)\b/i],
];

const UNIDADES = [
  ['i/v', /\bi\/v\b|\bida y vuelta\b/i],
  ['pp/noche', /\bpor persona y noche\b/i],
  ['noche', /(?:\bpor|\bla|\/)\s*noche\b/i],
  ['pp', /\bpor persona\b|\bp\.\s?p\./i],
];

const TEMPERATURA = /^(-?\d+)\s*[°º]\s*-\s*/;

const textoDe = (valor) => (valor && typeof valor === 'object' ? valor['#text'] : valor) ?? '';
const sinTildes = (texto) => texto.normalize('NFD').replace(/\p{M}/gu, '');
const posicion = (patron, texto) => {
  const indice = texto.search(patron);
  return indice < 0 ? Infinity : indice;
};

// Título sin la temperatura inicial, y la temperatura en grados («182° - Hotel…» → {titulo: 'Hotel…', temperatura: 182}).
function separarTemperatura(tituloRss) {
  const titulo = limpiarTitulo(tituloRss);
  const coincidencia = titulo.match(TEMPERATURA);
  if (!coincidencia) return { titulo, temperatura: null };
  return { titulo: titulo.slice(coincidencia[0].length), temperatura: Number(coincidencia[1]) };
}

/**
 * true si un item del RSS es una oferta de viaje: por su categoría o por las
 * palabras de su título. Si lo primero que nombra el título es un producto
 * (maleta, mochila, dron…), no lo es.
 * @param {{category?: string|string[], title?: string}} item
 */
export function esDeViajes(item) {
  const titulo = sinTildes(separarTemperatura(textoDe(item.title)).titulo);
  const viaje = Math.min(posicion(VIAJE, titulo), posicion(AVE, titulo));
  if (posicion(PRODUCTO, titulo) < viaje) return false;
  if (viaje < Infinity) return true;
  return [item.category ?? []].flat().some((categoria) => CATEGORIA_VIAJES.test(textoPlano(textoDe(categoria)).toLowerCase()));
}

const tipoDe = (titulo) => TIPOS.find(([, patron]) => patron.test(sinTildes(titulo)))?.[0] ?? 'escapada';
const unidadDe = (titulo) => UNIDADES.find(([, patron]) => patron.test(sinTildes(titulo)))?.[0] ?? null;

function urlLimpia(enlace) {
  if (!enlace) throw new TypeError('la entrada no tiene enlace');
  const url = new URL(enlace, WEB);
  url.search = '';
  url.hash = '';
  return url.href;
}

function idDe(url) {
  const numero = new URL(url).pathname.match(/-(\d+)\/?$/)?.[1];
  if (!numero) throw new TypeError(`no se encuentra el número de la oferta en ${url}`);
  return `${ID}:${numero}`;
}

function imagenDe(item) {
  const url = item['media:content']?.['@_url'];
  return url ? new URL(url.replace('/re/150x150/', '/re/300x300/'), WEB).href : null;
}

// La descripción empieza con «<strong>24,71€ - Amazon</strong>», que ya va en precio y etiquetas.
const descripcionDe = (html) => recortar(textoPlano(String(html).replace(/^\s*<strong>[^<]*<\/strong>/, '')));

function fechaIso(texto) {
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

function ofertaDeItem(item) {
  const url = urlLimpia(textoDe(item.link) || textoDe(item.guid));
  const { titulo, temperatura } = separarTemperatura(textoDe(item.title));
  const comercio = item['pepper:merchant'] ?? {};
  const precioTexto = comercio['@_price'] ?? '';
  const tipo = tipoDe(titulo);
  const lugar = extraerLugar(titulo);
  return crearOferta({
    id: idDe(url),
    fuente: ID,
    tipo,
    titulo,
    descripcion: descripcionDe(textoDe(item.description)),
    url,
    imagen: imagenDe(item),
    precio: parsearPrecio(precioTexto),
    precioTexto,
    unidad: precioTexto ? unidadDe(titulo) : null,
    transporte: tipo === 'vuelo' ? 'avion' : null,
    lugar: lugar ? { nombre: lugar } : null,
    etiquetas: [
      temperatura === null ? null : `temperatura:${temperatura}`,
      ...[item.category ?? []].flat().map((categoria) => textoPlano(textoDe(categoria))),
      comercio['@_name'],
    ].filter(Boolean),
    publicada: fechaIso(textoDe(item.pubDate)),
  });
}

/**
 * Convierte un feed RSS de Chollometro en ofertas, solo con las de viajes.
 * Las entradas que no se pueden interpretar se registran con `ctx.log` y se omiten.
 * @param {string} xml
 * @param {{log: (mensaje: string) => void}} ctx
 * @returns {import('../modelo.js').Oferta[]}
 */
export function parsear(xml, ctx) {
  const canal = parsearXml(xml, { arrays: ['item', 'category'] })?.rss?.channel;
  if (!canal) throw new Error('La respuesta no es un feed RSS (¿página de error o desafío anti-bot?)');
  return (canal.item ?? []).filter(esDeViajes).flatMap((item) => {
    try {
      return [ofertaDeItem(item)];
    } catch (error) {
      ctx.log(`Entrada omitida («${limpiarTitulo(textoDe(item.title))}»): ${error.message}`);
      return [];
    }
  });
}

// La misma oferta puede estar en los dos feeds: se queda la primera (la de «subiendo» lleva la temperatura).
function deduplicar(ofertas) {
  const vistas = new Set();
  return ofertas.filter((oferta) => !vistas.has(oferta.id) && vistas.add(oferta.id));
}

export default {
  id: ID,
  nombre: 'Chollometro',
  web: WEB,
  modo: 'feed',
  requiere: [],
  urls: URLS_FEEDS,
  async obtener(ctx) {
    const ofertas = [];
    const errores = [];
    for (const [indice, url] of URLS_FEEDS.entries()) {
      if (indice > 0) await ctx.http.esperar(PAUSA_MS);
      try {
        const xml = await ctx.http.texto(url, {
          cabeceras: { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
        });
        ofertas.push(...parsear(xml, ctx));
      } catch (error) {
        errores.push(error);
        ctx.log(`No se pudo leer ${url}: ${error.message}`);
      }
    }
    if (errores.length === URLS_FEEDS.length) {
      throw new Error(`No responde ningún feed de Chollometro: ${errores[0].message}`);
    }
    return { ofertas: deduplicar(ofertas) };
  },
};
