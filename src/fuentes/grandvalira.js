/**
 * Grandvalira (Andorra), la estación de esquí más grande del Pirineo, a unas 3 h de
 * Barcelona: sus páginas de ofertas listan en el HTML cada pack con sus fechas, qué incluye
 * y el precio por persona («Hotel + Forfait · 05/12/2026 – 08/12/2026 · 3 noches de hotel y
 * 2 días de forfait · desde 195,97 €»).
 *
 * Con hotel o apartamento es un paquete de escapada con fechas cerradas; lo demás (forfait
 * con material, clases, raquetas) es una actividad: con fecha concreta si dura unos días, o
 * válida hasta el último día si es un periodo largo («09/12 – 31/12»). Las dos páginas
 * repiten parte de las ofertas: se quitan las repetidas.
 *
 * Su robots.txt solo prohíbe carpetas técnicas. Se piden con 2 s de pausa.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { normalizarTexto, recortar } from '../util/xml.js';

const ID = 'grandvalira';
const WEB = 'https://www.grandvalira.com';
const PAGINAS = [`${WEB}/es/ofertas-esqui-andorra`, `${WEB}/es/ofertas-hotel-forfait`];
const PAUSA_MS = 2000;
/** Más días que esto entre las dos fechas es un periodo de validez, no una estancia. */
const DIAS_ESTANCIA = 7;
const DIA_MS = 86_400_000;
/** Soldeu, el centro de la estación. */
const LUGAR = { nombre: 'Grandvalira', region: 'Andorra', pais: 'Andorra', codigoPais: 'AD', lat: 42.5766, lon: 1.6676, iata: null };
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha-delivery|datadome|access denied/i;

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();
const euros = (texto) => {
  const numero = texto.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*€/)?.[1];
  return numero ? Number(numero.replace(/\./g, '').replace(',', '.')) : null;
};
const dia = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? '') ? iso.slice(0, 10) : null);
/** Fin de ese día en Andorra (hora de invierno), en ISO. */
const finDelDia = (fecha) => new Date(`${fecha}T23:59:59+01:00`).toISOString();

/** «195,97», «30,50», «171»: con céntimos solo si los tiene. */
const EUROS = { format: (n) => n.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) };
/** «3 noches de hotel y 2 días de forfait para 2 adultos. Precio por persona.» → lo de antes del punto. */
const resumen = (texto) => texto.split(/\.\s|\.$/)[0].replace(/\s*precio por persona.*$/i, '').trim();

/** Id estable de una oferta: lo que es y sus fechas, sin tildes ni signos. */
const idDe = (partes) => normalizarTexto(partes.join(' ')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

/**
 * Ofertas de una página, o null si no trae tarjetas de ofertas.
 * @param {string} html
 * @param {string} urlPagina
 * @param {{log?: (m: string) => void}} [ctx]
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsear(html, urlPagina, ctx = {}) {
  const $ = cheerio.load(html);
  const tarjetas = $('article.card-detailed');
  if (!tarjetas.length) return null;
  const log = ctx.log ?? (() => {});
  return tarjetas.get().flatMap((elemento) => {
    const t = $(elemento);
    const titulo = limpiar(t.find('.card-detailed__title').first().text());
    const texto = limpiar(t.find('.card-detailed__text').first().text());
    const precio = euros(limpiar(t.find('.card-detailed__plain-text').first().text()));
    const [desde, hasta = desde] = t.find('.card-detailed__date time').map((_, x) => dia($(x).attr('datetime'))).get();
    if (!titulo || !desde || !(precio > 0)) return [];
    const reserva = t.find('a.button[href]').first().attr('href');
    const url = reserva?.startsWith('https://') ? reserva : `${urlPagina}#${idDe([titulo, desde])}`;
    const alojamiento = /apartamento/i.test(`${titulo} ${texto}`) ? 'apartamento' : /hotel/i.test(`${titulo} ${texto}`) ? 'hotel' : null;
    const estancia = (Date.parse(hasta) - Date.parse(desde)) / DIA_MS <= DIAS_ESTANCIA;
    const noches = Number(texto.match(/(\d+)\s+noches?/)?.[1]) || null;
    const etiqueta = limpiar(t.find('.badge__label').first().text());
    const imagen = t.find('img').attr('src');
    try {
      return [crearOferta({
        id: `${ID}:${idDe([titulo, desde, hasta, texto])}`,
        fuente: ID,
        tipo: alojamiento ? 'paquete' : 'actividad',
        // «Hotel + Forfait» se repite: lo que incluye («3 noches de hotel y 2 días de forfait») las distingue.
        titulo: `Grandvalira: ${titulo}${resumen(texto) && !normalizarTexto(titulo).includes(normalizarTexto(resumen(texto))) ? `, ${resumen(texto)}` : ''}`,
        descripcion: recortar(texto),
        url,
        imagen: imagen ? new URL(imagen, WEB).href : null,
        precio,
        precioTexto: `desde ${EUROS.format(precio)} € por persona${/persona\/noche/i.test(texto) ? ' y noche' : ''}`,
        unidad: /persona\/noche/i.test(texto) ? 'pp/noche' : 'pp',
        noches,
        alojamiento,
        temas: ['aventura'],
        transporte: 'coche',
        lugar: { ...LUGAR },
        fechas: estancia ? { salida: desde, vuelta: hasta } : {},
        // Un periodo largo vale hasta su último día; una estancia, hasta el día que empieza.
        caduca: finDelDia(estancia ? desde : hasta),
        etiquetas: ['Esquí', etiqueta].filter(Boolean),
      })];
    } catch (error) {
      log(`${titulo}: ${error.message}`);
      return [];
    }
  });
}

const esBloqueo = (error) => error.bloqueo || [403, 429].includes(error.estado);

async function obtener(ctx) {
  const porId = new Map();
  let leidas = 0;
  let ultimoError = null;
  for (const [i, url] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      const html = await ctx.http.texto(url, { reintentos: 0 });
      const ofertas = parsear(html, url, ctx);
      if (!ofertas && DESAFIO.test(html)) throw new Error('desafío anti-bot');
      // Fuera de temporada la página no tiene ofertas: no es un error (las guardadas caducan
      // solas por fecha). Si fuera un cambio de la web, lo avisa la revisión de lecturas.
      if (!ofertas) ctx.log(`${url}: sin ofertas ahora mismo`);
      for (const oferta of ofertas ?? []) if (!porId.has(oferta.id)) porId.set(oferta.id, oferta);
      leidas++;
    } catch (error) {
      ultimoError = error;
      ctx.log(`${url}: ${error.message}`);
      if (esBloqueo(error)) break;
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de ofertas de Grandvalira (último error: ${ultimoError?.message})`);
  return { ofertas: [...porId.values()], reemplazar: leidas === PAGINAS.length && porId.size > 0 };
}

export default {
  id: ID,
  nombre: 'Grandvalira',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS,
  obtener,
};
