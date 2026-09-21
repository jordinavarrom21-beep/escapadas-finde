/**
 * Civitatis: actividades (free tours, visitas guiadas, excursiones y entradas)
 * de los destinos cercanos a Barcelona. Cada página de destino se renderiza en
 * el servidor y trae el catálogo de ese destino en un bloque JSON-LD `ItemList`
 * (nombre, descripción, imagen, URL, precio, moneda y valoración); las tarjetas
 * que además vienen en el HTML añaden la duración y el precio tachado.
 *
 * Su robots.txt prohíbe las rutas que acaban en «/api/» y «/newApi/», que es de
 * donde la web saca el resto del listado al hacer scroll: solo se piden las
 * páginas de destino, una por destino y con 2 s de pausa.
 *
 * El precio es el «desde X €» de la web: lo que cuesta **una plaza** (una
 * persona) en la opción más barata de la actividad, impuestos incluidos, por lo
 * que la unidad es `pp`. Los free tours valen 0 € y se pagan con propina.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { extraerPrecio } from '../util/precio.js';
import { normalizarTexto, recortar, textoPlano } from '../util/xml.js';

const ID = 'civitatis';
const WEB = 'https://www.civitatis.com';
const PAUSA_MS = 2000;

/**
 * Destinos que se consultan, en orden: primero las ciudades y al final la Costa
 * Brava, que es un hub comarcal y repite actividades de las ciudades anteriores.
 * `lat`/`lon` son las del destino, puestas a mano; el `slug` es el de Civitatis
 * (Girona es «gerona»). Para añadir o quitar destinos, basta con tocar esta lista.
 */
const DESTINOS = [
  { slug: 'barcelona', nombre: 'Barcelona', region: 'Barcelona', lat: 41.3851, lon: 2.1734 },
  { slug: 'gerona', nombre: 'Girona', region: 'Girona', lat: 41.9794, lon: 2.8214 },
  { slug: 'tarragona', nombre: 'Tarragona', region: 'Tarragona', lat: 41.1189, lon: 1.2445 },
  { slug: 'sitges', nombre: 'Sitges', region: 'Barcelona', lat: 41.2372, lon: 1.8059 },
  { slug: 'costa-brava', nombre: 'Costa Brava', region: 'Girona', lat: 41.95, lon: 3.1667 },
];

const PAIS = 'España';
const CODIGO_PAIS = 'ES';

/** Productos globales (tarjetas eSIM, seguros…) que se cuelan en todos los destinos. */
const RUTA_GLOBAL = '/es/general/';

/** Palabras del título (ya sin tildes ni mayúsculas) que dejan claro el tema. */
const TEMAS_POR_PALABRA = [
  ['gastronomia', /\bcatas?\b|\bbodegas?\b|\bvinos?\b|\bcava\b|\bgastronom\w*\b|\btapas\b|\bpaella\b|\bcerveza\b|\bdegustacion\b|\benoturismo\b/],
  ['aventura', /\bkayak\b|\bbuceo\b|\bsnorkel\b|\bparasailing\b|\bmotos? de agua\b|\bglobo\b|\bquads?\b|\bbarranquismo\b|\bescalada\b|\bsenderismo\b|\brafting\b|\besqui\b|\bvia ferrata\b|\bpuenting\b|\bparapente\b/],
  ['parques', /\bportaventura\b|\bferrari land\b|\baqualeon\b|\baquopolis\b|\bacuario\b|\bzoo\b|\bparque acuatico\b/],
  // «familia» a secas no vale: media Barcelona es la Sagrada Familia.
  ['familia', /\bninos\b|\bfamiliar\w*\b|\ben familia\b|\bbusqueda del tesoro\b|\bjuego de pistas\b/],
  ['playa', /\bcatamaran\b|\bvelero\b|\bpaseo en barco\b|\bislas medas\b|\bcalas\b|\bplayas?\b/],
  ['rural', /\bmontserrat\b|\bgarrocha\b|\bvolcan\w*\b|\bparque natural\b|\bnaturaleza\b|\bpirineos?\b/],
  ['ciudad', /\bfree tour\b|\bvisita guiada\b|\btour guiado\b|\bcasco antiguo\b|\bbarrio\b|\bcentro historico\b|\bmuseos?\b|\bcatedral\b|\bciudad\b/],
];

const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|datadome|awswaf|access denied/i;
const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

const urlDestino = (destino) => `${WEB}/es/${destino.slug}/`;
const texto = (nodo) => nodo.text().replace(/\s+/g, ' ').trim();

/**
 * Actividades del bloque JSON-LD `ItemList` de una página de destino.
 * Lanza un error (marcado como bloqueo si es un desafío anti-bot) si no lo trae.
 * @param {string} html
 * @returns {object[]}
 */
export function actividadesDe(html) {
  const lista = bloquesJsonLd(html).find((bloque) => bloque['@type'] === 'ItemList');
  if (!lista) {
    if (DESAFIO.test(html)) throw Object.assign(new Error('Civitatis ha devuelto un desafío anti-bot'), { bloqueo: true });
    throw new Error('la página no trae el bloque ItemList de JSON-LD (¿ha cambiado la web?)');
  }
  return (lista.itemListElement ?? []).map((elemento) => elemento.item).filter(Boolean);
}

function bloquesJsonLd(html) {
  const $ = cheerio.load(html);
  return $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((script) => {
      try {
        return [JSON.parse($(script).text())].flat();
      } catch {
        return [];
      }
    });
}

/**
 * Duración y precio tachado de las tarjetas del HTML, por ruta de la actividad.
 * Solo vienen las primeras del listado; el resto de actividades se quedan sin estos datos.
 * @param {string} html
 * @returns {Map<string, {duracion: string, precioAnterior: number|null, descuento: number|null}>}
 */
export function extrasDeTarjetas(html) {
  const $ = cheerio.load(html);
  const extras = new Map();
  for (const tarjeta of $('article.comfort-card').toArray()) {
    const enlace = $(tarjeta).find('a._activity-link').attr('href');
    if (!enlace) continue;
    const precioAnterior = extraerPrecio(texto($(tarjeta).find('.comfort-card__price__old-text')));
    const descuento = Number.parseInt(texto($(tarjeta).find('.comfort-card__price__discount')).replace(/[^\d]/g, ''), 10);
    extras.set(new URL(enlace, WEB).pathname, {
      duracion: texto($(tarjeta).find('.comfort-card__feature._duration')),
      precioAnterior,
      descuento: Number.isFinite(descuento) ? descuento : null,
    });
  }
  return extras;
}

/**
 * Ofertas de una página de destino de Civitatis.
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @param {typeof DESTINOS[number]} destino
 * @returns {import('../modelo.js').Oferta[]}
 */
export function parsear(html, ctx = {}, destino) {
  const log = ctx.log ?? (() => {});
  const extras = extrasDeTarjetas(html);
  return actividadesDe(html).flatMap((actividad) => {
    try {
      if (!actividad.url) throw new Error('sin URL');
      const ruta = new URL(actividad.url, WEB).pathname;
      if (ruta.startsWith(RUTA_GLOBAL)) return [];
      return [ofertaDe(actividad, destino, ruta, extras.get(ruta))];
    } catch (error) {
      log(`Actividad descartada (${actividad?.name ?? actividad?.url}): ${error.message}`);
      return [];
    }
  });
}

function ofertaDe(actividad, destino, ruta, extra = {}) {
  const partes = ruta.split('/').filter(Boolean);
  const slug = partes.at(-1);
  if (!slug) throw new Error(`URL sin identificador: ${actividad.url}`);
  const enEuros = (actividad.offers?.priceCurrency ?? 'EUR') === 'EUR';
  const precio = enEuros ? numero(actividad.offers?.price) : null;
  const anterior = precio != null && extra.precioAnterior > precio ? extra.precioAnterior : null;
  const titulo = textoPlano(actividad.name ?? '');
  // La actividad puede ser de un pueblo del hub (Costa Brava): entonces las
  // coordenadas del destino no valen y las completa después geo.js.
  const enElDestino = partes[1] === destino.slug;
  return crearOferta({
    id: `${ID}:${destino.slug}:${slug}`,
    fuente: ID,
    tipo: 'actividad',
    titulo,
    descripcion: recortar(textoPlano(actividad.description ?? '')),
    url: `${WEB}${ruta}`,
    imagen: actividad.image ? new URL(actividad.image, WEB).href : null,
    precio,
    precioTexto: precioTextoDe(precio),
    unidad: precio == null ? null : 'pp',
    precioAnterior: anterior,
    descuento: anterior ? extra.descuento ?? Math.round((1 - precio / anterior) * 100) : null,
    temas: temasDe(titulo),
    valoracion: valoracionDe(actividad.aggregateRating),
    lugar: {
      nombre: textoPlano(actividad.location?.address?.addressLocality ?? '') || destino.nombre,
      region: destino.region,
      pais: PAIS,
      codigoPais: CODIGO_PAIS,
      lat: enElDestino ? destino.lat : null,
      lon: enElDestino ? destino.lon : null,
      iata: null,
    },
    etiquetas: [extra.duracion ? `Duración: ${extra.duracion}` : null, precio === 0 ? 'gratis' : null].filter(Boolean),
  });
}

const numero = (valor) => (Number.isFinite(valor) && valor >= 0 ? valor : null);

function precioTextoDe(precio) {
  if (precio == null) return '';
  return precio === 0 ? '¡Gratis!' : `desde ${EUROS.format(precio)} € por persona`;
}

/** Civitatis ya puntúa sobre 10 (`bestRating`), pero se normaliza por si cambia. */
function valoracionDe(valoracion) {
  const nota = Number(valoracion?.ratingValue);
  const mejor = Number(valoracion?.bestRating) || 10;
  const n = Number(valoracion?.reviewCount) || 0;
  if (!(nota > 0) || !(mejor > 0) || !n) return null;
  return { nota: Number(((nota * 10) / mejor).toFixed(1)), n };
}

function temasDe(titulo) {
  const normalizado = normalizarTexto(titulo);
  return TEMAS_POR_PALABRA.filter(([, patron]) => patron.test(normalizado)).map(([tema]) => tema);
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

/**
 * Pide una página por destino (5 peticiones con 2 s de pausa). Una actividad que
 * aparece en varios destinos se queda con la del primero, que es el más concreto.
 * Solo se reemplaza el catálogo de los destinos leídos bien en esta ejecución.
 */
async function obtener(ctx) {
  const porRuta = new Map();
  const destinosOk = new Set();
  let ultimoError = null;
  for (const [i, destino] of DESTINOS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      // Sin reintentos: ante un 429 lo correcto es esperar a la siguiente ejecución.
      const ofertas = parsear(await ctx.http.texto(urlDestino(destino), { reintentos: 0 }), ctx, destino);
      for (const oferta of ofertas) {
        const ruta = new URL(oferta.url).pathname;
        if (!porRuta.has(ruta)) porRuta.set(ruta, oferta);
      }
      destinosOk.add(destino.slug);
    } catch (error) {
      ultimoError = error;
      ctx.log(`${urlDestino(destino)}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Civitatis ha bloqueado o limitado las peticiones: no se piden más destinos en esta ejecución');
        break;
      }
    }
  }
  if (!destinosOk.size) throw new Error(`No se ha podido leer ningún destino de Civitatis (último error: ${ultimoError.message})`);
  return {
    ofertas: [...porRuta.values()],
    reemplazar: (oferta) => destinosOk.has(oferta.id?.split(':')[1]),
  };
}

export default {
  id: ID,
  nombre: 'Civitatis',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: DESTINOS.map(urlDestino),
  obtener,
};
