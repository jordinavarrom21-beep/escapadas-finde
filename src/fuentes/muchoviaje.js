/**
 * Muchoviaje: sus secciones de ofertas de hotel («Fin de semana», «Última hora»…) listan
 * en el HTML los hoteles con su precio medio por noche. Cada tarjeta trae los datos como
 * atributos (`data-prop="name|price|url"`), las estrellas en la clase del título
 * (`c-category-star--4`) y la localidad («Salou, España»).
 *
 * Solo se lee la primera página de cada sección (9 hoteles: las siguientes se cargan con
 * JavaScript), de varias secciones, y se quitan los repetidos quedándose el más barato. El
 * precio es el precio medio de una noche de la habitación: `unidad: 'noche'`.
 *
 * Su robots.txt permite las páginas de ofertas (prohíbe reservas, disponibilidad y
 * buscadores internos). Se piden con 2 s de pausa.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { recortar } from '../util/xml.js';

const ID = 'muchoviaje';
const WEB = 'https://www.muchoviaje.com';
const PAUSA_MS = 2000;
/** Secciones con listas de hoteles, y la etiqueta que dan a sus ofertas. */
export const SECCIONES = [
  ['fin-de-semana', 'Fin de semana'],
  ['ultima-hora', 'Última hora'],
  ['ultima-hora-playas', 'Última hora en playas'],
  ['hoteles-especial-familias', 'Especial familias'],
  ['hoteles-en-port-aventura', 'Hoteles en PortAventura'],
];
const urlSeccion = (slug) => `${WEB}/ofertas/${slug}`;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha-delivery|datadome|access denied/i;

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();
/** «Santa Cruz De Mudela» → «Santa Cruz de Mudela»: las partículas, en minúscula (salvo al empezar). */
const localidadDe = (texto) => texto?.replace(/(?<=\S\s)(De|Del|La|Las|Los|El|Y|I)\b/g, (p) => p.toLowerCase()) || null;

/**
 * Hoteles de una sección: [{id, nombre, localidad, pais, estrellas, precio, url, imagen}].
 * Null si la página no trae la lista de resultados (desafío o cambio de la web).
 * @param {string} html
 */
export function parsearSeccion(html) {
  const $ = cheerio.load(html);
  const lista = $('.pg-l-search-result__results');
  if (!lista.length) return null;
  return lista.find('article.m-offer').get().flatMap((elemento) => {
    const t = $(elemento);
    const id = t.attr('id');
    const nombre = limpiar(t.find('[data-prop="name"]').attr('data-content') ?? t.find('.m-offer__title').text());
    const url = t.find('[data-prop="url"]').attr('data-content') ?? t.find('a.m-offer__btn').attr('href');
    const precio = Number(t.find('[data-prop="price"]').attr('content'));
    if (!/^\d+$/.test(id ?? '') || !nombre || !url || !(precio > 0)) return [];
    const [nombreLocalidad, pais] = limpiar(t.find('.m-offer__tag').first().text()).split(/,\s*/);
    const localidad = localidadDe(nombreLocalidad);
    const estrellas = Number((t.find('.m-offer__title').attr('class') ?? '').match(/c-category-star--([1-5])\b/)?.[1]) || null;
    const imagen = t.find('img.m-offer__image').attr('data-srcset') ?? t.find('source').last().attr('data-srcset') ?? null;
    return [{ id, nombre, localidad: localidad || null, pais: pais || null, estrellas, precio, url: new URL(url, WEB).href, imagen }];
  });
}

/**
 * Ofertas a partir de los hoteles de cada sección leída: una por hotel (el más barato si
 * sale en varias), con las secciones donde aparece como etiquetas.
 * @param {Array<{seccion: string, hoteles: object[]}>} leidas
 * @param {{log?: (m: string) => void}} [ctx]
 */
export function combinar(leidas, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const porHotel = new Map();
  for (const { seccion, hoteles } of leidas) {
    for (const hotel of hoteles) {
      const previo = porHotel.get(hotel.id);
      const secciones = [...(previo?.secciones ?? []), seccion];
      porHotel.set(hotel.id, { ...(previo && previo.precio <= hotel.precio ? previo : hotel), secciones });
    }
  }
  return [...porHotel.values()].flatMap((h) => {
    const esApartamento = /\bapart(?:amentos?|hotel|ahotel)\b/i.test(h.nombre);
    const donde = [h.localidad, h.pais].filter(Boolean).join(', ');
    try {
      return [crearOferta({
        id: `${ID}:${h.id}`,
        fuente: ID,
        tipo: 'hotel',
        titulo: `${h.nombre}${h.localidad ? ` en ${h.localidad}` : ''}`,
        establecimiento: h.nombre,
        descripcion: recortar(`${esApartamento ? 'Apartamentos' : 'Hotel'}${h.estrellas ? ` de ${h.estrellas} estrellas` : ''}${donde ? ` en ${donde}` : ''}. Precio medio por noche en las ofertas de Muchoviaje (${h.secciones.join(', ').toLowerCase()}); el de tus fechas se confirma al reservar.`),
        url: h.url,
        imagen: h.imagen,
        precio: h.precio,
        precioTexto: `desde ${h.precio} € de media por noche`,
        unidad: 'noche',
        estrellas: h.estrellas,
        alojamiento: esApartamento ? 'apartamento' : 'hotel',
        temas: [],
        lugar: h.localidad
          ? { nombre: h.localidad, region: null, pais: h.pais, codigoPais: h.pais === 'España' ? 'ES' : null, lat: null, lon: null, iata: null }
          : null,
        etiquetas: h.secciones,
      })];
    } catch (error) {
      log(`${h.nombre}: ${error.message}`);
      return [];
    }
  });
}

const esBloqueo = (error) => [403, 429].includes(error.estado);

async function obtener(ctx) {
  const leidas = [];
  let ultimoError = null;
  let fallidas = 0;
  for (const [i, [slug, etiqueta]] of SECCIONES.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      const html = await ctx.http.texto(urlSeccion(slug), { reintentos: 0 });
      const hoteles = parsearSeccion(html);
      if (!hoteles) throw new Error(DESAFIO.test(html) ? 'desafío anti-bot' : 'la página no trae la lista de hoteles (¿ha cambiado la web?)');
      leidas.push({ seccion: etiqueta, hoteles });
    } catch (error) {
      ctx.log(`${urlSeccion(slug)}: ${error.message}`);
      // Una sección que ya no existe (404) no es un fallo de lectura: sus hoteles se retiran.
      if (error.estado === 404) continue;
      ultimoError = error;
      fallidas++;
      if (esBloqueo(error)) break;
    }
  }
  if (!leidas.length) throw new Error(`No se ha podido leer ninguna sección de Muchoviaje (último error: ${ultimoError?.message})`);
  // Si alguna sección ha fallado, lo guardado no se borra: puede que sus hoteles sigan ahí.
  return { ofertas: combinar(leidas, ctx), reemplazar: fallidas === 0 };
}

export default {
  id: ID,
  nombre: 'Muchoviaje',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: SECCIONES.map(([slug]) => urlSeccion(slug)),
  obtener,
};
