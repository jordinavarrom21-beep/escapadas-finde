/**
 * Volotea: precios «desde» de su página de ofertas de vuelos, que el servidor
 * pinta en HTML (tarjetas «Destino · desde Origen · NN,NN € · Volver desde NN,NN €»).
 * Solo interesan las rutas con Barcelona, Girona o Reus: se leen de la página
 * general (vuelos que salen de esos aeropuertos) y de la página de vuelos a
 * Barcelona, cuyo precio «Volver desde» es el del trayecto Barcelona → origen.
 * Según la propia web, cada precio es «por trayecto, tasas incluidas».
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { parsearPrecio } from '../util/precio.js';
import { normalizarTexto } from '../util/xml.js';

const ID = 'volotea';
const WEB = 'https://www.volotea.com';
const PAGINA_GENERAL = `${WEB}/es/ofertas-vuelos/`;
const PAGINA_BARCELONA = `${WEB}/es/ofertas-vuelos/barcelona/`;
const PAGINAS = [PAGINA_GENERAL, PAGINA_BARCELONA];
const PAUSA_MS = 2000;

/** Aeropuertos de salida que se vigilan, por el nombre que usa Volotea. */
const ORIGENES = { barcelona: 'Barcelona', girona: 'Girona', gerona: 'Girona', reus: 'Reus' };

const CODIGOS_PAIS = {
  alemania: 'DE', argelia: 'DZ', austria: 'AT', belgica: 'BE', bulgaria: 'BG', chequia: 'CZ',
  croacia: 'HR', dinamarca: 'DK', espana: 'ES', francia: 'FR', grecia: 'GR', italia: 'IT',
  luxemburgo: 'LU', malta: 'MT', marruecos: 'MA', portugal: 'PT', 'reino unido': 'GB',
};

/**
 * País de las ciudades de Volotea que pueden faltar en la página general (muestra
 * como mucho 32 destinos por país). Solo se usa si la página no lo indica.
 */
const PAISES_CONOCIDOS = Object.fromEntries(Object.entries({
  Francia: 'Brest, Brive, Burdeos, Clermont-Ferrand Auvergne, Estrasburgo, Lille, Limoges, Lyon, Marsella, Montpellier, Nantes, Niza, Rennes, Rodez-Aveyron, Toulouse',
  Italia: 'Ancona, Bari, Bolonia, Catania, Florencia, Milán (Bérgamo), Nápoles, Olbia, Palermo, Pisa, Turín, Venecia, Verona',
  España: 'A Coruña, Alicante, Asturias, Bilbao, Granada, Jerez (Cádiz), Lanzarote, Madrid, Málaga, Mallorca, Murcia, Santander, Sevilla, Valencia, Vitoria',
  Portugal: 'Oporto',
  Grecia: 'Atenas',
}).flatMap(([pais, ciudades]) => ciudades.split(', ').map((ciudad) => [normalizarTexto(ciudad), pais])));

const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|_Incapsula_|akamai.*denied/i;
const EUROS = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const limpiar = (texto = '') => texto.replace(/\s+/g, ' ').trim();
const slug = (texto) => normalizarTexto(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Tarjetas de precio de una página de ofertas de Volotea.
 * `pais` sale del encabezado de su bloque («Ofertas vuelos a Italia»), que en la
 * página general agrupa por país de destino.
 * @param {string} html
 * @returns {{origen: string, destino: string, pais: string|null, precio: number|null, precioVuelta: number|null, href: string, destacada: boolean}[]}
 */
export function parsearTarjetas(html) {
  const $ = cheerio.load(html);
  return $('a.v7-seo-list__item').get().map((elemento) => {
    const tarjeta = $(elemento);
    const precio = tarjeta.find('.v7-seo-list__price').first();
    const encabezado = limpiar(tarjeta.closest('ul').prev().find('h3').first().text());
    return {
      origen: limpiar(tarjeta.find('.v7-seo-list__route p').first().text()).replace(/^desde\s+/i, ''),
      destino: limpiar(tarjeta.find('h4').first().text()),
      pais: encabezado.match(/^Ofertas vuelos a (.+)$/i)?.[1] ?? null,
      precio: parsearPrecio(limpiar(precio.text())),
      precioVuelta: parsearPrecio(limpiar(tarjeta.find('.v7-small-text').first().text())),
      href: tarjeta.attr('href') ?? '',
      destacada: !/--standard\b/.test(precio.attr('class') ?? ''),
    };
  });
}

/** Aeropuerto vigilado («Barcelona», «Girona», «Reus») al que corresponde un nombre de Volotea, o null. */
const origenVigilado = (nombre) => ORIGENES[normalizarTexto(nombre).replace(/\s*\(.*\)$/, '')] ?? null;

/**
 * Rutas que salen de Barcelona, Girona o Reus a partir de las tarjetas de la
 * página general y de la de vuelos a Barcelona (en esta, el sentido se invierte).
 * Si una ruta aparece en las dos, se queda la de la página general.
 */
export function rutasVigiladas(tarjetasGenerales, tarjetasBarcelona = []) {
  const paises = new Map(tarjetasGenerales.filter((t) => t.pais).map((t) => [normalizarTexto(t.destino), t.pais]));
  const salidas = tarjetasGenerales
    .filter((t) => origenVigilado(t.origen) && t.precio != null)
    .map((t) => ({ ...t, origen: origenVigilado(t.origen) }));
  const inversas = tarjetasBarcelona
    .filter((t) => origenVigilado(t.destino) && t.precioVuelta != null)
    .map((t) => ({
      origen: origenVigilado(t.destino),
      destino: t.origen,
      pais: paises.get(normalizarTexto(t.origen)) ?? PAISES_CONOCIDOS[normalizarTexto(t.origen)] ?? null,
      precio: t.precioVuelta,
      precioVuelta: t.precio,
      href: null,
      destacada: false,
    }));
  const rutas = new Map();
  for (const ruta of [...salidas, ...inversas]) {
    const clave = `${slug(ruta.origen)}-${slug(ruta.destino)}`;
    if (!rutas.has(clave)) rutas.set(clave, { ...ruta, clave });
  }
  return [...rutas.values()];
}

const euros = (valor) => `${EUROS.format(valor)} €`;

function ofertaDe(ruta) {
  const { origen, destino, pais, precio, precioVuelta, clave } = ruta;
  const url = ruta.href
    ? new URL(ruta.href, WEB).href
    : `${WEB}/es/ofertas-vuelos/${slug(origen)}/${slug(destino)}/`;
  const vuelta = precioVuelta != null ? `; vuelta desde ${euros(precioVuelta)}` : '';
  return crearOferta({
    id: `${ID}:${clave}`,
    fuente: ID,
    tipo: 'vuelo',
    titulo: `Vuelos ${origen} – ${destino} con Volotea`,
    descripcion: `Vuelo directo de Volotea de ${origen} a ${destino} desde ${euros(precio)} por trayecto, tasas incluidas${vuelta}. Plazas limitadas.`,
    url,
    precio,
    precioTexto: `desde ${euros(precio)} por trayecto (solo ida, tasas incluidas)${vuelta}`,
    unidad: null,
    transporte: 'avion',
    lugar: {
      nombre: destino,
      region: null,
      pais,
      codigoPais: pais ? CODIGOS_PAIS[normalizarTexto(pais)] ?? null : null,
      lat: null,
      lon: null,
      iata: null,
    },
    etiquetas: ['Volotea', 'vuelo directo', 'precio por trayecto', `salida desde ${origen}`, ...(ruta.destacada ? ['top-chollo'] : [])],
  });
}

/**
 * Ofertas de vuelos desde Barcelona, Girona o Reus a partir del HTML de la
 * página general y, si se tiene, de la de vuelos a Barcelona.
 * @param {string} htmlGeneral
 * @param {string} [htmlBarcelona]
 * @param {{log?: (mensaje: string) => void}} [ctx]
 */
export function parsear(htmlGeneral, htmlBarcelona = '', ctx = {}) {
  const log = ctx.log ?? (() => {});
  const rutas = rutasVigiladas(parsearTarjetas(htmlGeneral), htmlBarcelona ? parsearTarjetas(htmlBarcelona) : []);
  return rutas.flatMap((ruta) => {
    try {
      return [ofertaDe(ruta)];
    } catch (error) {
      log(`Oferta descartada (${ruta.origen} – ${ruta.destino}): ${error.message}`);
      return [];
    }
  });
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

async function leerPagina(url, ctx) {
  const html = await ctx.http.texto(url);
  if (!html.includes('v7-seo-list__item')) {
    if (DESAFIO.test(html)) throw Object.assign(new Error('Volotea ha devuelto un desafío anti-bot'), { bloqueo: true });
    throw new Error('no se ha encontrado ninguna tarjeta de precios (¿ha cambiado la página?)');
  }
  return html;
}

async function obtener(ctx) {
  const paginas = {};
  let ultimoError = null;
  for (const [i, url] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      paginas[url] = await leerPagina(url, ctx);
    } catch (error) {
      ultimoError = error;
      ctx.log(`${url}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Volotea ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  const leidas = Object.keys(paginas).length;
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de Volotea (último error: ${ultimoError.message})`);
  const ofertas = parsear(paginas[PAGINA_GENERAL] ?? '', paginas[PAGINA_BARCELONA] ?? '', ctx);
  return { ofertas, reemplazar: leidas === PAGINAS.length };
}

export default {
  id: ID,
  nombre: 'Volotea',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS,
  obtener,
};
