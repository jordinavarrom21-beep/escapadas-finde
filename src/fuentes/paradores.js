/**
 * Promociones de Paradores (/es/ofertas, Drupal): descuentos sobre la tarifa
 * del Parador (Precio de Amigo −5 %, 2 noches en media pensión, no reembolsable…)
 * y paquetes (Fin de Año, golf, spa). El listado no publica precios: cada
 * promoción lleva `precio: null` y, cuando la web lo indica, el % de descuento.
 * Se descartan los canjes de puntos del Club Amigo, que no son ofertas que se
 * puedan reservar. Cada tarjeta es un nodo de Drupal (`data-nid`, id estable).
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { recortar } from '../util/xml.js';

const ID = 'paradores';
const WEB = 'https://www.paradores.es';
const LISTADO = `${WEB}/es/ofertas`;
/** El listado tiene hoy 2 páginas (?page=0 y ?page=1); se leen como mucho 3. */
const MAX_PAGINAS = 3;
const URLS = Array.from({ length: MAX_PAGINAS }, (_, i) => (i ? `${LISTADO}?page=${i}` : LISTADO));
const PAUSA_MS = 2000;

/** Bloque «Nuestras ofertas destacadas», que repite en cada página algunas del listado. */
const BLOQUE_DESTACADAS = 'block-views-blockofertas-y-experiencias-block-2';
const CANJE_PUNTOS = /\bpuntos\b/i;
/** Condiciones que se repiten en todas las promociones y no aportan nada. */
const CONDICION_GENERICA = /para beneficiar|no es acumulable|calendario de aplicaci|precios consignados|precios con impuestos/i;
/** «Parador de La Palma», «Parador de Sos del Rey Católico»… */
const PARADOR_CONCRETO = /\bParador (?:de|del) ((?:\p{Lu}[\p{L}'’-]*)(?:\s+(?:(?:de|del|la|las|los|el|y)\s+)?\p{Lu}[\p{L}'’-]*)*)/u;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|datadome|awswaf|access denied/i;

const limpiar = (texto = '') => texto.replace(/\s+/g, ' ').trim();

/**
 * Promociones de una página del listado, sin repetidas (las destacadas llevan
 * la etiqueta `top-chollo`).
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const $ = cheerio.load(html);
  const destacadas = new Set(
    $(`.${BLOQUE_DESTACADAS} .views-row[data-nid]`).get().map((fila) => $(fila).attr('data-nid')),
  );
  const porNid = new Map();
  for (const fila of $('.views-row[data-nid]').get()) {
    const nid = $(fila).attr('data-nid');
    if (porNid.has(nid)) continue;
    const datos = datosDeTarjeta($, $(fila), nid, destacadas.has(nid));
    if (CANJE_PUNTOS.test(datos.titulo)) continue;
    try {
      porNid.set(nid, ofertaDe(datos));
    } catch (error) {
      log(`Promoción ${nid} descartada: ${error.message}`);
    }
  }
  return [...porNid.values()];
}

/** Número de páginas del listado según el paginador (1 si no hay). */
export function numeroDePaginas(html) {
  const ultima = cheerio.load(html)('.pager-nav a[rel="last"]').attr('href');
  const indice = Number(new URLSearchParams(ultima?.split('?')[1] ?? '').get('page'));
  return Number.isInteger(indice) && indice > 0 ? indice + 1 : 1;
}

function datosDeTarjeta($, tarjeta, nid, destacada) {
  const enlace = tarjeta.find('h3 a').first();
  return {
    nid,
    titulo: limpiar(enlace.text()),
    href: enlace.attr('href') ?? tarjeta.find('a[href^="/"]').first().attr('href'),
    descripcion: limpiar(tarjeta.find('.wrapper-text .description').first().text()),
    condiciones: tarjeta.find('.description-modal li, .description-modal p').get()
      .map((elemento) => limpiar($(elemento).text()))
      .filter((texto) => texto && !CONDICION_GENERICA.test(texto)),
    descuento: Number(limpiar(tarjeta.find('.wrapper-descuento .top').text()).match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1].replace(',', '.')) || null,
    exclusiva: limpiar(tarjeta.find('.wrapper-exclusiva').text()),
    imagen: tarjeta.find('img').first().attr('src') ?? null,
    destacada,
  };
}

function ofertaDe(datos) {
  if (!datos.href) throw new Error('sin enlace');
  const url = new URL(datos.href, WEB);
  url.search = '';
  const parador = paradorDe(datos);
  const condiciones = datos.condiciones.join(' ');
  return crearOferta({
    id: `${ID}:${datos.nid}`,
    fuente: ID,
    tipo: 'hotel',
    titulo: datos.titulo,
    descripcion: recortar(limpiar(`${datos.descripcion} ${condiciones ? `Condiciones: ${condiciones}` : ''}`)),
    url: url.href,
    imagen: datos.imagen ? new URL(datos.imagen, WEB).href : null,
    precio: null,
    precioTexto: datos.descuento ? `${datos.descuento} % de descuento` : '',
    descuento: datos.descuento,
    temas: ['singular'],
    lugar: parador ? { nombre: parador, region: null, pais: 'España', lat: null, lon: null } : null,
    etiquetas: [
      datos.exclusiva && 'Exclusiva Amigos de Paradores',
      datos.destacada && 'Destacada',
      datos.destacada && 'top-chollo',
    ].filter(Boolean),
  });
}

/**
 * Parador concreto de la promoción («… en el Parador de Ibiza»), buscado en el
 * título, la descripción y, si no, el nombre de la imagen; null si es general.
 */
export function paradorDe({ titulo = '', descripcion = '', imagen = null }) {
  const archivo = imagen ? decodificar(new URL(imagen, WEB).pathname.split('/').pop()).replace(/[\d\s_-]*\.\w+$/, '') : '';
  for (const texto of [titulo, descripcion, archivo]) {
    const nombre = PARADOR_CONCRETO.exec(texto.normalize('NFC'))?.[1];
    if (nombre) return nombre;
  }
  return null;
}

function decodificar(texto) {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

function leerPagina(html, ctx) {
  const ofertas = parsear(html, ctx);
  if (ofertas.length) return ofertas;
  if (DESAFIO.test(html)) throw Object.assign(new Error('Paradores ha devuelto un desafío anti-bot'), { bloqueo: true });
  throw new Error('no se ha encontrado ninguna promoción (¿ha cambiado la página?)');
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

async function obtener(ctx) {
  const primera = await ctx.http.texto(URLS[0]).catch((error) => {
    throw new Error(`No se ha podido leer el listado de ofertas de Paradores: ${error.message}`);
  });
  const ofertas = new Map(leerPagina(primera, ctx).map((oferta) => [oferta.id, oferta]));
  const paginas = numeroDePaginas(primera);
  let completo = paginas <= MAX_PAGINAS;
  for (const url of URLS.slice(1, paginas)) {
    await ctx.http.esperar(PAUSA_MS);
    try {
      for (const oferta of leerPagina(await ctx.http.texto(url), ctx)) if (!ofertas.has(oferta.id)) ofertas.set(oferta.id, oferta);
    } catch (error) {
      completo = false;
      ctx.log(`${url}: ${error.message}`);
      if (esBloqueo(error)) break;
    }
  }
  if (paginas > MAX_PAGINAS) ctx.log(`El listado tiene ${paginas} páginas y solo se leen ${MAX_PAGINAS}`);
  return { ofertas: [...ofertas.values()], reemplazar: completo };
}

export default {
  id: ID,
  nombre: 'Paradores',
  web: LISTADO,
  modo: 'html',
  requiere: [],
  urls: URLS,
  obtener,
};
