/**
 * Escapadas de Atrápalo (hotel + extras: cena, spa, visitas…). La página
 * /escapadas/ se renderiza en el servidor con Next.js y trae los datos en el
 * JSON `__NEXT_DATA__`: id, título, precio, precio anterior, % de descuento,
 * destino y categoría. `?page=N` devuelve las N × 20 primeras ordenadas por
 * precio, con un máximo de 100 por petición: primero se piden las 100 más
 * baratas de todo el catálogo y después las de las provincias catalanas, que
 * completan las cercanas más caras y aportan la provincia de cada una.
 *
 * El precio es «desde X € por persona» por la escapada completa (normalmente
 * una noche con los extras; más si el título lo indica), impuestos incluidos.
 */
import { crearOferta } from '../modelo.js';
import { normalizarTexto, recortar, textoPlano } from '../util/xml.js';

const ID = 'atrapalo';
const WEB = 'https://www.atrapalo.com';
const LISTADO = `${WEB}/escapadas/`;
/** 5 páginas de 20 = 100 escapadas, lo máximo que devuelve el servidor de una vez. */
const PAGINA = 5;
/** Atrápalo (Fastly) responde 429 enseguida si se le piden muchas páginas en poco tiempo. */
const PAUSA_MS = 4000;

/** Provincias cercanas, con el filtro `region_id` que usa la web. */
const ZONAS = [
  { region: 'Barcelona', pais: 'España', filtro: 'region_id=6' },
  { region: 'Girona', pais: 'España', filtro: 'region_id=54' },
  { region: 'Tarragona', pais: 'España', filtro: 'region_id=52' },
  { region: 'Lleida', pais: 'España', filtro: 'region_id=53' },
];

const PAGINAS = [
  { zona: null, url: `${LISTADO}?page=${PAGINA}` },
  ...ZONAS.map((zona) => ({ zona, url: `${LISTADO}?${zona.filtro}&page=${PAGINA}` })),
];

/** Categorías de la web → temas del contrato. */
const TEMAS_POR_CATEGORIA = {
  relax: ['spa'],
  balneario: ['spa'],
  romantica: ['romantico'],
  'aventura y emocion': ['aventura'],
  'explorar culturas y sabores': ['ciudad', 'gastronomia'],
  'gastronomia y degustacion': ['gastronomia'],
  'cultura y patrimonio': ['ciudad'],
  'parques tematicos': ['parques'],
  paradores: ['singular'],
};

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|datadome|awswaf|_abck|access denied/i;
const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/**
 * Escapadas y total de resultados del JSON `__NEXT_DATA__` de una página de listado.
 * Lanza un error (marcado como bloqueo si es un desafío anti-bot) si no lo encuentra.
 * @param {string} html
 * @returns {{escapadas: object[], total: number}}
 */
export function datosDePagina(html) {
  const json = NEXT_DATA.exec(html)?.[1];
  if (!json) {
    if (DESAFIO.test(html)) throw Object.assign(new Error('Atrápalo ha devuelto un desafío anti-bot'), { bloqueo: true });
    throw new Error('la página no trae __NEXT_DATA__ (¿ha cambiado la web?)');
  }
  const props = JSON.parse(json).props?.pageProps ?? {};
  if (!Array.isArray(props.escapadas)) throw new Error('__NEXT_DATA__ sin la lista de escapadas (¿ha cambiado la web?)');
  return { escapadas: props.escapadas, total: Number(props.filteredTotal) || props.escapadas.length };
}

/**
 * Ofertas de una página de listado de escapadas.
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @param {{region: string, pais: string}|null} [zona] zona filtrada en la página, si la hay
 */
export function parsear(html, ctx = {}, zona = null) {
  return ofertasDe(datosDePagina(html).escapadas, zona, ctx.log ?? (() => {}));
}

function ofertasDe(escapadas, zona, log) {
  return escapadas.flatMap((escapada) => {
    try {
      return [ofertaDe(escapada, zona)];
    } catch (error) {
      log(`Escapada ${escapada.id ?? '(sin id)'} descartada: ${error.message}`);
      return [];
    }
  });
}

const numero = (valor) => (Number.isFinite(valor) && valor > 0 ? valor : null);

function ofertaDe(escapada, zona) {
  const categoria = textoPlano(escapada.categoryName ?? '');
  const destino = textoPlano(escapada.destinationName ?? '');
  const enEuros = (escapada.currency ?? 'EUR') === 'EUR';
  const precio = enEuros ? numero(escapada.price) : null;
  const original = enEuros ? numero(escapada.originalPrice) : null;
  const anterior = precio != null && original > precio ? original : null;
  return crearOferta({
    id: `${ID}:${escapada.id}`,
    fuente: ID,
    tipo: 'escapada',
    titulo: textoPlano(escapada.title ?? ''),
    descripcion: recortar(textoPlano(escapada.shortDescription ?? '') || [destino, categoria].filter(Boolean).join(' · ')),
    url: limpiarUrl(escapada.url, escapada.slug),
    imagen: escapada.imageUrl ? new URL(escapada.imageUrl, WEB).href : null,
    precio,
    precioTexto: precio == null ? '' : `desde ${EUROS.format(precio)} € por persona`,
    unidad: precio == null ? null : 'pp',
    precioAnterior: anterior,
    descuento: anterior ? numero(escapada.discount) ?? Math.round((1 - precio / anterior) * 100) : null,
    temas: TEMAS_POR_CATEGORIA[normalizarTexto(categoria)] ?? [],
    lugar: destino
      ? { nombre: destino, region: zona?.region ?? null, pais: zona?.pais ?? null, lat: null, lon: null }
      : null,
    etiquetas: etiquetasDe(escapada, categoria),
  });
}

function limpiarUrl(url, slug) {
  const limpia = new URL(url || (slug ? `/escapadas/${slug}` : ''), WEB);
  limpia.search = '';
  limpia.hash = '';
  return limpia.href;
}

function etiquetasDe(escapada, categoria) {
  const etiquetas = [categoria];
  if (escapada.isFeatured) etiquetas.push('Destacada');
  if (escapada.isTopSeller) etiquetas.push('Más vendida');
  if (escapada.isPromoted) etiquetas.push('Promocionada');
  if (escapada.isFeatured || escapada.isTopSeller) etiquetas.push('top-chollo');
  return etiquetas.filter(Boolean);
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

/**
 * Pide el listado general y las provincias cercanas (5 peticiones con 4 s de pausa).
 * Si una escapada sale en varias páginas, se queda la de su provincia (lleva la región).
 * Solo reemplaza el catálogo completo si el listado general cabe en una página;
 * si no, reemplaza las ofertas de las zonas leídas enteras.
 */
async function obtener(ctx) {
  const porId = new Map();
  const zonasCompletas = new Set();
  let catalogoCompleto = false;
  let leidas = 0;
  let ultimoError = null;
  for (const [i, { zona, url }] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      // Sin reintentos: ante un 429 lo correcto es esperar a la siguiente ejecución.
      const { escapadas, total } = datosDePagina(await ctx.http.texto(url, { reintentos: 0 }));
      for (const oferta of ofertasDe(escapadas, zona, ctx.log)) porId.set(oferta.id, oferta);
      leidas++;
      const completa = escapadas.length >= total;
      if (completa && zona) zonasCompletas.add(zona.region);
      if (completa && !zona) catalogoCompleto = true;
    } catch (error) {
      ultimoError = error;
      ctx.log(`${url}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Atrápalo ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de escapadas de Atrápalo (último error: ${ultimoError.message})`);
  const ofertas = [...porId.values()];
  if (!ofertas.length) throw new Error('Atrápalo no ha devuelto ninguna escapada válida');
  return {
    ofertas,
    reemplazar: catalogoCompleto || ((oferta) => zonasCompletas.has(oferta.lugar?.region)),
  };
}

export default {
  id: ID,
  nombre: 'Atrápalo',
  web: LISTADO,
  modo: 'html',
  requiere: [],
  urls: PAGINAS.map((pagina) => pagina.url),
  obtener,
};
