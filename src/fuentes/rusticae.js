/**
 * Rusticae: hoteles con encanto que están en oferta en sus páginas «Ofertas de último
 * minuto» y «Viajar entre semana» (hasta un 15 % de descuento; la web no publica
 * precios, así que `precio` es null). Las páginas temáticas de escapadas (románticas,
 * gastronómicas, con mascotas, rurales) no aportan hoteles: sirven para dar temas a
 * los que están en oferta.
 *
 * Cada página trae los hoteles en tarjetas y, con coordenadas, en el atributo
 * `data-ch-portal-map` (JSON). `parsearHoteles` une las dos cosas. Rusticae no tiene
 * robots.txt (redirige a la portada), así que no prohíbe nada.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { recortar, textoPlano } from '../util/xml.js';

const ID = 'rusticae';
const WEB = 'https://rusticae.es';
const CATEGORIAS = `${WEB}/hoteles-con-encanto`;
const PAGINAS_OFERTAS = [
  { url: `${CATEGORIAS}/alojamientos-ofertas-last-minute-ultima-hora-minuto`, etiqueta: 'Último minuto' },
  { url: `${CATEGORIAS}/alojamientos-viajar-ofertas-entre-semana`, etiqueta: 'Entre semana' },
];
const PAGINAS_TEMAS = [
  { url: `${CATEGORIAS}/hoteles-escapadas-romanticos-de-fin-de-semana`, etiqueta: 'Románticos', tema: 'romantico' },
  { url: `${CATEGORIAS}/hoteles-restaurante-gastronomicos`, etiqueta: 'Gastronómicos', tema: 'gastronomia' },
  { url: `${CATEGORIAS}/hoteles-casas-rurales-con-mascotas-y-que-admiten-perros`, etiqueta: 'Mascotas bienvenidas', tema: 'mascotas' },
  { url: `${CATEGORIAS}/hoteles-rurales-naturaleza`, etiqueta: 'Rurales y naturaleza', tema: 'rural' },
];
const PAUSA_MS = 2000;

const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha-delivery|access denied/i;
const CODIGOS_PAIS = { 'España': 'ES', Portugal: 'PT', Italia: 'IT', Marruecos: 'MA', Andorra: 'AD', Francia: 'FR' };

const limpiar = (texto = '') => String(texto).replace(/\s+/g, ' ').trim();
const numero = (valor) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : null);

/** '/hotel/finca-el-pao' → 'finca-el-pao' (identificador estable del hotel). */
function slugDe(enlace) {
  return enlace ? new URL(enlace, WEB).pathname.match(/^\/hotel\/([^/]+)/)?.[1] ?? null : null;
}

/**
 * Hoteles de una página de categoría de Rusticae, uniendo las tarjetas (ubicación,
 * imagen grande) con el JSON del mapa (coordenadas), sin repetidos.
 * @param {string} html
 * @returns {{slug: string, titulo: string, texto: string, imagen: string|null, ubicacion: string, lat: number|null, lon: number|null}[]}
 */
export function parsearHoteles(html) {
  const $ = cheerio.load(html);
  const hoteles = new Map();
  const hotel = (slug) => {
    if (!hoteles.has(slug)) hoteles.set(slug, { slug, titulo: '', texto: '', imagen: null, ubicacion: '', lat: null, lon: null });
    return hoteles.get(slug);
  };

  $('.uk-card a[href^="/hotel/"]').each((_, elemento) => {
    const tarjeta = $(elemento);
    const slug = slugDe(tarjeta.attr('href'));
    if (!slug) return;
    const datos = hotel(slug);
    datos.titulo = limpiar(tarjeta.find('h3').text());
    datos.texto = textoPlano(tarjeta.find('.uk-text-small').html() ?? '');
    datos.imagen = tarjeta.find('img').attr('data-src') || tarjeta.find('img').attr('src') || null;
    datos.ubicacion = limpiar(tarjeta.find('.fa-map-marker').parent().text());
  });

  const mapa = $('[data-ch-portal-map]').attr('data-ch-portal-map');
  for (const punto of mapa ? JSON.parse(mapa) : []) {
    const slug = slugDe(punto.link);
    if (!slug) continue;
    const datos = hotel(slug);
    datos.titulo ||= limpiar(punto.title);
    datos.texto ||= textoPlano(punto.short_text ?? '');
    datos.imagen ||= punto.photo || null;
    datos.lat = numero(punto.latitude);
    datos.lon = numero(punto.longitude);
  }
  return [...hoteles.values()].filter((datos) => datos.titulo);
}

/**
 * Condición de la oferta según la cabecera de la página: «Hasta −15 % (Ofertas de última hora)».
 * @param {string} html
 */
export function condicionDe(html) {
  const $ = cheerio.load(html);
  const titulo = limpiar($('.tm-intro h1').first().text() || $('h1').first().text());
  const porcentaje = limpiar($('.tm-intro').text()).match(/hasta un (\d+)\s?%/i)?.[1];
  if (!porcentaje) return titulo;
  return titulo ? `Hasta −${porcentaje} % (${titulo})` : `Hasta −${porcentaje} %`;
}

/**
 * 'Jerte, Cáceres, Extremadura, España' → {nombre: 'Jerte', region: 'Extremadura', pais: 'España', …}.
 * Sin ubicación, el lugar se queda con las coordenadas y el nombre del hotel.
 */
export function lugarDe({ ubicacion, lat, lon, titulo }) {
  const partes = ubicacion.split(/\s*,\s*/).filter(Boolean);
  const pais = partes.find((parte) => CODIGOS_PAIS[parte]) ?? null;
  const resto = partes.filter((parte) => parte !== pais);
  if (!resto.length && lat == null) return null;
  return {
    nombre: resto[0] ?? titulo,
    region: resto.length > 1 ? resto.at(-1) : null,
    pais,
    codigoPais: CODIGOS_PAIS[pais] ?? null,
    lat,
    lon,
    iata: null,
  };
}

/**
 * Ofertas (tipo hotel, sin precio) de una página de ofertas de Rusticae.
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @param {string[]} [etiquetasPagina]
 */
export function parsear(html, ctx = {}, etiquetasPagina = []) {
  const log = ctx.log ?? (() => {});
  const condicion = condicionDe(html);
  return parsearHoteles(html).flatMap((datos) => {
    try {
      return [ofertaDe(datos, condicion, etiquetasPagina)];
    } catch (error) {
      log(`Hotel descartado (${datos.titulo || datos.slug}): ${error.message}`);
      return [];
    }
  });
}

function ofertaDe(datos, condicion, etiquetasPagina) {
  const soloAdultos = /solo (para )?adultos/i.test(datos.texto);
  return crearOferta({
    id: `${ID}:${datos.slug}`,
    fuente: ID,
    tipo: 'hotel',
    titulo: datos.titulo,
    descripcion: recortar(datos.texto.replace(/^hotel solo (para )?adultos\s*/i, '')),
    url: `${WEB}/hotel/${datos.slug}`,
    imagen: datos.imagen ? new URL(datos.imagen, WEB).href : null,
    precio: null,
    precioTexto: condicion,
    lugar: lugarDe(datos),
    etiquetas: [...etiquetasPagina, soloAdultos ? 'Solo adultos' : null].filter(Boolean),
  });
}

/** Une las ofertas de un mismo hotel que sale en varias páginas de ofertas. */
function unir(ofertas) {
  const porId = new Map();
  for (const oferta of ofertas) {
    const previa = porId.get(oferta.id);
    if (!previa) {
      porId.set(oferta.id, oferta);
      continue;
    }
    previa.etiquetas = [...new Set([...previa.etiquetas, ...oferta.etiquetas])];
    if (oferta.precioTexto && !previa.precioTexto.includes(oferta.precioTexto)) {
      previa.precioTexto = [previa.precioTexto, oferta.precioTexto].filter(Boolean).join(' · ');
    }
  }
  return [...porId.values()];
}

/** Añade el tema y la etiqueta de una página temática a las ofertas de sus hoteles. */
export function aplicarTema(ofertas, html, { tema, etiqueta }) {
  const slugs = new Set(parsearHoteles(html).map((datos) => datos.slug));
  for (const oferta of ofertas) {
    if (!slugs.has(oferta.id.slice(ID.length + 1))) continue;
    oferta.temas = [...new Set([...oferta.temas, tema])];
    oferta.etiquetas = [...new Set([...oferta.etiquetas, etiqueta])];
  }
  return slugs.size;
}

function comprobarPagina(html, hoteles) {
  if (hoteles > 0) return;
  if (DESAFIO.test(html)) throw Object.assign(new Error('Rusticae ha devuelto un desafío anti-bot'), { bloqueo: true });
  throw new Error('no se ha encontrado ningún hotel (¿ha cambiado la página?)');
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

async function obtener(ctx) {
  const ofertas = [];
  let leidas = 0;
  let bloqueada = false;
  let ultimoError = null;
  let pedidas = 0;
  const pedir = async (url) => {
    if (pedidas++) await ctx.http.esperar(PAUSA_MS);
    return ctx.http.texto(url);
  };
  const fallo = (url, error) => {
    ultimoError = error;
    ctx.log(`${url}: ${error.message}`);
    if (esBloqueo(error)) {
      bloqueada = true;
      ctx.log('Rusticae ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
    }
  };

  for (const pagina of PAGINAS_OFERTAS) {
    if (bloqueada) break;
    try {
      const html = await pedir(pagina.url);
      const nuevas = parsear(html, ctx, [pagina.etiqueta]);
      comprobarPagina(html, nuevas.length);
      ofertas.push(...nuevas);
      leidas++;
    } catch (error) {
      fallo(pagina.url, error);
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de ofertas de Rusticae (último error: ${ultimoError.message})`);

  const unidas = unir(ofertas);
  for (const pagina of PAGINAS_TEMAS) {
    if (bloqueada) break;
    try {
      const html = await pedir(pagina.url);
      comprobarPagina(html, aplicarTema(unidas, html, pagina));
    } catch (error) {
      fallo(pagina.url, error);
    }
  }
  return { ofertas: unidas, reemplazar: leidas === PAGINAS_OFERTAS.length };
}

export default {
  id: ID,
  nombre: 'Rusticae',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: [...PAGINAS_OFERTAS, ...PAGINAS_TEMAS].map((pagina) => pagina.url),
  obtener,
};
