/**
 * OUIGO España: promociones de la portada. Hay dos clases:
 *  - el banner de campaña («¡Nuevos billetes desde 9 €! Y desde 19 € entre MAD <> BAR»),
 *    con la fecha de apertura de la venta cuando la anuncia;
 *  - las tarjetas de trayecto («Madrid > Valencia · Mejor precio 9 €»), con enlace al
 *    calendario de precios desde una fecha concreta.
 * Los precios son por persona y trayecto (solo ida). Se prefieren las promociones
 * con Barcelona; si no hay ninguna, se devuelven todas.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { fechaLocal, diasEntre } from '../util/fechas.js';
import { parsearPrecio } from '../util/precio.js';
import { normalizarTexto, recortar } from '../util/xml.js';

const ID = 'ouigo';
const WEB = 'https://www.ouigo.com';
const PORTADA = `${WEB}/es/`;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|access denied/i;

/** Ciudades de OUIGO España: abreviaturas que usa la web, región y coordenadas del centro. */
const CIUDADES = [
  { nombre: 'Madrid', codigos: ['MAD'], region: 'Comunidad de Madrid', lat: 40.4168, lon: -3.7038 },
  { nombre: 'Barcelona', codigos: ['BAR', 'BCN'], region: 'Cataluña', lat: 41.3874, lon: 2.1686 },
  { nombre: 'Valencia', codigos: ['VAL', 'VLC'], region: 'Comunitat Valenciana', lat: 39.4699, lon: -0.3763 },
  { nombre: 'Zaragoza', codigos: ['ZAR', 'ZAZ'], region: 'Aragón', lat: 41.6488, lon: -0.8891 },
  { nombre: 'Tarragona', codigos: ['TAR', 'TGN'], region: 'Cataluña', lat: 41.1189, lon: 1.2445 },
  { nombre: 'Alicante', codigos: ['ALC'], region: 'Comunitat Valenciana', lat: 38.3452, lon: -0.481 },
  { nombre: 'Albacete', codigos: ['ALB'], region: 'Castilla-La Mancha', lat: 38.9943, lon: -1.8585 },
  { nombre: 'Sevilla', codigos: ['SEV', 'SVQ'], region: 'Andalucía', lat: 37.3891, lon: -5.9845 },
  { nombre: 'Málaga', codigos: ['MAL', 'AGP'], region: 'Andalucía', lat: 36.7213, lon: -4.4214 },
  { nombre: 'Córdoba', codigos: ['COR', 'ODB'], region: 'Andalucía', lat: 37.8882, lon: -4.7794 },
  { nombre: 'Valladolid', codigos: ['VLL'], region: 'Castilla y León', lat: 41.6523, lon: -4.7245 },
  { nombre: 'Murcia', codigos: ['MUR'], region: 'Región de Murcia', lat: 37.9922, lon: -1.1307 },
];
const ORIGEN = 'Barcelona';

const limpiar = (texto = '') => texto.replace(/\s+/g, ' ').trim();
const slug = (texto) => normalizarTexto(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Ciudad de OUIGO por nombre («Málaga», «malaga») o abreviatura («BAR»), o null. */
export function ciudad(texto) {
  const buscado = normalizarTexto(limpiar(texto));
  return CIUDADES.find((c) => normalizarTexto(c.nombre) === buscado || c.codigos.includes(buscado.toUpperCase())) ?? null;
}

/**
 * 'dd/mm' → 'YYYY-MM-DD', con el año más cercano a `ahora` (a menos de medio año).
 * @param {string} diaMes
 * @param {Date} ahora
 */
export function fechaDiaMes(diaMes, ahora) {
  const [dia, mes] = diaMes.split('/').map(Number);
  const hoy = fechaLocal(ahora);
  const anio = Number(hoy.slice(0, 4));
  const candidatas = [anio - 1, anio, anio + 1].map((a) => `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
  return candidatas.reduce((mejor, fecha) => (Math.abs(diasEntre(hoy, fecha)) < Math.abs(diasEntre(hoy, mejor)) ? fecha : mejor));
}

/** Fecha 'dd/mm' que captura `patron` en `texto`, como 'YYYY-MM-DD', o null. */
function fechaTras(texto, patron, ahora) {
  const diaMes = texto.match(patron)?.[1];
  return diaMes ? fechaDiaMes(diaMes, ahora) : null;
}

/**
 * Datos del banner de campaña: precio general, precios por trayecto, fechas de
 * apertura de la venta. null si no hay banner con precio.
 * @param {cheerio.CheerioAPI} $
 * @param {Date} ahora
 */
function datosBanner($, ahora) {
  const bloque = $('[data-block-type="banner_countdown"]').first();
  if (!bloque.length) return null;
  const textos = [...new Set(bloque.find('.counter_text, p').get().map((e) => limpiar($(e).text())))].filter(Boolean);
  const texto = textos.join(' ');
  const general = texto.match(/billetes desde (\d+(?:[.,]\d+)?)\s?€/i);
  const trayectos = [...texto.matchAll(/desde (\d+(?:[.,]\d+)?)\s?€\*? entre ([\p{L}]+)\s*(?:<>|↔|–|-|y)\s*([\p{L}]+)/giu)]
    .map(([, precio, a, b]) => ({ precio: parsearPrecio(precio), ciudades: [ciudad(a), ciudad(b)] }))
    .filter((t) => t.ciudades.every(Boolean));
  if (!general && !trayectos.length) return null;
  return {
    titulo: limpiar(bloque.find('.counter_text').first().text()).replace(/[^\p{L}\p{N}\s¡!:€*.,]/gu, '').replace(/\*/g, '').trim(),
    precio: general ? parsearPrecio(general[1]) : null,
    trayectos,
    aLaVenta: /ya a la venta/i.test(texto),
    ventaApp: fechaTras(texto, /el (\d{1,2}\/\d{1,2})[^()]*solo en la app/i, ahora),
    ventaWeb: fechaTras(texto, /en web el (\d{1,2}\/\d{1,2})/i, ahora),
  };
}

/** Tarjetas de trayecto con «Mejor precio». */
function datosTarjetas($) {
  return $('.stations-item__content').get().map((elemento) => {
    const tarjeta = $(elemento);
    const enlace = tarjeta.find('.price a').first();
    const href = enlace.attr('href') ?? '';
    return {
      id: tarjeta.attr('data-id') ?? null,
      desde: ciudad(tarjeta.find('.station-content__departure').text()),
      hasta: ciudad(tarjeta.find('.station-content__arrival').text()),
      lema: limpiar(tarjeta.find('.speed-type').text()),
      precio: parsearPrecio(limpiar(enlace.text()).replace(/^mejor precio/i, '')),
      url: href ? new URL(href, WEB).href : PORTADA,
      fecha: href ? new URL(href, WEB).searchParams.get('outboundDate') : null,
      imagen: tarjeta.closest('.stations-item').find('img').first().attr('src') ?? null,
    };
  });
}

const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const euros = (valor) => `${EUROS.format(valor)} €`;
const etiquetaFecha = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const frase = (texto) => (/[.!?]$/.test(texto) ? texto : `${texto}.`);

/** Lugar de la oferta: el extremo que no es Barcelona o, si no hay Barcelona, el destino. */
function lugarDe([desde, hasta]) {
  const destino = desde.nombre === ORIGEN ? hasta : hasta.nombre === ORIGEN ? desde : hasta;
  return { nombre: destino.nombre, region: destino.region, pais: 'España', codigoPais: 'ES', lat: destino.lat, lon: destino.lon, iata: null };
}

function textoVenta(banner) {
  if (banner.ventaApp && banner.ventaWeb) return `Venta desde el ${etiquetaFecha(banner.ventaApp)} en la app y el ${etiquetaFecha(banner.ventaWeb)} en la web.`;
  if (banner.ventaWeb) return `Venta desde el ${etiquetaFecha(banner.ventaWeb)}.`;
  return banner.aLaVenta ? 'Ya a la venta.' : '';
}

function ofertasBanner(banner) {
  if (!banner) return [];
  const apertura = banner.ventaWeb ?? banner.ventaApp;
  const prefijo = apertura ? `${ID}:promo:${apertura}` : `${ID}:promo`;
  const comunes = {
    fuente: ID,
    tipo: 'escapada',
    url: PORTADA,
    unidad: null,
    transporte: 'tren',
    publicada: apertura,
    etiquetas: ['OUIGO', 'tren', 'promoción', ...(banner.aLaVenta ? ['a la venta'] : []), ...(apertura ? [`venta:${apertura}`] : [])],
  };
  const venta = textoVenta(banner);
  const porTrayecto = banner.trayectos.map(({ precio, ciudades }) => {
    const [a, b] = [...ciudades].sort((x, y) => (x.nombre === ORIGEN ? -1 : y.nombre === ORIGEN ? 1 : 0));
    return {
      ...comunes,
      id: `${prefijo}:${slug(a.nombre)}-${slug(b.nombre)}`,
      titulo: `Tren OUIGO ${a.nombre} – ${b.nombre}: promoción desde ${euros(precio)}`,
      descripcion: recortar(`${frase(banner.titulo)} Billetes entre ${a.nombre} y ${b.nombre} desde ${euros(precio)} por trayecto. ${venta}`.trim()),
      precio,
      precioTexto: `desde ${euros(precio)} por persona y trayecto (solo ida)`,
      lugar: lugarDe([a, b]),
    };
  });
  const general = banner.precio == null ? [] : [{
    ...comunes,
    id: `${prefijo}:general`,
    titulo: `Tren OUIGO: nuevos billetes desde ${euros(banner.precio)}`,
    descripcion: recortar(`${frase(banner.titulo)} Billetes de alta velocidad desde ${euros(banner.precio)} por trayecto en la red de OUIGO España. ${venta}`.trim()),
    precio: banner.precio,
    precioTexto: `desde ${euros(banner.precio)} por persona y trayecto (solo ida)`,
    lugar: null,
  }];
  return [...porTrayecto, ...general];
}

function ofertaTarjeta(tarjeta) {
  const { desde, hasta } = tarjeta;
  if (!desde || !hasta || tarjeta.precio == null) throw new Error('trayecto o precio desconocido');
  const cuando = tarjeta.fecha ? ` (calendario desde el ${etiquetaFecha(tarjeta.fecha)})` : '';
  return {
    id: `${ID}:tarifa:${tarjeta.id ?? `${slug(desde.nombre)}-${slug(hasta.nombre)}`}`,
    fuente: ID,
    tipo: 'escapada',
    titulo: `Tren OUIGO ${desde.nombre} – ${hasta.nombre} desde ${euros(tarjeta.precio)}`,
    descripcion: recortar(`${tarjeta.lema ? `${tarjeta.lema} ` : ''}Mejor precio de ${desde.nombre} a ${hasta.nombre}: ${euros(tarjeta.precio)} por trayecto${cuando}.`),
    url: tarjeta.url,
    imagen: tarjeta.imagen,
    precio: tarjeta.precio,
    precioTexto: `mejor precio ${euros(tarjeta.precio)} por persona y trayecto (solo ida)`,
    unidad: null,
    transporte: 'tren',
    lugar: lugarDe([desde, hasta]),
    etiquetas: ['OUIGO', 'tren', 'mejor precio', ...(tarjeta.lema ? [tarjeta.lema] : [])],
  };
}

const conBarcelona = (oferta) => /barcelona/.test(oferta.id) || oferta.lugar === null;
const esTrayectoBarcelona = (oferta) => /barcelona/.test(oferta.id);

/**
 * Ofertas de la portada de OUIGO España. Si alguna promoción tiene origen o
 * destino Barcelona, se devuelven esas y las generales (sin trayecto); si no, todas.
 * @param {string} html
 * @param {{ahora?: Date, log?: (mensaje: string) => void}} [ctx]
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const $ = cheerio.load(html);
  const fabricas = [
    ...ofertasBanner(datosBanner($, ctx.ahora ?? new Date())).map((datos) => () => datos),
    ...datosTarjetas($).map((tarjeta) => () => ofertaTarjeta(tarjeta)),
  ];
  const ofertas = fabricas.flatMap((fabrica) => {
    try {
      return [crearOferta(fabrica())];
    } catch (error) {
      log(`Promoción descartada: ${error.message}`);
      return [];
    }
  });
  const unicas = [...new Map(ofertas.map((o) => [o.id, o])).values()];
  return unicas.some(esTrayectoBarcelona) ? unicas.filter(conBarcelona) : unicas;
}

async function obtener(ctx) {
  const html = await ctx.http.texto(PORTADA);
  const ofertas = parsear(html, ctx);
  if (!ofertas.length) {
    if (DESAFIO.test(html) && !html.includes('stations-item')) throw new Error('OUIGO ha devuelto un desafío anti-bot');
    throw new Error('No se ha encontrado ninguna promoción en la portada de OUIGO (¿ha cambiado la página?)');
  }
  return { ofertas, reemplazar: true };
}

export default {
  id: ID,
  nombre: 'OUIGO España',
  web: `${WEB}/es`,
  modo: 'html',
  requiere: [],
  urls: [PORTADA],
  obtener,
};
