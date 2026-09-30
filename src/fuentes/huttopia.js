/**
 * Huttopia: campings en plena naturaleza (chalets, cabañas y tiendas equipadas) en
 * Francia y otros países de Europa. La promoción del momento va en la franja de arriba
 * de todas las páginas («WINTER26 : 20% de descuento a partir de 7 noches !*») y enlaza
 * sus condiciones («Código válido hasta el 18/10/26»); las páginas «nuestras ofertas»
 * del menú listan los campings donde se aplica, con un bloque JSON-LD `ItemList` de
 * `Campground` (nombre, URL, coordenadas, valoración) y tarjetas con la región, las
 * fechas de apertura y una descripción.
 *
 * Cada oferta es la promoción en un camping a menos de `MAX_KM` en línea recta del
 * origen. Sin porcentaje en la franja no hay oferta de precio y no se coge nada.
 * Se leen la portada, cada página de ofertas y la de condiciones, con 2 s de pausa.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { distanciaKm } from '../enriquecer/geo.js';
import { recortar } from '../util/xml.js';

const ID = 'huttopia';
const WEB = 'https://europe.huttopia.com';
const PORTADA = `${WEB}/es/`;
const PAUSA_MS = 2000;
const MAX_PAGINAS = 4;
/** Campings más lejos de esto (en línea recta desde el origen) no se cogen. */
export const MAX_KM = 450;
const PAGINA_OFERTAS = /^https:\/\/europe\.huttopia\.com\/es\/nuestras-ofertas\/[a-z0-9-]+\/$/;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha-delivery|datadome|access denied/i;

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();
/** «FONT ROMEU ODEILLO» → «Font Romeu Odeillo»; lo que ya viene con minúsculas, tal cual. */
const nombrePropio = (texto) => (/[a-zà-ÿ]/.test(texto) ? texto : texto.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()));

/**
 * La promoción de la franja de arriba: {texto, url, descuento, codigo, nochesMin}, o null
 * si no hay franja o no dice un porcentaje.
 * @param {cheerio.CheerioAPI} $
 */
function promocionDe($) {
  const enlace = $('.htp-banner .banner-text a').first();
  const texto = limpiar(enlace.text()).replace(/\s*!?\*+$/, '').replace(/\s+!$/, '');
  const descuento = Number(texto.match(/(\d{1,2})\s?%/)?.[1]);
  if (!(descuento > 0)) return null;
  return {
    texto,
    url: enlace.attr('href') ?? null,
    descuento,
    codigo: texto.match(/^([A-Z0-9]{4,})\s*:/)?.[1] ?? null,
    nochesMin: Number(texto.match(/(\d+)\s+noches/)?.[1]) || null,
  };
}

/**
 * Portada (o cualquier página): la promoción de la franja y las páginas de ofertas del menú.
 * @param {string} html
 */
export function parsearPortada(html) {
  const $ = cheerio.load(html);
  const paginas = [...new Set($('a[href]').map((_, a) => $(a).attr('href')).get().filter((url) => PAGINA_OFERTAS.test(url)))];
  return { promocion: promocionDe($), paginas };
}

/** «Código válido hasta el 18/10/26» → fin de ese día en Madrid (ISO), o null. */
export function fechaLimite(texto) {
  const m = String(texto).match(/v[aá]lid[oa] hasta el (\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (!m) return null;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  return new Date(`${anio}-${m[2]}-${m[1]}T23:59:59+01:00`).toISOString();
}

/** Campings del JSON-LD por URL: coordenadas y valoración. */
function campingsJsonLd($) {
  const campings = new Map();
  $('script[type="application/ld+json"]').each((_, script) => {
    let datos;
    try {
      datos = JSON.parse($(script).text());
    } catch {
      return;
    }
    for (const elemento of datos?.itemListElement ?? []) {
      const c = elemento?.item;
      if (c?.['@type'] !== 'Campground' || !c.url) continue;
      campings.set(c.url, c);
    }
  });
  return campings;
}

/**
 * Ofertas de una página «nuestras ofertas»: la promoción de su franja en cada camping
 * cercano. Null si la página no trae ni promoción ni campings.
 * @param {string} html
 * @param {{ajustes?: {origen?: {lat: number, lon: number}}, log?: (m: string) => void, caduca?: string|null}} [ctx]
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsearOfertas(html, ctx = {}) {
  const $ = cheerio.load(html);
  const promocion = promocionDe($);
  const tarjetas = $('.card-site');
  if (!promocion || !tarjetas.length) return null;
  const jsonLd = campingsJsonLd($);
  const origen = ctx.ajustes?.origen;
  const log = ctx.log ?? (() => {});
  const ofertas = [];
  tarjetas.each((_, tarjeta) => {
    const t = $(tarjeta);
    const enlace = t.find('.title-favorite a').first();
    const url = enlace.attr('href');
    const nombre = limpiar(enlace.text());
    // La tarjeta enlaza la página de invierno del camping («…/site/camping-font-romeu/hiver/»).
    const datos = [...jsonLd.entries()].find(([base]) => url?.startsWith(base))?.[1];
    const lat = Number(datos?.geo?.latitude);
    const lon = Number(datos?.geo?.longitude);
    if (!url || !nombre || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (origen && distanciaKm(origen, { lat, lon }) > MAX_KM) return;
    const [region, fechas] = t.find('.subtitle-favorite').map((_, s) => limpiar($(s).text())).get();
    const nota = Number(datos.aggregateRating?.ratingValue);
    const opiniones = Number(datos.aggregateRating?.ratingCount);
    const mejor = Number(datos.aggregateRating?.bestRating) || 5;
    const codigo = promocion.codigo ? ` con el código ${promocion.codigo}` : '';
    try {
      ofertas.push(crearOferta({
        id: `${ID}:${new URL(url).pathname.split('/').filter(Boolean)[2] ?? nombre}:${promocion.codigo ?? promocion.descuento}`,
        fuente: ID,
        tipo: 'hotel',
        titulo: `Camping ${nombre}: ${promocion.descuento} % de descuento${promocion.nochesMin ? ` a partir de ${promocion.nochesMin} noches` : ''}`,
        establecimiento: `Camping ${nombre}`,
        descripcion: recortar(`${promocion.texto.replace(/^[A-Z0-9]{4,}\s*:\s*/, '')}${codigo}.${fechas ? ` Abierto ${fechas.replace(/^Del/, 'del')}.` : ''} ${limpiar(t.find('.description').first().text())}`),
        url,
        imagen: t.find('.illustration img').attr('src') ?? datos.image?.[0] ?? null,
        precio: null,
        precioTexto: `${promocion.descuento} % de descuento`,
        descuento: promocion.descuento,
        alojamiento: 'camping',
        temas: [],
        valoracion: nota > 0 ? { nota: Math.round((nota / mejor) * 100) / 10, n: Number.isFinite(opiniones) ? opiniones : null } : null,
        lugar: {
          nombre: nombrePropio(limpiar(datos.address?.addressLocality)) || nombre,
          region: region?.split(' - ')[0] || null,
          pais: datos.address?.addressCountry === 'FR' ? 'Francia' : datos.address?.addressCountry === 'ES' ? 'España' : null,
          codigoPais: datos.address?.addressCountry ?? null,
          lat,
          lon,
          iata: null,
        },
        etiquetas: ['Camping', ...t.find('.tag').map((_, e) => limpiar($(e).text())).get()],
        caduca: ctx.caduca ?? null,
      }));
    } catch (error) {
      log(`${nombre}: ${error.message}`);
    }
  });
  return ofertas;
}

const esBloqueo = (error) => [403, 429].includes(error.estado);

async function pedir(ctx, url) {
  try {
    return await ctx.http.texto(url, { reintentos: 0 });
  } catch (error) {
    if (esBloqueo(error)) throw new Error(`Huttopia ha bloqueado o limitado la petición (HTTP ${error.estado})`, { cause: error });
    throw error;
  }
}

async function obtener(ctx) {
  const portada = await pedir(ctx, PORTADA);
  const { promocion, paginas } = parsearPortada(portada);
  if (!paginas.length) {
    if (DESAFIO.test(portada)) throw new Error('Huttopia ha devuelto un desafío anti-bot');
    // Sin páginas de ofertas en el menú no hay promoción ahora mismo: nada que guardar.
    return { ofertas: [], reemplazar: true };
  }
  let caduca = null;
  if (promocion?.url?.startsWith(WEB)) {
    await ctx.http.esperar(PAUSA_MS);
    try {
      caduca = fechaLimite(cheerio.load(await pedir(ctx, promocion.url)).text());
    } catch (error) {
      ctx.log(`${promocion.url}: ${error.message}`);
    }
  }
  const ofertas = [];
  let leidas = 0;
  for (const url of paginas.slice(0, MAX_PAGINAS)) {
    await ctx.http.esperar(PAUSA_MS);
    try {
      const lista = parsearOfertas(await pedir(ctx, url), { ...ctx, caduca });
      leidas += 1;
      if (lista) ofertas.push(...lista);
    } catch (error) {
      ctx.log(`${url}: ${error.message}`);
    }
  }
  if (!leidas) throw new Error('No se ha podido leer ninguna página de ofertas de Huttopia');
  const unicas = [...new Map(ofertas.map((o) => [o.id, o])).values()];
  return { ofertas: unicas, reemplazar: true };
}

export default {
  id: ID,
  nombre: 'Huttopia',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: [PORTADA],
  obtener,
};
