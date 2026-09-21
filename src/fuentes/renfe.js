/**
 * Renfe: su página «Ofertas y Promociones», que sí llega servida en HTML (AEM, con
 * los datos en los atributos de las tarjetas `rf-card`). Es una sola petición.
 *
 * Renfe **no publica precios «desde» por ruta en HTML**: las páginas de ruta
 * (/inspirate/rutas/barcelona-girona y compañía) traen el texto de la ciudad pero
 * piden la tarifa al buscador de billetes, que está protegido; por eso no se toca.
 * Lo que queda, y es lo que interesa, son las promociones: cada tarjeta trae el
 * descuento que anuncia la web («15% de descuento en tu billete de tren AVE…»).
 *
 * Por eso casi todas las ofertas de esta fuente van con `precio: null` y el
 * descuento en `descuento`: es el **porcentaje que encabeza la tarjeta**, tal y como
 * lo escribe Renfe (unas veces sobre el billete de tren y otras sobre la entrada de
 * un museo o un festival, que es la letra pequeña que queda en `descripcion`). Si
 * alguna tarjeta llega a dar un precio («desde 7 €»), se guarda tal cual, sin
 * suponerle unidad, porque el texto no dice si es por trayecto o por viaje.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { parsearPrecio } from '../util/precio.js';
import { normalizarTexto, recortar, textoPlano } from '../util/xml.js';

const ID = 'renfe';
const WEB = 'https://www.renfe.com';
const PROMOCIONES = `${WEB}/es/es/inspirate/experiencias/ofertas-y-promociones`;

/** Secciones de la página → temas del contrato. */
const TEMAS_POR_SECCION = {
  'museos y exposiciones': ['ciudad'],
  'teatro, espectaculos y mas': ['ciudad'],
  festivales: ['eventos'],
  'fiestas populares': ['eventos'],
  'eventos deportivos': ['eventos'],
  'parques tematicos': ['parques'],
  'gastronomia y enoturismo': ['gastronomia'],
  playas: ['playa'],
  naturaleza: ['rural'],
};

const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|datadome|awswaf|access denied/i;
/** «hasta un 90% de descuento» → 90. Se queda con el primero: es el que encabeza la tarjeta. */
const PORCENTAJE = /(\d{1,3})\s*%/;
/** Solo se acepta un precio si la tarjeta dice «desde X €»; cualquier otro importe es letra pequeña. */
const PRECIO_DESDE = /desde\s+(?:solo\s+)?([\d.,]+)\s*€/i;
const CODIGO = /c[óo]digo:?\s*([A-ZÁÉÍÓÚÑ0-9]{4,})/;
/** «Centro Botín. Santander» → «Santander»: las tarjetas ponen la ciudad detrás de un punto. */
const CIUDAD_TRAS_PUNTO = /\.\s*([\p{Lu}][\p{L}·'’\s-]{2,30})$/u;
const CIUDAD_DESTINO = /\bdestino\s+([\p{Lu}][\p{L}·'’\s-]{2,30})/u;

const limpiar = (texto = '') => textoPlano(texto).replace(/\s+/g, ' ').trim();
const slug = (texto) => normalizarTexto(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Tarjetas de promoción de la página, con la sección en la que está cada una.
 * Devuelve null si la página no trae ninguna tarjeta.
 * @param {string} html
 * @returns {{titulo: string, texto: string, seccion: string, url: string, imagen: string|null}[] | null}
 */
export function promociones(html) {
  const $ = cheerio.load(html);
  const nodos = $('h2, rf-slider[text-title], rf-card').get();
  if (!nodos.some((nodo) => nodo.tagName === 'rf-card')) return null;
  let seccion = '';
  const tarjetas = [];
  for (const nodo of nodos) {
    const $nodo = $(nodo);
    if (nodo.tagName !== 'rf-card') {
      seccion = limpiar(nodo.tagName === 'h2' ? $nodo.text() : $nodo.attr('text-title'));
      continue;
    }
    tarjetas.push({
      titulo: limpiar($nodo.attr('text-title')),
      texto: limpiar($nodo.attr('text-subtitle')),
      seccion,
      url: absoluta($nodo.attr('link')),
      imagen: absoluta($nodo.attr('link-image')) || null,
    });
  }
  return tarjetas;
}

function absoluta(enlace) {
  if (!enlace || enlace === '#') return '';
  try {
    const url = new URL(enlace, WEB);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

/**
 * Ofertas de la página de promociones de Renfe, o null si no trae tarjetas
 * (desafío anti-bot o cambio de la web).
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const tarjetas = promociones(html);
  if (!tarjetas) return null;
  return tarjetas.flatMap((tarjeta) => {
    try {
      return [ofertaDe(tarjeta)];
    } catch (error) {
      log(`Promoción descartada (${tarjeta.titulo || 'sin título'}): ${error.message}`);
      return [];
    }
  });
}

function ofertaDe(tarjeta) {
  if (!tarjeta.titulo || !tarjeta.url) throw new Error('sin título o sin enlace');
  const descuento = porcentaje(tarjeta.texto);
  const precio = parsearPrecio(PRECIO_DESDE.exec(tarjeta.texto)?.[1]);
  if (descuento == null && precio == null) throw new Error('no anuncia ni precio ni descuento');
  const lugar = ciudadDe(tarjeta);
  return crearOferta({
    id: `${ID}:promo:${slug(tarjeta.titulo)}`,
    fuente: ID,
    tipo: 'escapada',
    titulo: tarjeta.titulo,
    descripcion: recortar(tarjeta.texto),
    url: tarjeta.url,
    imagen: tarjeta.imagen,
    precio,
    precioTexto: precio != null ? `desde ${precio} €` : descuento != null ? `${descuento} % de descuento` : '',
    unidad: null,
    descuento,
    transporte: 'tren',
    temas: TEMAS_POR_SECCION[normalizarTexto(tarjeta.seccion)] ?? [],
    lugar: lugar ? { nombre: lugar, region: null, pais: 'España', codigoPais: 'ES', lat: null, lon: null, iata: null } : null,
    etiquetas: etiquetasDe(tarjeta),
  });
}

function porcentaje(texto) {
  const valor = Number(PORCENTAJE.exec(texto)?.[1]);
  return valor > 0 && valor <= 100 ? valor : null;
}

/** Ciudad de la promoción: la del final del título o la que marca «destino X» en el texto. */
function ciudadDe({ titulo, texto }) {
  const encontrada = CIUDAD_TRAS_PUNTO.exec(titulo)?.[1] ?? CIUDAD_DESTINO.exec(texto)?.[1];
  return encontrada ? encontrada.replace(/\s+/g, ' ').trim() : null;
}

function etiquetasDe(tarjeta) {
  const codigo = CODIGO.exec(tarjeta.texto)?.[1];
  return ['Renfe', 'promoción', tarjeta.seccion, codigo ? `Código ${codigo}` : null].filter(Boolean);
}

/** La página es la lista completa de promociones vigentes: lo que ya no sale, ha caducado. */
async function obtener(ctx) {
  const html = await ctx.http.texto(PROMOCIONES, { reintentos: 0 });
  const ofertas = parsear(html, ctx);
  if (!ofertas) {
    throw new Error(DESAFIO.test(html)
      ? 'Renfe ha devuelto un desafío anti-bot'
      : 'La página de ofertas y promociones de Renfe no trae ninguna tarjeta (¿ha cambiado la web?)');
  }
  if (!ofertas.length) throw new Error('Ninguna promoción de Renfe anuncia precio ni descuento');
  return { ofertas, reemplazar: true };
}

export default {
  id: ID,
  nombre: 'Renfe',
  web: PROMOCIONES,
  modo: 'html',
  requiere: [],
  urls: [PROMOCIONES],
  obtener,
};
