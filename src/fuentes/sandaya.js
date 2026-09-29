/**
 * Sandaya: cadena de campings de 4 y 5 estrellas (Francia, España, Italia…). Su página
 * de ofertas especiales enlaza una página por promoción («Oferta 7 noches hasta un -20%»,
 * «Parcela a partir de 19€ la noche»), y cada una lista, en el HTML, los campings donde
 * se aplica (nombre, localidad, región, coordenadas, foto y fechas de apertura). Los
 * precios de cada camping se cargan después con JavaScript: el precio o el descuento
 * sale del titular de la promoción, que es lo que la web publica como oferta.
 *
 * Cada oferta es un camping con su mejor promoción (las demás van en la descripción). Solo se cogen los campings a menos de
 * `MAX_KM` en línea recta del origen (los del Mediterráneo francés y los de España
 * desde Barcelona), y solo las promociones con precio o descuento (en el titular o en su
 * subtítulo): «Opción Libertad»
 * (cancelación flexible) o los servicios a la carta no son una oferta de precio. Las
 * que la web marca «Oferta caducada» o «disponible pronto» tampoco.
 *
 * Su robots.txt solo prohíbe la búsqueda de disponibilidad: las páginas de ofertas se
 * pueden leer. Se piden con 2 s de pausa.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { distanciaKm } from '../enriquecer/geo.js';
import { recortar } from '../util/xml.js';

const ID = 'sandaya';
const WEB = 'https://www.sandaya.es';
const INDICE = `${WEB}/ofertas-especiales`;
const PAUSA_MS = 2000;
/** Promociones que se leen como mucho en cada ejecución. */
const MAX_PROMOCIONES = 12;
/** Campings más lejos de esto (en línea recta desde el origen) no se cogen. */
export const MAX_KM = 450;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha-delivery|datadome|access denied/i;

/** Regiones de España como las escribe Sandaya: el resto de sus campings están en Francia, Italia… */
const REGIONES_ESPANA = /catalu|valencia|andaluc|arag|murcia|balear|navarra|vasco|cantabria|asturias|galicia|castilla|madrid|rioja|extremadura|canarias/i;
const PAIS_REGION = [[/toscana|lacio|v[eé]neto|lombard|liguria|piamonte|italia/i, 'Italia', 'IT'], [/b[eé]lgica|flandes|valonia/i, 'Bélgica', 'BE']];

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();
const sinAsterisco = (texto) => texto.replace(/\s*\*+/g, '').trim();

/**
 * Promociones de la página de ofertas: [{url, slug, titulo, imagen}], sin las caducadas,
 * las que aún no han empezado ni las que no son de precio. Null si no es la página.
 * @param {string} html
 */
export function parsearIndice(html) {
  const $ = cheerio.load(html);
  const bloques = $('.imgtextbloc a[href^="/ofertas-especiales/"]');
  if (!bloques.length) return null;
  const vistas = new Set();
  const promociones = [];
  bloques.each((_, a) => {
    const enlace = $(a);
    const ruta = enlace.attr('href');
    const titulo = limpiar(enlace.find('.text').first().text());
    // «Oferta caducada» y «Oferta disponible pronto» llevan una etiqueta encima de la foto.
    if (!titulo || vistas.has(ruta) || enlace.find('.tip').length) return;
    vistas.add(ruta);
    if (SIN_PRECIO.test(titulo)) return;
    promociones.push({ url: `${WEB}${ruta}`, slug: slugDe(ruta), titulo, imagen: enlace.find('img').attr('data-original') ?? null });
  });
  return promociones;
}

/** Promociones que nunca son de precio: la cancelación flexible y los extras. */
const SIN_PRECIO = /libertad|servicios a la carta/i;

const slugDe = (ruta) => ruta.split('/').filter(Boolean).pop().replace(/[^a-z0-9-]/gi, '');

/**
 * Lo que ofrece un titular: {precio, unidad, noches, descuento} o null si no dice ni precio
 * ni descuento. «Alojamiento a partir de 45€ la noche» → 45 por noche; «Su fin de semana a
 * partir de 119 € para 4 personas» → 119 en total por 2 noches; «Oferta 21 noches -30%»
 * o «hasta un -20%» → descuento.
 * @param {string} titulo
 */
export function ventaja(titulo) {
  const texto = titulo.replace(/ /g, ' ');
  const euros = Number(texto.match(/(\d{1,4})\s?€/)?.[1]);
  const descuento = Number(texto.match(/-\s?(\d{1,2})\s?%/)?.[1]);
  if (euros > 0) {
    const finde = /fin de semana/i.test(texto);
    const porNoche = /noche/i.test(texto) && !finde;
    return { precio: euros, unidad: porNoche ? 'noche' : 'total', noches: finde ? 2 : null, descuento: null };
  }
  if (descuento > 0) return { precio: null, unidad: null, noches: null, descuento };
  return null;
}

/** «reservas realizadas antes del 31/12/2026» → fin de ese día en Madrid (ISO); null si no lo dice. */
export function fechaLimite(texto) {
  const m = texto.match(/(?:reserv\w*|realizad\w*)[^.]{0,40}?antes del (\d{2})\/(\d{2})\/(\d{4})/i);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T23:59:59+01:00`).toISOString() : null;
}

/**
 * Una página de promoción: la promoción (titular, lo que ofrece, texto y fecha límite) y
 * los campings cercanos al origen donde se aplica. Null si no es una página de promoción
 * o no dice ni precio ni descuento.
 * @param {string} html
 * @param {{url: string, slug: string, titulo: string, imagen?: string|null}} promocion
 * @param {{ajustes?: {origen?: {lat: number, lon: number}}}} [ctx]
 */
export function parsearPromocion(html, promocion, ctx = {}) {
  const $ = cheerio.load(html);
  const titular = sinAsterisco(limpiar($('h1').first().text()) || promocion.titulo);
  // El titular o, si no lo dice («Do You First»), el subtítulo («Hasta -15%* en sus vacaciones 2027»).
  const subtitulo = sinAsterisco(limpiar($('h2.page-title').filter((_, h) => !$(h).closest('#campings').length).first().text()));
  const oferta = ventaja(titular) ?? ventaja(promocion.titulo) ?? ventaja(subtitulo);
  const titulo = ventaja(titular) || !subtitulo ? titular : `${titular}: ${subtitulo}`;
  const bloques = $('.blocresultcamping');
  if (!oferta || !bloques.length) return null;
  const textos = $('.ezrichtext-field').map((_, e) => limpiar($(e).text())).get();
  const intro = limpiar($('.ezrichtext-field p').first().text());
  // «Hasta un 20%* de descuento para toda estancia…», no «anulación 100% flexible».
  const suOferta = limpiar($('.ezrichtext-field li').filter((_, li) => /descuento|-\s?\d+\s?%|\d+\s?€/i.test($(li).text())).first().text());
  const origen = ctx.ajustes?.origen;
  const campings = [];
  bloques.each((_, bloque) => {
    const c = $(bloque);
    const lat = Number.parseFloat(c.attr('data-latitude'));
    const lon = Number.parseFloat(c.attr('data-longitude'));
    const id = c.attr('data-remote-id') ?? c.attr('data-camping-id');
    const nombre = limpiar(c.find('.name').first().text());
    if (!id || !nombre || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (c.attr('data-reservations-closed') === 'true') return;
    if (origen && distanciaKm(origen, { lat, lon }) > MAX_KM) return;
    const region = limpiar(c.find('.region').first().text()) || null;
    const [pais, codigoPais] = REGIONES_ESPANA.test(region ?? '') ? ['España', 'ES']
      : PAIS_REGION.find(([patron]) => patron.test(region ?? ''))?.slice(1) ?? ['Francia', 'FR'];
    campings.push({
      id, nombre, lat, lon, region, pais, codigoPais,
      localidad: limpiar(c.find('.city').first().text()) || nombre,
      imagen: c.find('img').attr('data-original') ?? null,
    });
  });
  return {
    promocion: {
      ...promocion,
      titulo,
      ...oferta,
      texto: [intro, suOferta && suOferta !== intro ? suOferta : ''].filter(Boolean).join(' '),
      caduca: fechaLimite(textos.join(' ')),
    },
    campings,
  };
}

/**
 * Orden de interés de una promoción para una escapada: primero el fin de semana con precio,
 * después el alojamiento por noche, la parcela y, al final, los descuentos (el mayor antes).
 */
function orden(p) {
  if (p.noches === 2) return 0;
  if (p.precio != null) return /parcela/i.test(p.titulo) ? 2 : 1;
  return 3 + (100 - p.descuento) / 1000;
}

const textoPrecio = (p) => (p.precio != null
  ? `desde ${p.precio} € ${p.unidad === 'noche' ? 'la noche' : 'en total'}`
  : `hasta un ${p.descuento} % de descuento`);

/**
 * Una oferta por camping con su mejor promoción; las demás, en la descripción. Así no
 * salen seis tarjetas casi iguales del mismo camping.
 * @param {{promocion: object, campings: object[]}[]} paginas  lo que devuelve parsearPromocion
 * @param {{log?: (m: string) => void}} [ctx]
 * @returns {import('../modelo.js').Oferta[]}
 */
export function combinar(paginas, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const porCamping = new Map();
  for (const { promocion, campings } of paginas) {
    for (const camping of campings) {
      if (!porCamping.has(camping.id)) porCamping.set(camping.id, { camping, promociones: [] });
      porCamping.get(camping.id).promociones.push(promocion);
    }
  }
  return [...porCamping.values()].flatMap(({ camping, promociones }) => {
    const [mejor, ...otras] = promociones.sort((a, b) => orden(a) - orden(b));
    const nombre = `Camping Sandaya ${camping.nombre}`;
    const tambien = otras.length ? ` También en este camping: ${otras.map((p) => p.titulo).join(' · ')}.` : '';
    // Caduca solo si todas sus promociones tienen fecha límite: la última de ellas.
    const fechas = promociones.map((p) => p.caduca);
    try {
      return [crearOferta({
        id: `${ID}:${camping.id}`,
        fuente: ID,
        tipo: 'hotel',
        titulo: `${nombre}: ${mejor.titulo}`,
        establecimiento: nombre,
        descripcion: recortar(`${mejor.texto}${tambien}`.trim()),
        url: mejor.url,
        imagen: camping.imagen ?? mejor.imagen ?? null,
        precio: mejor.precio,
        precioTexto: textoPrecio(mejor),
        unidad: mejor.unidad,
        noches: mejor.noches,
        descuento: mejor.descuento,
        alojamiento: 'camping',
        temas: [],
        lugar: { nombre: camping.localidad, region: camping.region, pais: camping.pais, codigoPais: camping.codigoPais, lat: camping.lat, lon: camping.lon, iata: null },
        etiquetas: ['Camping'],
        caduca: fechas.every(Boolean) ? fechas.sort().at(-1) : null,
      })];
    } catch (error) {
      log(`${nombre}: ${error.message}`);
      return [];
    }
  });
}

const esBloqueo = (error) => [403, 429].includes(error.estado);

async function obtener(ctx) {
  let html;
  try {
    html = await ctx.http.texto(INDICE, { reintentos: 0 });
  } catch (error) {
    if (esBloqueo(error)) throw new Error(`Sandaya ha bloqueado o limitado la petición (HTTP ${error.estado})`);
    throw error;
  }
  const promociones = parsearIndice(html);
  if (!promociones) {
    if (DESAFIO.test(html)) throw new Error('Sandaya ha devuelto un desafío anti-bot');
    throw new Error('La página de ofertas de Sandaya no trae la lista de promociones (¿ha cambiado la web?)');
  }
  const paginas = [];
  for (const promocion of promociones.slice(0, MAX_PROMOCIONES)) {
    await ctx.http.esperar(PAUSA_MS);
    try {
      const pagina = parsearPromocion(await ctx.http.texto(promocion.url, { reintentos: 0 }), promocion, ctx);
      // Sin precio ni descuento (media pensión, restauración…): no es una oferta de precio.
      if (pagina) paginas.push(pagina);
    } catch (error) {
      ctx.log(`${promocion.url}: ${error.message}`);
      if (esBloqueo(error)) break;
    }
  }
  if (!paginas.length) throw new Error('No se ha podido leer ninguna promoción de Sandaya con precio o descuento');
  return { ofertas: combinar(paginas, ctx), reemplazar: true };
}

export default {
  id: ID,
  nombre: 'Sandaya',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: [INDICE],
  obtener,
};
