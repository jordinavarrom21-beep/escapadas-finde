/**
 * Weekendesk: escapadas de fin de semana con hotel (noches + desayuno, cena, spa…).
 * Sus páginas de temas son Next.js y traen los resultados (24 como máximo) en el
 * bloque `__NEXT_DATA__` que genera el servidor, así que no hace falta su API.
 *
 * La web está detrás de AWS WAF: solo se piden dos páginas fijas de Cataluña, con un
 * intervalo largo, y se deja de pedir a la primera señal de desafío o bloqueo.
 *
 * El precio (`sellPrice`) es el total de la escapada para los participantes que
 * indica la web (2 adultos por defecto) y todas las noches: «1 noche para 2 · Total 117 €».
 */
import { crearOferta } from '../modelo.js';
import { normalizarTexto, recortar } from '../util/xml.js';

const ID = 'weekendesk';
const WEB = 'https://www.weekendesk.es';
/**
 * `etiqueta` se añade a las ofertas de la página. Las ventas flash caben en una
 * página (catálogo completo de Cataluña); las baratas son solo las 24 primeras.
 */
const PAGINAS = [
  { url: `${WEB}/tema/2v90/escapadas-fin-de-semana-Cataluna-Venta_flash`, etiqueta: 'Venta flash' },
  { url: `${WEB}/tema/13z8/escapadas-fin-de-semana-Cataluna-Fin_de_semana_barato`, etiqueta: 'Escapada barata' },
];
const PAUSA_MS = 2000;

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const DESAFIO = /awswaf|gokuProps|AwsWafIntegration|challenge\.js|cf-chl|just a moment|request blocked|access denied/i;
const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

const CODIGOS_PAIS = { 'España': 'ES', Francia: 'FR', Portugal: 'PT', Andorra: 'AD', Italia: 'IT' };

// Se comparan con el texto sin tildes y en minúsculas.
const REGIMENES = [
  [/todo incluido/, 'todo-incluido'],
  [/pension completa/, 'pension-completa'],
  [/media pension/, 'media-pension'],
  [/desayuno/, 'desayuno'],
];

// Temáticas de Weekendesk (`topTheme`) → temas del contrato. Las de temporada o
// marketing («Black Friday», «Navidad», «Última hora»…) no se traducen.
const TEMAS_POR_TEMATICA = [
  [/romantic|love room|san valentin/, 'romantico'],
  [/\bspa\b|relax|balneario|masaje|termal/, 'spa'],
  [/playa/, 'playa'],
  [/gastronom|gourmet|enoturismo|vino|bodega/, 'gastronomia'],
  [/ninos|familia/, 'familia'],
  [/montana|naturaleza|rural/, 'rural'],
  [/parques? tematico/, 'parques'],
  [/insolito|palacio|castillo|casonas|cortijo/, 'singular'],
  [/mascota|perro/, 'mascotas'],
  [/esqui|nieve|aventura/, 'aventura'],
  [/cultural|citytrip|ciudad/, 'ciudad'],
];

/**
 * Resultados crudos de una página de Weekendesk y el total de ofertas de la búsqueda,
 * o null si la página no trae `__NEXT_DATA__` (desafío anti-bot o cambio de la web).
 * @param {string} html
 * @returns {{resultados: object[], total: number} | null}
 */
export function datosDePagina(html) {
  const bloque = NEXT_DATA.exec(html)?.[1];
  if (!bloque) return null;
  const busqueda = JSON.parse(bloque).props?.pageProps?.initialState?.search;
  if (!Array.isArray(busqueda?.exactMatches)) throw new Error('__NEXT_DATA__ sin resultados de búsqueda (¿ha cambiado la página?)');
  const resultados = busqueda.exactMatches;
  return { resultados, total: busqueda.searchDetails?.totalCount ?? busqueda.resultsCount ?? resultados.length };
}

/**
 * Ofertas de una página de Weekendesk. Las caducadas o sin precio se ignoran y las
 * que no cumplen el contrato se registran y se descartan.
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @param {string[]} [etiquetasPagina] etiquetas que se añaden a todas las ofertas
 */
export function parsear(html, ctx = {}, etiquetasPagina = []) {
  const log = ctx.log ?? (() => {});
  const datos = datosDePagina(html);
  if (!datos) return [];
  return datos.resultados
    .filter((resultado) => !resultado.expiration?.expired && Number.isFinite(resultado.sellPrice))
    .flatMap((resultado) => {
      try {
        return [ofertaDe(resultado, etiquetasPagina)];
      } catch (error) {
        log(`Oferta descartada (${resultado.label ?? resultado.id}): ${error.message}`);
        return [];
      }
    });
}

function ofertaDe(resultado, etiquetasPagina) {
  if (!resultado.id || !resultado.uri) throw new Error('sin identificador o sin enlace');
  const { sellPrice: precio, refPrice: anterior, nights: noches = null, participants: personas = null } = resultado;
  const hotel = resultado.hotel ?? {};
  const rebajada = Number.isFinite(anterior) && anterior > precio;
  return crearOferta({
    id: `${ID}:${resultado.id}`,
    fuente: ID,
    tipo: 'escapada',
    titulo: limpiar(resultado.label),
    descripcion: recortar([descripcionHotel(hotel), ...(resultado.programIntro ?? [])].filter(Boolean).join(' · ')),
    url: new URL(resultado.uri, WEB).href,
    imagen: resultado.imageUrl ?? resultado.images?.[0]?.url ?? null,
    precio,
    precioTexto: `${EUROS.format(precio)} € en total${estancia(noches, personas)}`,
    unidad: { 1: 'pp', 2: 'total' }[personas] ?? null,
    precioAnterior: rebajada ? anterior : null,
    descuento: rebajada ? Math.round((1 - precio / anterior) * 100) : null,
    noches,
    regimen: regimenDe(resultado.headwords ?? []),
    temas: temasDe(resultado.topTheme ?? []),
    lugar: lugarDe(hotel.location?.label),
    etiquetas: etiquetasDe(resultado, hotel, etiquetasPagina),
  });
}

const limpiar = (texto = '') => String(texto).replace(/\s+/g, ' ').trim();

/** ' (1 noche para 2)' */
function estancia(noches, personas) {
  if (!noches || !personas) return '';
  return ` (${noches} ${noches === 1 ? 'noche' : 'noches'} para ${personas})`;
}

/** «Augusta Club & Spa (4*, 8,2/10 en 17 opiniones)» */
function descripcionHotel(hotel) {
  const nombre = limpiar(hotel.label);
  if (!nombre) return '';
  const detalles = [
    hotel.stars > 0 ? `${hotel.stars}*` : null,
    hotel.review?.count > 0 ? `${EUROS.format(hotel.review.average)}/10 en ${hotel.review.count} opiniones` : null,
  ].filter(Boolean);
  return detalles.length ? `${nombre} (${detalles.join(', ')})` : nombre;
}

function regimenDe(destacados) {
  const texto = normalizarTexto(destacados.join(' · '));
  return REGIMENES.find(([patron]) => patron.test(texto))?.[1] ?? null;
}

function temasDe(tematicas) {
  const texto = normalizarTexto(tematicas.join(' · '));
  return TEMAS_POR_TEMATICA.filter(([patron]) => patron.test(texto)).map(([, tema]) => tema);
}

/** 'Lloret de Mar, Cataluña, España' → {nombre: 'Lloret de Mar', region: 'Cataluña', pais: 'España', …} */
export function lugarDe(etiqueta) {
  const partes = limpiar(etiqueta).split(/\s*,\s*/).filter(Boolean);
  if (!partes.length) return null;
  const pais = partes.length > 1 ? partes.at(-1) : null;
  return {
    nombre: partes[0],
    region: partes.length > 2 ? partes.at(-2) : null,
    pais,
    codigoPais: CODIGOS_PAIS[pais] ?? null,
    lat: null,
    lon: null,
    iata: null,
  };
}

function etiquetasDe(resultado, hotel, etiquetasPagina) {
  const etiquetas = [
    ...etiquetasPagina,
    resultado.flashDeal ? 'Venta flash' : null,
    resultado.lastMinute ? 'Último minuto' : null,
    resultado.hasExtraNightDiscount ? 'Noche adicional con descuento' : null,
    resultado.cancellationPolicy?.freeCancellation ? 'Cancelación gratuita' : null,
    hotel.stars > 0 ? `Hotel ${hotel.stars}*` : null,
    ...(resultado.headwords ?? []),
  ];
  return [...new Set(etiquetas.filter(Boolean).map(limpiar))];
}

function leerPagina(html, pagina, ctx) {
  const datos = datosDePagina(html);
  if (!datos) {
    if (DESAFIO.test(html)) throw Object.assign(new Error('Weekendesk ha devuelto un desafío anti-bot (AWS WAF)'), { bloqueo: true });
    throw new Error('la página no trae __NEXT_DATA__ (¿ha cambiado la web?)');
  }
  const ofertas = parsear(html, ctx, [pagina.etiqueta]);
  if (!ofertas.length && datos.total > 0) throw new Error('hay resultados pero ninguna oferta válida (¿ha cambiado el formato?)');
  return { ofertas, completa: datos.total <= datos.resultados.length };
}

const esBloqueo = (error) => error.bloqueo || [403, 405, 429].includes(error.estado);

/** Une las ofertas repetidas entre páginas conservando la primera y sumando sus etiquetas. */
function unir(ofertas) {
  const porId = new Map();
  for (const oferta of ofertas) {
    const previa = porId.get(oferta.id);
    if (previa) previa.etiquetas = [...new Set([...previa.etiquetas, ...oferta.etiquetas])];
    else porId.set(oferta.id, oferta);
  }
  return [...porId.values()];
}

async function obtener(ctx) {
  const ofertas = [];
  const completas = [];
  let leidas = 0;
  let ultimoError = null;
  for (const [i, pagina] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      const leida = leerPagina(await ctx.http.texto(pagina.url), pagina, ctx);
      ofertas.push(...leida.ofertas);
      if (leida.completa) completas.push(pagina.etiqueta);
      leidas++;
    } catch (error) {
      ultimoError = error;
      ctx.log(`${pagina.url}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Weekendesk ha bloqueado o desafiado la petición: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de Weekendesk (último error: ${ultimoError.message})`);
  // Solo se borran las guardadas de las páginas leídas enteras (p. ej. ventas flash que ya han terminado).
  const reemplazar = completas.length ? (oferta) => oferta.etiquetas.some((e) => completas.includes(e)) : false;
  return { ofertas: unir(ofertas), reemplazar };
}

export default {
  id: ID,
  nombre: 'Weekendesk',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS.map((pagina) => pagina.url),
  obtener,
};
