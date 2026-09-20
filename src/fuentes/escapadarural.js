/**
 * Escapada Rural: casas rurales con ofertas (las dos primeras páginas de
 * /ofertas-casas-rurales) y las casas destacadas de las cuatro provincias
 * catalanas. La web es Nuxt con SSR: los datos de cada casa van en el bloque
 * JSON `__NUXT_DATA__` (formato «devalue»), que es lo que se interpreta.
 *
 * El precio es el precio medio aproximado por persona y noche que enseña la
 * tarjeta («26 € pers./noche (aprox.)»). El nombre de cada oferta concreta
 * (puentes, «oferta flash»…) solo aparece en la ficha de la casa y no se pide:
 * serían cientos de peticiones.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { recortar } from '../util/xml.js';

const WEB = 'https://www.escapadarural.com';
const PROVINCIAS = ['barcelona', 'girona', 'tarragona', 'lleida'];
/** Las ofertas van primero: si una casa se repite, se queda esa versión. */
const PAGINAS = [
  `${WEB}/ofertas-casas-rurales`,
  `${WEB}/ofertas-casas-rurales?page=2`,
  ...PROVINCIAS.map((provincia) => `${WEB}/casas-rurales/${provincia}`),
];
const PAUSA_MS = 2000;

const ALQUILER = {
  FULL: 'Alquiler íntegro',
  ROOMS: 'Alquiler por habitaciones',
  BOTH: 'Alquiler íntegro o por habitaciones',
};
const DESAFIO = /awswaf|captcha-delivery|datadome|cf-chl|challenge-platform|just a moment|attention required|access denied/i;
const NUMERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/**
 * Deshace el formato «devalue» con el que Nuxt serializa su estado: un array
 * plano en el que objetos y listas guardan índices a otras posiciones.
 * Los envoltorios de Nuxt (`ShallowReactive`, `Ref`…) se sustituyen por su valor.
 * @param {unknown[]} plano
 */
export function desplegarNuxt(plano) {
  const hechos = new Map();

  const especial = (indice, [tipo, ...resto]) => {
    if (tipo === 'Date') return resto[0];
    if (tipo === 'Set') return resto.map(valor);
    if (tipo === 'Map' || tipo === 'null') {
      const objeto = {};
      hechos.set(indice, objeto);
      for (let i = 0; i < resto.length; i += 2) {
        objeto[tipo === 'Map' ? valor(resto[i]) : resto[i]] = valor(resto[i + 1]);
      }
      return objeto;
    }
    return resto.length ? valor(resto[0]) : undefined;
  };

  function valor(indice) {
    if (indice < 0) return undefined;
    if (hechos.has(indice)) return hechos.get(indice);
    const crudo = plano[indice];
    if (crudo === null || typeof crudo !== 'object') return crudo;
    if (Array.isArray(crudo) && typeof crudo[0] === 'string') return especial(indice, crudo);
    const copia = Array.isArray(crudo) ? [] : {};
    hechos.set(indice, copia);
    for (const [clave, hijo] of Object.entries(crudo)) copia[clave] = valor(hijo);
    return copia;
  }

  return valor(0);
}

/** Casas del listado de una página, o null si la página no trae el bloque de datos de Nuxt. */
function casasDe(html) {
  const bloque = cheerio.load(html)('script#__NUXT_DATA__').text();
  if (!bloque) return null;
  const { data = {} } = desplegarNuxt(JSON.parse(bloque)) ?? {};
  const clave = Object.keys(data).find((k) => k.includes('/search/cottages'));
  const respuesta = clave ? data[clave] : null;
  return respuesta ? (respuesta.success ?? respuesta).data?.cottages ?? [] : null;
}

/**
 * Ofertas de una página de Escapada Rural (listado de ofertas o de provincia).
 * Devuelve null si la página no trae datos (desafío anti-bot o cambio de la web).
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const casas = casasDe(html);
  if (!casas) return null;
  return casas.flatMap((casa) => {
    try {
      return [ofertaDe(casa)];
    } catch (error) {
      log(`Casa descartada (${casa?.name ?? casa?.id}): ${error.message}`);
      return [];
    }
  });
}

function ofertaDe(casa) {
  if (!casa.id || !casa.slug || !casa.province?.slug) throw new Error('sin identificador o sin provincia');
  const precio = euros(casa.averagePrice);
  const completa = casa.rentType === 'FULL';
  return crearOferta({
    id: `escapadarural:${casa.id}`,
    fuente: 'escapadarural',
    tipo: 'hotel',
    titulo: limpiar(casa.name),
    descripcion: recortar(limpiar(casa.description)),
    url: `${WEB}/casa-rural/${casa.province.slug}/${casa.slug}`,
    imagen: casa.media?.thumb ?? null,
    precio,
    precioTexto: precio == null ? '' : `${NUMERO.format(precio)} € por persona y noche (aprox.)`,
    unidad: precio == null ? null : 'pp/noche',
    regimen: completa ? 'solo-alojamiento' : null,
    valoracion: valoracionDe(casa.review),
    temas: ['rural'],
    lugar: {
      nombre: limpiar(casa.village?.name) || casa.province.name,
      region: casa.province.name ?? null,
      pais: 'España',
      codigoPais: 'ES',
      lat: coordenada(casa.latitude),
      lon: coordenada(casa.longitude),
      iata: null,
    },
    etiquetas: etiquetasDe(casa),
  });
}

/** Los importes llegan en céntimos: {amount: 2600, currency: 'EUR'} → 26. */
const euros = (importe) =>
  Number.isFinite(importe?.amount) && importe.amount > 0 && (importe.currency ?? 'EUR') === 'EUR' ? importe.amount / 100 : null;

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();

/** Escapada Rural puntúa sobre 5 estrellas; el contrato pide la nota sobre 10. */
function valoracionDe(review) {
  const n = review?.numReviews ?? 0;
  const estrellas = review?.score ?? 0;
  return n > 0 && estrellas > 0 ? { nota: Number((estrellas * 2).toFixed(1)), n } : null;
}

function coordenada(texto) {
  const numero = Number.parseFloat(texto);
  return Number.isFinite(numero) ? numero : null;
}

function etiquetasDe(casa) {
  const plazas = casa.capacity?.max;
  const opinion = casa.review?.numReviews > 0 ? `Valoración ${casa.review.score}/5 (${casa.review.numReviews} opiniones)` : null;
  return [
    'Casa rural',
    ALQUILER[casa.rentType],
    plazas ? `Hasta ${plazas} personas` : null,
    casa.hasDeals ? 'Con ofertas' : null,
    casa.hasFreeCancellations ? 'Cancelación gratuita' : null,
    casa.hasOnlineBooking ? 'Reserva online' : null,
    opinion,
  ].filter(Boolean);
}

function deduplicar(ofertas) {
  const vistas = new Set();
  return ofertas.filter((oferta) => !vistas.has(oferta.id) && vistas.add(oferta.id));
}

function leerPagina(html, ctx) {
  const ofertas = parsear(html, ctx);
  if (ofertas) return ofertas;
  if (DESAFIO.test(html)) throw Object.assign(new Error('Escapada Rural ha devuelto un desafío anti-bot'), { bloqueo: true });
  throw new Error('la página no trae el bloque de datos de Nuxt (¿ha cambiado la web?)');
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

async function obtener(ctx) {
  const ofertas = [];
  let leidas = 0;
  let ultimoError = null;
  for (const [i, url] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      ofertas.push(...leerPagina(await ctx.http.texto(url), ctx));
      leidas++;
    } catch (error) {
      ultimoError = error;
      ctx.log(`${url}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Escapada Rural ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de Escapada Rural (último error: ${ultimoError.message})`);
  // Solo son las primeras páginas de cada listado: las casas que dejan de salir caducan por retencionDias.
  return { ofertas: deduplicar(ofertas) };
}

export default {
  id: 'escapadarural',
  nombre: 'Escapada Rural',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS,
  obtener,
};
