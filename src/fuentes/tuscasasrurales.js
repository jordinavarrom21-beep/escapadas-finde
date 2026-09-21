/**
 * Tus Casas Rurales: casas rurales de Cataluña. Se leen los listados de las cuatro
 * provincias catalanas más dos zonas muy pedidas desde Barcelona (Pirineo catalán y
 * Montseny). Son páginas HTML servidas ya montadas, con 20 tarjetas por página.
 *
 * El precio es el mínimo por persona y noche que anuncia la tarjeta del listado
 * («Desde 30€ · persona/noche»), no el de una oferta ni el de unas fechas concretas:
 * por eso la unidad es `pp/noche`. El precio de cada oferta con fechas solo está en
 * la ficha de la casa y pedir cientos de fichas no sale a cuenta.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { parsearPrecio } from '../util/precio.js';
import { recortar } from '../util/xml.js';

const ID = 'tuscasasrurales';
const WEB = 'https://www.tuscasasrurales.com';
const PAGINAS = [
  `${WEB}/casas-rurales-barcelona.htm`,
  `${WEB}/casas-rurales-girona.htm`,
  `${WEB}/casas-rurales-lleida.htm`,
  `${WEB}/casas-rurales-tarragona.htm`,
  `${WEB}/casas-rurales-pirineo-catalan-z5.htm`,
  `${WEB}/casas-rurales-montseny-1117.htm`,
];
const PAUSA_MS = 2000;

const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|datadome|awswaf|access denied/i;
const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/** Cómo presenta la tarjeta la unidad del precio → unidad del contrato. */
const UNIDAD_POR_TEXTO = [
  { patron: /persona\s*\/\s*noche/i, unidad: 'pp/noche', texto: 'por persona y noche' },
  { patron: /noche/i, unidad: 'noche', texto: 'por alojamiento y noche' },
];

/**
 * Ofertas de una página de listado. Devuelve null si la página no trae ninguna
 * tarjeta (desafío anti-bot, página vacía o cambio de la web).
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const $ = cheerio.load(html);
  const tarjetas = $('article.cont-gr-ficha[data-id]');
  if (!tarjetas.length) return null;
  return tarjetas
    .map((_, elemento) => $(elemento))
    .get()
    .flatMap((tarjeta) => {
      const datos = datosDeTarjeta(tarjeta, $);
      try {
        return [ofertaDe(datos)];
      } catch (error) {
        log(`Casa descartada (${datos.id || 'sin id'}): ${error.message}`);
        return [];
      }
    });
}

/** Campos crudos de una tarjeta del listado, ya en texto plano. */
function datosDeTarjeta(tarjeta, $) {
  const enlace = tarjeta.find('.ficha-titulo a').first();
  return {
    id: tarjeta.attr('data-id') ?? '',
    titulo: limpiar(enlace.text()),
    url: limpiar(enlace.attr('href')),
    descripcion: limpiar(tarjeta.find('.ficha-parrafo').first().text()),
    imagen: limpiar(tarjeta.find('.ficha-imagen img').first().attr('src')),
    ciudad: limpiar(tarjeta.find('.ficha-ciudad').first().text()),
    provincia: limpiar(tarjeta.find('.ficha-provincia').first().text()),
    alquiler: limpiar(tarjeta.find('.ficha-tipo-alquiler').first().text()),
    precio: limpiar(tarjeta.find('.ficha-precio').first().text()),
    unidad: limpiar(tarjeta.find('.ficha-pers-noche').first().text()),
    nota: limpiar(tarjeta.find('.ficha-nota').first().text()),
    opiniones: limpiar(tarjeta.find('.ficha-opiniones').first().text()),
    caracteristicas: tarjeta.find('.ficha-lista-caract li').map((_, li) => limpiar($(li).text())).get(),
  };
}

function ofertaDe(datos) {
  if (!datos.id || !datos.url) throw new Error('sin identificador o sin enlace');
  const { precio, precioTexto, unidad } = precioDe(datos);
  return crearOferta({
    id: `${ID}:${datos.id}`,
    fuente: ID,
    tipo: 'hotel',
    titulo: datos.titulo,
    descripcion: recortar(datos.descripcion),
    url: new URL(datos.url, `${WEB}/`).href,
    imagen: datos.imagen ? new URL(datos.imagen, `${WEB}/`).href : null,
    precio,
    precioTexto,
    unidad,
    regimen: esAlquilerIntegro(datos.alquiler) ? 'solo-alojamiento' : null,
    alojamiento: 'casa-rural',
    temas: ['rural'],
    valoracion: valoracionDe(datos),
    lugar: {
      nombre: municipio(datos.ciudad) || datos.provincia,
      region: datos.provincia || null,
      pais: 'España',
      codigoPais: 'ES',
      lat: null,
      lon: null,
    },
    etiquetas: ['Casa rural', datos.alquiler, ...datos.caracteristicas].filter(Boolean),
  });
}

/**
 * Precio, texto y unidad a partir de lo que pone la tarjeta: «Desde 30€» + «persona/noche».
 * @param {{precio: string, unidad: string}} datos
 */
export function precioDe(datos) {
  const importe = parsearPrecio(datos.precio);
  const forma = UNIDAD_POR_TEXTO.find(({ patron }) => patron.test(datos.unidad));
  if (!(importe > 0) || !forma) return { precio: null, precioTexto: '', unidad: null };
  return { precio: importe, precioTexto: `desde ${EUROS.format(importe)} € ${forma.texto}`, unidad: forma.unidad };
}

/** Casa entera y sin servicios: como en el resto de fuentes rurales, «solo alojamiento». */
const esAlquilerIntegro = (alquiler) => /^alquiler íntegro/i.test(alquiler) && !/habitaciones/i.test(alquiler);

/** La web puntúa sobre 10 («9,0») y enseña el número de opiniones junto a la nota. */
function valoracionDe({ nota, opiniones }) {
  const puntos = parsearPrecio(nota);
  const cuantas = Number.parseInt(opiniones, 10);
  return puntos > 0 && cuantas > 0 ? { nota: puntos, n: cuantas } : null;
}

/** «Borreda (Berguedá)» → «Borreda»: el paréntesis es la comarca y estorba al geocodificar. */
const municipio = (ciudad) => ciudad.replace(/\s*\([^)]*\)\s*$/, '').trim();

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();

function deduplicar(ofertas) {
  const vistas = new Set();
  return ofertas.filter((oferta) => !vistas.has(oferta.id) && vistas.add(oferta.id));
}

function leerPagina(html, ctx) {
  const ofertas = parsear(html, ctx);
  if (ofertas) return ofertas;
  if (DESAFIO.test(html)) throw Object.assign(new Error('Tus Casas Rurales ha devuelto un desafío anti-bot'), { bloqueo: true });
  throw new Error('la página no trae ninguna tarjeta de casa (¿ha cambiado la web?)');
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
        ctx.log('Tus Casas Rurales ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de Tus Casas Rurales (último error: ${ultimoError.message})`);
  // Solo es la primera página de cada listado: las casas que dejan de salir caducan por retencionDias.
  return { ofertas: deduplicar(ofertas) };
}

export default {
  id: ID,
  nombre: 'Tus Casas Rurales',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS,
  obtener,
};
