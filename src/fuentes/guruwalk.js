/**
 * GuruWalk: free tours a pie con guía local en las ciudades cercanas. Cada
 * página de ciudad se renderiza en el servidor e incluye sus tours destacados
 * como bloques JSON-LD de tipo `Event`, con nombre, descripción, imagen, URL,
 * precio, valoración media y número de opiniones.
 *
 * Su robots.txt prohíbe las rutas que acaban en «/api/» y la búsqueda
 * («/search»), que es de donde la web carga el resto de tours: solo se piden
 * las páginas de ciudad, una por ciudad y con 2 s de pausa.
 *
 * El precio es siempre 0: un free tour no tiene tarifa y se paga con una propina
 * voluntaria al guía al terminar. La unidad es `pp` porque la propina (y la
 * plaza que se reserva) son por persona.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { recortar, textoPlano } from '../util/xml.js';

const ID = 'guruwalk';
const WEB = 'https://www.guruwalk.com';
const PAUSA_MS = 2000;

/**
 * Ciudades que se consultan, con sus coordenadas puestas a mano. Para añadir o
 * quitar ciudades, basta con tocar esta lista (el `slug` es el de GuruWalk).
 */
const CIUDADES = [
  { slug: 'barcelona', nombre: 'Barcelona', region: 'Barcelona', lat: 41.3851, lon: 2.1734 },
  { slug: 'girona', nombre: 'Girona', region: 'Girona', lat: 41.9794, lon: 2.8214 },
  { slug: 'tarragona', nombre: 'Tarragona', region: 'Tarragona', lat: 41.1189, lon: 1.2445 },
  { slug: 'sitges', nombre: 'Sitges', region: 'Barcelona', lat: 41.2372, lon: 1.8059 },
];

const PAIS = 'España';
const CODIGO_PAIS = 'ES';

/** `/es/walks/564-free-tour-...` → «564», que es el id del tour en la web. */
const RUTA_TOUR = /\/walks\/(\d+)-/;

const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|datadome|awswaf|access denied/i;

const urlCiudad = (ciudad) => `${WEB}/es/${ciudad.slug}`;

/**
 * Tours (bloques JSON-LD de tipo `Event`) de una página de ciudad.
 * Lanza un error (marcado como bloqueo si es un desafío anti-bot) si no hay ninguno.
 * @param {string} html
 * @returns {object[]}
 */
export function toursDe(html) {
  const $ = cheerio.load(html);
  const tours = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((script) => {
      try {
        return [JSON.parse($(script).text())].flat();
      } catch {
        return [];
      }
    })
    .filter((bloque) => bloque?.['@type'] === 'Event');
  if (!tours.length) {
    if (DESAFIO.test(html)) throw Object.assign(new Error('GuruWalk ha devuelto un desafío anti-bot'), { bloqueo: true });
    throw new Error('la página no trae ningún tour en JSON-LD (¿ha cambiado la web?)');
  }
  return tours;
}

/**
 * Ofertas de una página de ciudad de GuruWalk.
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @param {typeof CIUDADES[number]} ciudad
 * @returns {import('../modelo.js').Oferta[]}
 */
export function parsear(html, ctx = {}, ciudad) {
  const log = ctx.log ?? (() => {});
  return toursDe(html).flatMap((tour) => {
    try {
      return [ofertaDe(tour, ciudad)];
    } catch (error) {
      log(`Tour descartado (${tour?.name ?? tour?.url}): ${error.message}`);
      return [];
    }
  });
}

function ofertaDe(tour, ciudad) {
  const idTour = RUTA_TOUR.exec(tour.url ?? '')?.[1];
  if (!idTour) throw new Error(`URL de tour no reconocida: ${tour.url}`);
  const precio = precioDe(tour.offers);
  return crearOferta({
    id: `${ID}:${ciudad.slug}:${idTour}`,
    fuente: ID,
    tipo: 'actividad',
    titulo: textoPlano(tour.name ?? ''),
    descripcion: recortar(textoPlano(tour.description ?? '')),
    url: urlLimpia(tour.url),
    imagen: tour.image ? new URL(tour.image, WEB).href : null,
    precio,
    precioTexto: precio === 0 ? 'Gratis (propina voluntaria)' : '',
    unidad: precio == null ? null : 'pp',
    temas: ['ciudad'],
    valoracion: valoracionDe(tour.aggregateRating),
    lugar: {
      nombre: ciudad.nombre,
      region: ciudad.region,
      pais: PAIS,
      codigoPais: CODIGO_PAIS,
      lat: ciudad.lat,
      lon: ciudad.lon,
      iata: null,
    },
    etiquetas: ['Free tour', ...(precio === 0 ? ['gratis'] : [])],
  });
}

/** Un free tour vale 0 €; si alguna vez llegara otra cosa, solo se acepta en euros. */
function precioDe(oferta) {
  const precio = Number(oferta?.price);
  const moneda = oferta?.priceCurrency ?? 'EUR';
  return Number.isFinite(precio) && precio >= 0 && moneda === 'EUR' ? precio : null;
}

/** GuruWalk puntúa sobre 5 estrellas; el contrato pide la nota sobre 10. */
function valoracionDe(valoracion) {
  const nota = Number(valoracion?.ratingValue);
  const mejor = Number(valoracion?.bestRating) || 5;
  const n = Number(valoracion?.reviewCount) || 0;
  if (!(nota > 0) || !(mejor > 0) || !n) return null;
  return { nota: Number(((nota * 10) / mejor).toFixed(1)), n };
}

function urlLimpia(url) {
  const limpia = new URL(url, WEB);
  limpia.search = '';
  limpia.hash = '';
  return limpia.href;
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

/**
 * Pide una página por ciudad (4 peticiones con 2 s de pausa). Solo se reemplaza
 * el catálogo de las ciudades leídas bien en esta ejecución.
 */
async function obtener(ctx) {
  const ofertas = [];
  const ciudadesOk = new Set();
  let ultimoError = null;
  for (const [i, ciudad] of CIUDADES.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      // Sin reintentos: ante un 429 lo correcto es esperar a la siguiente ejecución.
      ofertas.push(...parsear(await ctx.http.texto(urlCiudad(ciudad), { reintentos: 0 }), ctx, ciudad));
      ciudadesOk.add(ciudad.slug);
    } catch (error) {
      ultimoError = error;
      ctx.log(`${urlCiudad(ciudad)}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('GuruWalk ha bloqueado o limitado las peticiones: no se piden más ciudades en esta ejecución');
        break;
      }
    }
  }
  if (!ciudadesOk.size) throw new Error(`No se ha podido leer ninguna ciudad de GuruWalk (último error: ${ultimoError.message})`);
  return {
    ofertas,
    reemplazar: (oferta) => ciudadesOk.has(oferta.id?.split(':')[1]),
  };
}

export default {
  id: ID,
  nombre: 'GuruWalk',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: CIUDADES.map(urlCiudad),
  obtener,
};
