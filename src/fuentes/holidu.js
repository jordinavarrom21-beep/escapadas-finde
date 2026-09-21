/**
 * Holidu: apartamentos y casas de vacaciones. Se leen sus páginas de destino
 * (`/alquileres-vacacionales/espana/<destino>`), que el servidor sirve ya montadas
 * con las tarjetas de oferta. El buscador (`/s/…`) no hace falta y `/redirect/` está
 * prohibido en robots.txt, así que no se piden.
 *
 * Cada página trae dos formas de precio y las dos se respetan tal cual:
 * - «desde 106 € por noche»: precio mínimo por ALOJAMIENTO (no por persona) y noche,
 *   sin fechas concretas → `unidad: 'noche'`.
 * - Las tarjetas de «Ofertas actuales» llevan el precio TOTAL de una estancia con
 *   fechas («128 € · lun, 28/9 - mié, 30/9») → `unidad: 'total'`, con `noches` y
 *   `fechas`, y el % de descuento cuando la web lo dice.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { diaSemana, diasEntre, fechaLocal } from '../util/fechas.js';
import { extraerPrecio } from '../util/precio.js';
import { normalizarTexto, recortar } from '../util/xml.js';

const ID = 'holidu';
const WEB = 'https://www.holidu.es';
const DESTINOS = ['costa-brava', 'costa-dorada', 'pirineos', 'cataluna', 'barcelona', 'provincia-de-lerida'];
const PAGINAS = DESTINOS.map((destino) => `${WEB}/alquileres-vacacionales/espana/${destino}`);
const PAUSA_MS = 2000;

const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|datadome|awswaf|access denied/i;
const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/**
 * Bloques de la página con un tema claro (la categoría va en el `data-testid` de la
 * tarjeta): «Alquileres vacacionales con vistas al mar» y «…con vistas a la montaña».
 * Los demás bloques son listados generales y no dicen nada del tema.
 */
const TEMAS_POR_CATEGORIA = { VIEW_SEA: ['playa'], VIEW_MOUNTAIN: ['rural'] };

/** «lun, 28/9 - mié, 30/9»: día de la semana abreviado, día y mes, sin año. */
const RANGO_FECHAS = /^([a-zá-ú]{3,4})\.?,\s*(\d{1,2})\/(\d{1,2})\s*[-–]\s*([a-zá-ú]{3,4})\.?,\s*(\d{1,2})\/(\d{1,2})$/i;
const DIAS_SEMANA = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
const DESCUENTO = /descuento\s+(?:del?|de)\s+(\d{1,2})\s*%/i;

/**
 * Ofertas de una página de destino. Devuelve null si no trae ninguna tarjeta
 * (desafío anti-bot o cambio de la web).
 * @param {string} html
 * @param {{ahora?: Date, log?: (mensaje: string) => void}} [ctx]
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const hoy = fechaLocal(ctx.ahora ?? new Date());
  const $ = cheerio.load(html);
  const tarjetas = $('div[data-offerid]');
  if (!tarjetas.length) return null;
  return tarjetas
    .map((_, elemento) => $(elemento))
    .get()
    .flatMap((tarjeta) => {
      const datos = datosDeTarjeta(tarjeta, $);
      try {
        return [ofertaDe(datos, hoy)];
      } catch (error) {
        log(`Alojamiento descartado (${datos.id || 'sin id'}): ${error.message}`);
        return [];
      }
    });
}

/** Campos crudos de una tarjeta de oferta, ya en texto plano. */
function datosDeTarjeta(tarjeta, $) {
  const sitio = tarjeta.find('p[title]').first();
  return {
    id: tarjeta.attr('data-offerid') ?? '',
    categoria: (tarjeta.attr('data-testid') ?? '').replace(/^Offer__/, ''),
    titulo: limpiar(tarjeta.find('h3').first().text()),
    imagen: limpiar(tarjeta.find('img').first().attr('src')),
    lugar: limpiar(sitio.attr('title')),
    nota: limpiar(tarjeta.find('.StarRatingShow-Wrapper').first().text()),
    precio: limpiar(tarjeta.find('[data-testid^="Offer__Price"]').first().text()),
    // Nombre de la promoción («Oferta anticipada»…); su explicación va en un aviso emergente.
    promocion: limpiar(tarjeta.find('[data-testid^="Offer__Price"] span.underline').first().text()),
    // El resto de párrafos son los avisos de la tarjeta: fechas, «Cancelación gratuita»…
    avisos: tarjeta.find('p').not(sitio).map((_, p) => limpiar($(p).text())).get().filter(Boolean),
  };
}

function ofertaDe(datos, hoy) {
  if (!datos.id) throw new Error('sin identificador');
  const fechas = fechasDe(datos.avisos, hoy);
  const noches = fechas ? diasEntre(fechas.salida, fechas.vuelta) : null;
  const { precio, precioTexto, unidad } = precioDe(datos.precio, noches);
  const [nombre, region] = partirLugar(datos.lugar);
  return crearOferta({
    id: `${ID}:${datos.id}`,
    fuente: ID,
    tipo: 'hotel',
    titulo: datos.titulo || `Alojamiento en ${nombre || 'Holidu'}`,
    descripcion: recortar([datos.titulo, datos.lugar].filter(Boolean).join(' · ')),
    url: `${WEB}/d/${datos.id}`,
    imagen: datos.imagen || null,
    precio,
    precioTexto,
    unidad,
    descuento: descuentoDe(datos.precio),
    noches: noches > 0 ? noches : null,
    alojamiento: 'apartamento',
    temas: TEMAS_POR_CATEGORIA[datos.categoria] ?? [],
    valoracion: valoracionDe(datos.nota),
    fechas,
    lugar: nombre ? { nombre, region, pais: 'España', codigoPais: 'ES', lat: null, lon: null } : null,
    etiquetas: etiquetasDe(datos),
  });
}

/**
 * Precio de la tarjeta. «desde 106 € por noche» es por alojamiento y noche; si no,
 * el importe es el total de la estancia que anuncia la tarjeta.
 * @param {string} texto contenido de la caja de precio
 * @param {number|null} noches noches de la estancia, si la tarjeta trae fechas
 */
export function precioDe(texto, noches = null) {
  const importe = extraerPrecio(texto);
  if (!(importe > 0)) return { precio: null, precioTexto: '', unidad: null };
  if (/^desde\b/i.test(texto) && /por noche/i.test(texto)) {
    return { precio: importe, precioTexto: `desde ${EUROS.format(importe)} € por alojamiento y noche`, unidad: 'noche' };
  }
  const estancia = noches > 0 ? `, ${noches} ${noches === 1 ? 'noche' : 'noches'}` : '';
  return { precio: importe, precioTexto: `${EUROS.format(importe)} € en total${estancia}`, unidad: 'total' };
}

/** Fechas de la estancia si algún aviso de la tarjeta es un rango «lun, 28/9 - mié, 30/9». */
function fechasDe(avisos, hoy) {
  for (const aviso of avisos) {
    const trozos = RANGO_FECHAS.exec(aviso);
    if (!trozos) continue;
    const salida = fechaConAnio(trozos[1], trozos[2], trozos[3], hoy);
    let vuelta = fechaConAnio(trozos[4], trozos[5], trozos[6], hoy);
    if (vuelta < salida) vuelta = fechaConAnio(trozos[4], trozos[5], trozos[6], `${Number(hoy.slice(0, 4)) + 1}${hoy.slice(4)}`);
    return vuelta > salida ? { salida, vuelta } : null;
  }
  return null;
}

/**
 * Completa el año que la web no escribe: de los años vecinos se queda con los que
 * caen en el día de la semana que dice la tarjeta y, de esos, con el más cercano a hoy.
 * @param {string} dia abreviatura del día («lun», «mié»…)
 * @param {string|number} numero día del mes
 * @param {string|number} mes
 * @param {string} hoy 'YYYY-MM-DD'
 * @returns {string} 'YYYY-MM-DD'
 */
export function fechaConAnio(dia, numero, mes, hoy) {
  const anio = Number(hoy.slice(0, 4));
  const candidatos = [anio - 1, anio, anio + 1]
    .map((a) => `${a}-${dosCifras(mes)}-${dosCifras(numero)}`)
    .filter((iso) => !Number.isNaN(Date.parse(iso)));
  const esperado = DIAS_SEMANA[normalizarTexto(dia)];
  const encajan = candidatos.filter((iso) => diaSemana(iso) === esperado);
  const lista = encajan.length ? encajan : candidatos;
  return lista.reduce((mejor, iso) => (Math.abs(diasEntre(hoy, iso)) < Math.abs(diasEntre(hoy, mejor)) ? iso : mejor));
}

const dosCifras = (numero) => String(Number(numero)).padStart(2, '0');

/** «Torroella de Montgrí, Baix Empordà» → municipio y comarca o región. */
function partirLugar(lugar) {
  const [nombre = '', ...resto] = lugar.split(',').map((trozo) => trozo.trim());
  return [nombre, resto.join(', ') || null];
}

/** Holidu puntúa sobre 10 («8,7»); la tarjeta no dice cuántas opiniones hay. */
function valoracionDe(nota) {
  const puntos = Number(String(nota).replace(',', '.'));
  return Number.isFinite(puntos) && puntos > 0 ? { nota: puntos, n: 0 } : null;
}

function descuentoDe(texto) {
  const porcentaje = Number(DESCUENTO.exec(texto)?.[1]);
  return porcentaje > 0 && porcentaje < 100 ? porcentaje : null;
}

const etiquetasDe = (datos) =>
  [...datos.avisos.filter((aviso) => !RANGO_FECHAS.test(aviso)), datos.promocion].filter(Boolean);

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();

function deduplicar(ofertas) {
  const vistas = new Set();
  return ofertas.filter((oferta) => !vistas.has(oferta.id) && vistas.add(oferta.id));
}

function leerPagina(html, ctx) {
  const ofertas = parsear(html, ctx);
  if (ofertas) return ofertas;
  if (DESAFIO.test(html)) throw Object.assign(new Error('Holidu ha devuelto un desafío anti-bot'), { bloqueo: true });
  throw new Error('la página no trae ninguna tarjeta de alojamiento (¿ha cambiado la web?)');
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
        ctx.log('Holidu ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de Holidu (último error: ${ultimoError.message})`);
  // Cada destino enseña una selección, no su catálogo: lo que deja de salir caduca por retencionDias.
  return { ofertas: deduplicar(ofertas) };
}

export default {
  id: ID,
  nombre: 'Holidu',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS,
  obtener,
};
